import cv2
import numpy as np
from rembg import remove, new_session
from PIL import Image
import io

class BatchBGEngine:
    def __init__(self):
        print("Initializing BatchBG Engine V3 (Matting Pipeline)...")
        self.session = None

    def _get_session(self):
        if self.session is None:
            print("Lazy loading 'isnet-general-use' model (High Quality)...")
            self.session = new_session("isnet-general-use")
        return self.session

    def process_image(self, image_bytes, task="REMOVE_BG", instruction=None):
        print(f"[Engine] Processing task: '{task}' with instruction: '{instruction}'")
        
        # Decode input to BGR
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        
        if img is None:
            print("[Engine] Error: Could not decode image")
            raise ValueError("Could not decode image")

        # Resize for performance (Matting is expensive)
        # 1500 is a good balance for quality.
        max_dim = 1500 
        h, w = img.shape[:2]
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            print(f"[Engine] Resizing input from {w}x{h} to {new_w}x{new_h} for memory safety")
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

        if task == "REMOVE_BG":
            return self.guided_matting_pipeline(img)
            
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

    def guided_matting_pipeline(self, img_bgr):
        """
        V3: Coarse-to-Fine Matting Pipeline
        1. Coarse Mask (Encoder): u2net/isnet via rembg.
        2. Trimap Generation: Erode (FG) vs Dilate (BG) -> Unknown Region.
        3. Guided Filter: Refine alpha in the Unknown Region.
        """
        
        # Prepare input for rembg
        # If input has alpha, drop it for the detection phase
        if img_bgr.shape[2] == 4:
            src_bgr = img_bgr[:, :, :3]
        else:
            src_bgr = img_bgr

        # 1. Coarse Mask (Inference)
        # Reverting CLAHE as it confused the model on shiny surfaces (black metal became white).
        success, encoded_src = cv2.imencode('.png', src_bgr)
        input_bytes = encoded_src.tobytes()
        
        # Run standard rembg
        output_bytes = remove(input_bytes, session=self._get_session())
        
        nparr = np.frombuffer(output_bytes, np.uint8)
        rembg_output = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        
        if rembg_output is None or rembg_output.shape[2] < 4:
            print("[Engine] Warning: rembg failed to produce alpha")
            coarse_alpha = 255 * np.ones(src_bgr.shape[:2], dtype=np.uint8)
        else:
            coarse_alpha = rembg_output[:, :, 3]

        # REFINED STRATEGY 6: "Overshoot & Refine"
        # Problem: The black product is getting eaten (mask is too small).
        # Solution: 
        # 1. Be extremely permissive with the Threshold (if AI sees > 1/255, keep it).
        # 2. DILATE (Grow) the mask to cover the missing edges.
        # 3. Use Guided Filter to cut back the excess based on color difference.
        
        # A. Extremely Low Threshold
        # Keep everything. Even faint shadows? Yes, Matting will fix shadows later.
        _, solid_mask = cv2.threshold(coarse_alpha, 1, 255, cv2.THRESH_BINARY)
        
        # B. Aggressive Hole Filling
        # Kernel 5x5 (Reduced from 21x21).
        # We want to fill "noise" holes, but NOT structural holes like the grille vents.
        close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        solid_mask = cv2.morphologyEx(solid_mask, cv2.MORPH_CLOSE, close_kernel)
        
        # C. OVERSHOOT (Dilate)
        # Grow the object to recover the "bitten" black edges.
        dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        solid_mask = cv2.dilate(solid_mask, dilate_kernel, iterations=2)
        
        # Update coarse_alpha
        coarse_alpha = solid_mask

        # 2. Trimap Generation
        # Now we have an OVERSIZED solid block.
        # We need the Trimap to cover the transition from Object -> Background.
        k_size = 10
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))
        
        # Dilate -> Definite BG boundary (Outer limit)
        dilated = cv2.dilate(coarse_alpha, kernel, iterations=1)
        
        # Erode -> Definite FG boundary (Inner core)
        eroded = cv2.erode(coarse_alpha, kernel, iterations=2)
        
        # Trimap: Unknown region
        unknown_mask = cv2.bitwise_xor(dilated, eroded)
        
        # If the unknown area is too small, just return coarse alpha (optimization)
        if cv2.countNonZero(unknown_mask) < 100:
             print("[Engine] Edge clean enough, skipping Guided Filter.")
             final_alpha = coarse_alpha
        else:
            # 3. Guided Filter Refinement
            # Normalize to 0-1 float
            guide = src_bgr.astype(np.float32) / 255.0
            src_alpha_f = coarse_alpha.astype(np.float32) / 255.0
            
            # Parameters for Guided Filter
            radius = 20
            eps = 1e-6
            
            refined_alpha = self.fast_guided_filter(guide, src_alpha_f, radius, eps)
            refined_alpha = np.clip(refined_alpha * 255, 0, 255).astype(np.uint8)
            
            # 4. Composite: Keep Definite FG/BG, replace only Unknown
            # Start with refined
            final_alpha = refined_alpha
            
            # Force Definite FG (restore solidity)
            # Use the eroded (Solid Core) to overwrite the center
            np.putmask(final_alpha, eroded > 0, 255)
            
            # Force Definite BG
            np.putmask(final_alpha, dilated == 0, 0)

        # Merge
        b, g, r = cv2.split(src_bgr)
        rgba_final = cv2.merge([b, g, r, final_alpha])
        
        return self.layout_on_white(rgba_final)

    def fast_guided_filter(self, I, p, r, eps):
        """
        O(N) Fast Guided Filter implementation using OpenCV boxFilter.
        I: Guide image (normalized float)
        p: Input image (mask) (normalized float)
        r: Radius
        eps: Epsilon regularization
        """
        # Resize for speed (Fast Guided Filter)
        # s = 0.5 (subsampling)
        h, w = p.shape[:2]
        h_s, w_s = int(h/2), int(w/2)
        I_sub = cv2.resize(I, (w_s, h_s), interpolation=cv2.INTER_NEAREST)
        p_sub = cv2.resize(p, (w_s, h_s), interpolation=cv2.INTER_NEAREST)
        r_sub = int(r / 2)

        mean_I = cv2.boxFilter(I_sub, cv2.CV_32F, (r_sub, r_sub))
        mean_p = cv2.boxFilter(p_sub, cv2.CV_32F, (r_sub, r_sub))
        mean_Ip = cv2.boxFilter(I_sub * p_sub[:,:,None], cv2.CV_32F, (r_sub, r_sub)) # I is color, p is single
        # Fix dimensions: p is (H,W), I is (H,W,3). 
        # Actually standard GF assumes Is is grayscale or handles multi-channel guide separately.
        # For simplicity and color-edge awareness, let's use Grayscale Guide or average covariance.
        
        # Color Guided Filter is complex to write from scratch in 10 lines.
        # Let's use Grayscale Guide for stability and speed.
        I_gray_sub = cv2.cvtColor(I_sub, cv2.COLOR_BGR2GRAY)
        
        mean_I = cv2.boxFilter(I_gray_sub, cv2.CV_32F, (r_sub, r_sub))
        mean_p = cv2.boxFilter(p_sub, cv2.CV_32F, (r_sub, r_sub))
        mean_Ip = cv2.boxFilter(I_gray_sub * p_sub, cv2.CV_32F, (r_sub, r_sub))
        mean_II = cv2.boxFilter(I_gray_sub * I_gray_sub, cv2.CV_32F, (r_sub, r_sub))

        cov_Ip = mean_Ip - mean_I * mean_p
        var_I = mean_II - mean_I * mean_I

        a = cov_Ip / (var_I + eps)
        b = mean_p - a * mean_I

        mean_a = cv2.boxFilter(a, cv2.CV_32F, (r_sub, r_sub))
        mean_b = cv2.boxFilter(b, cv2.CV_32F, (r_sub, r_sub))

        # Upsample
        mean_a = cv2.resize(mean_a, (w, h), interpolation=cv2.INTER_LINEAR)
        mean_b = cv2.resize(mean_b, (w, h), interpolation=cv2.INTER_LINEAR)
        
        # Guide needs to be gray here too for the linear apply
        I_gray = cv2.cvtColor(I, cv2.COLOR_BGR2GRAY)
        q = mean_a * I_gray + mean_b
        return q

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
