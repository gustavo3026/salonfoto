
import cv2
import numpy as np
from engine import engine
import io

def verify():
    # Create a dummy image: Red square on Blue background
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    img[:] = [255, 0, 0] # Blue background
    img[25:75, 25:75] = [0, 0, 255] # Red square (object)
    
    success, encoded = cv2.imencode('.png', img)
    input_bytes = encoded.tobytes()
    
    print("Processing image...")
    # This might fail if rembg model is not downloaded, but let's try.
    # The server might already have it or it will download it.
    try:
        output_bytes = engine.process_image(input_bytes, task="REMOVE_BG")
        
        nparr = np.frombuffer(output_bytes, np.uint8)
        output_img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        
        if output_img is None:
            print("FAILED: Could not decode output image.")
            return
            
        print(f"Output shape: {output_img.shape}")
        
        if output_img.shape[2] != 4:
            print("FAILED: Output image does not have 4 channels (RGBA).")
            return
            
        # Check if we have transparency
        alpha = output_img[:, :, 3]
        min_alpha = np.min(alpha)
        max_alpha = np.max(alpha)
        
        print(f"Alpha range: [{min_alpha}, {max_alpha}]")
        
        if min_alpha == 255:
            print("WARNING: Alpha channel is largely opaque. (Might be expected if object fills frame or simple dummy fail)")
        elif min_alpha == 0:
             print("SUCCESS: Transparency detected.")
        else:
             print("SUCCESS: Variable transparency detected.")
             
    except Exception as e:
        print(f"FAILED: Exception occurred: {e}")

if __name__ == "__main__":
    verify()
