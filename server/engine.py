import cv2
import numpy as np
from rembg import remove, new_session
from PIL import Image
import io

class BatchBGEngine:
    def __init__(self):
        print("Initializing BatchBG Engine...")
        self.session = None

    def _get_session(self):
        if self.session is None:
            print("Lazy loading 'u2netp' model...")
            self.session = new_session("u2netp")
        return self.session

    def process_image(self, image_bytes, task="REMOVE_BG", instruction=None):
        print(f"[Engine] Processing task: '{task}' with instruction: '{instruction}'")
        
        # Decode input
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        
        if img is None:
            print("[Engine] Error: Could not decode image")
            raise ValueError("Could not decode image")

        # Resize if too large (protect memory)
        max_dim = 800
        h, w = img.shape[:2]
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            print(f"[Engine] Resizing input from {w}x{h} to {new_w}x{new_h} for memory safety")
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            # Update image_bytes for remove_background
            success, encoded = cv2.imencode('.png', img)
            if success:
                image_bytes = encoded.tobytes()

        if task == "REMOVE_BG":
            # Pass (possibly resized) bytes
            return self.remove_background(image_bytes, is_bytes=True)
            
        elif task == "EDIT":
            print(f"[Engine] Applying edit: {instruction}")
            if instruction.startswith("brightness"):
                return self.adjust_brightness(img, instruction_val=instruction)
            elif instruction.startswith("saturation"):
                return self.adjust_saturation(img, instruction_val=instruction)
            elif instruction.startswith("contrast"):
                return self.adjust_contrast(img, instruction_val=instruction)
            elif instruction == "shadow":
                return self.add_shadow(img)
            else:
                print(f"[Engine] Unknown instruction: {instruction}")
            
        print("[Engine] No matching task, returning original")
        return self._encode_result(img)

    def remove_background(self, input_data, is_bytes=False):
        print("[Engine] Starting background removal...")
        input_bytes = input_data
        if not is_bytes:
            print("[Engine] Encoding input to bytes (fallback)...")
            success, encoded = cv2.imencode('.png', input_data)
            input_bytes = encoded.tobytes()
        
        try:
            output_bytes = remove(input_bytes, session=self._get_session())
            print("[Engine] rembg Inference complete.")
        except Exception as e:
            print(f"[Engine] Error during rembg inference: {e}")
            raise e

        # Decode for Post-Processing
        nparr = np.frombuffer(output_bytes, np.uint8)
        rgba = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        
        if rgba is None:
             raise ValueError("Failed to decode rembg output")
             
        # Extract Alpha
        if rgba.shape[2] < 4:
            print("[Engine] Warning: output has no alpha channel")
            alpha = np.full(rgba.shape[:2], 255, dtype=np.uint8)
            rgba = cv2.cvtColor(rgba, cv2.COLOR_BGR2BGRA)
        else:
            alpha = rgba[:, :, 3]

        # Shadow Stripping
        _, binary_mask = cv2.threshold(alpha, 230, 255, cv2.THRESH_BINARY)
        alpha_final = cv2.GaussianBlur(binary_mask, (3, 3), 0)
        
        b, g, r, a_orig = cv2.split(rgba)
        rgba_clean = cv2.merge([b, g, r, alpha_final])
        
        # Auto-Layout
        return self.layout_on_white(rgba_clean)

    def layout_on_white(self, cropped_rgba):
        # Find Bounding Box
        alpha = cropped_rgba[:, :, 3]
        coords = cv2.findNonZero(alpha)
        if coords is None:
             print("[Engine] No foreground detected, returning white canvas.")
             final_canvas = np.full((2048, 2048, 3), 255, dtype=np.uint8)
             return self._encode_result(final_canvas)

        x, y, w, h = cv2.boundingRect(coords)
        cropped = cropped_rgba[y:y+h, x:x+w]
        
        # Scale to 80% of 2048
        target_size = 2048
        padding_ratio = 0.8
        max_dim = int(target_size * padding_ratio)
        
        h_c, w_c = cropped.shape[:2]
        if h_c == 0 or w_c == 0:
             final_canvas = np.full((2048, 2048, 3), 255, dtype=np.uint8)
             return self._encode_result(final_canvas)

        scale = max_dim / max(h_c, w_c)
        new_w, new_h = int(w_c * scale), int(h_c * scale)
        
        resized = cv2.resize(cropped, (new_w, new_h), interpolation=cv2.INTER_AREA)
        
        # Create Canvas (White)
        canvas = np.full((target_size, target_size, 3), 255, dtype=np.uint8)
        
        # Centering
        start_x = (target_size - new_w) // 2
        start_y = (target_size - new_h) // 2
        
        # Alpha Compositing
        fg_alpha = resized[:, :, 3] / 255.0
        fg_color = resized[:, :, 0:3]
        
        end_y = min(start_y + new_h, target_size)
        end_x = min(start_x + new_w, target_size)
        
        bg_slice = canvas[start_y:end_y, start_x:end_x]
        
        fg_h, fg_w = bg_slice.shape[:2]
        if fg_h != new_h or fg_w != new_w:
            fg_alpha = fg_alpha[:fg_h, :fg_w]
            fg_color = fg_color[:fg_h, :fg_w]
            
        for c in range(3):
            bg_slice[:, :, c] = (fg_color[:, :, c] * fg_alpha + bg_slice[:, :, c] * (1 - fg_alpha))
            
        canvas[start_y:end_y, start_x:end_x] = bg_slice
        
        return self._encode_result(canvas)

    def adjust_brightness(self, img, instruction_val=None):
        print(f"[Engine] Adjusting Brightness... Validation: {instruction_val}")
        
        # Parse factor from instruction string "brightness:1.5" or just "brightness"
        factor = 1.2 # Default boost
        if instruction_val and ":" in instruction_val:
            try:
                val_str = instruction_val.split(":")[1]
                factor = float(val_str)
            except ValueError:
                print(f"[Engine] Invalid brightness value: {instruction_val}")

        print(f"[Engine] Applying brightness factor: {factor}")

        # Handle Alpha
        has_alpha = False
        alpha = None
        if img.shape[2] == 4:
            has_alpha = True
            b, g, r, alpha = cv2.split(img)
            img_bgr = cv2.merge([b, g, r])
        else:
            img_bgr = img

        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)
        
        # Multiply V by factor
        # v is uint8 (0-255). We need to convert to float to prevent overflow then clip.
        v_float = v.astype(np.float32)
        v_float = v_float * factor
        v_float = np.clip(v_float, 0, 255)
        v = v_float.astype(np.uint8)
        
        final_hsv = cv2.merge((h, s, v))
        final_bgr = cv2.cvtColor(final_hsv, cv2.COLOR_HSV2BGR)
        
        if has_alpha:
            b, g, r = cv2.split(final_bgr)
            final_img = cv2.merge([b, g, r, alpha])
        else:
            final_img = final_bgr
            
        return self._encode_result(final_img)

    def adjust_saturation(self, img, instruction_val=None):
        print(f"[Engine] Adjusting Saturation... {instruction_val}")
        factor = 1.2
        if instruction_val and ":" in instruction_val:
            try:
                factor = float(instruction_val.split(":")[1])
            except:
                pass

        # Handle Alpha
        has_alpha = False
        alpha = None
        if img.shape[2] == 4:
            has_alpha = True
            b, g, r, alpha = cv2.split(img)
            img_bgr = cv2.merge([b, g, r])
        else:
            img_bgr = img

        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)
        
        # Multiply S by factor
        s_float = s.astype(np.float32)
        s_float = s_float * factor
        s_float = np.clip(s_float, 0, 255)
        s = s_float.astype(np.uint8)
        
        final_hsv = cv2.merge((h, s, v))
        final_bgr = cv2.cvtColor(final_hsv, cv2.COLOR_HSV2BGR)
        
        if has_alpha:
            b, g, r = cv2.split(final_bgr)
            final_img = cv2.merge([b, g, r, alpha])
        else:
            final_img = final_bgr
            
        return self._encode_result(final_img)

    def adjust_contrast(self, img, instruction_val=None):
        print(f"[Engine] Adjusting Contrast... {instruction_val}")
        factor = 1.2
        if instruction_val and ":" in instruction_val:
            try:
                factor = float(instruction_val.split(":")[1])
            except:
                pass
                
        # Handle Alpha
        has_alpha = False
        alpha = None
        if img.shape[2] == 4:
            has_alpha = True
            b, g, r, alpha = cv2.split(img)
            img_bgr = cv2.merge([b, g, r])
        else:
            img_bgr = img

        # Apply contrast using convertScaleAbs
        # new_image = alpha * old_image + beta
        # We assume factor is alpha (contrast control). beta is brightness (0 here)
        final_bgr = cv2.convertScaleAbs(img_bgr, alpha=factor, beta=0)

        if has_alpha:
            b, g, r = cv2.split(final_bgr)
            final_img = cv2.merge([b, g, r, alpha])
        else:
            final_img = final_bgr
            
        return self._encode_result(final_img)

    def add_shadow(self, img):
        print("[Engine] Adding Shadow...")
        
        # Determine Mask
        if img.shape[2] == 4:
            # Use Alpha if available
            alpha = img[:, :, 3]
            # Binarize alpha
            _, mask = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)
        else:
            # Fallback to white background logic
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, mask = cv2.threshold(gray, 250, 255, cv2.THRESH_BINARY_INV)
        
        if cv2.countNonZero(mask) == 0:
            print("[Engine] Warning: No object found for shadow")
            return self._encode_result(img)

        # Blur the mask to create soft shadow
        shadow_blur = cv2.GaussianBlur(mask, (31, 31), 0)
        
        h, w = img.shape[:2]
        shadow_layer = np.zeros((h, w, 4), dtype=np.uint8)
        
        # Shadow color black
        shadow_layer[:, :, 0] = 0
        shadow_layer[:, :, 1] = 0
        shadow_layer[:, :, 2] = 0
        
        # Opacity
        shadow_layer[:, :, 3] = (shadow_blur * 0.3).astype(np.uint8)
        
        # Shift
        M = np.float32([[1, 0, 20], [0, 1, 20]]) 
        shadow_layer = cv2.warpAffine(shadow_layer, M, (w, h))

        # Composite
        # Create base canvas (White)
        canvas = np.full((h, w, 3), 255, dtype=np.uint8)
        
        # Blend shadow onto canvas
        s_alpha = shadow_layer[:, :, 3] / 255.0
        s_color = shadow_layer[:, :, 0:3]
        
        for c in range(3):
            canvas[:, :, c] = (s_color[:, :, c] * s_alpha + canvas[:, :, c] * (1 - s_alpha))
            
        # Blend Object onto canvas
        # Ensure mask is 0 or 1
        obj_mask = (mask > 0).astype(np.uint8)
        
        # If input image has 4 channels, we need to extract BGR for compositing
        if img.shape[2] == 4:
            img_bgr = img[:, :, :3]
        else:
            img_bgr = img
            
        for c in range(3):
            # If obj_mask is 1, take img_bgr. If 0, take canvas.
            canvas[:, :, c] = img_bgr[:, :, c] * obj_mask + canvas[:, :, c] * (1 - obj_mask)
            
        return self._encode_result(canvas)

    def _encode_result(self, img_bgr):
        success, encoded_img = cv2.imencode('.png', img_bgr)
        return encoded_img.tobytes()

engine = BatchBGEngine()
