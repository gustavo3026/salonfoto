
export const bakeImageTransform = (
    imageSrc: string,
    transform: { x: number; y: number; scale: number },
    editorSize: number = 600,
    outputSize: number = 2048
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            reject(new Error("Could not create canvas context"));
            return;
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageSrc;

        img.onload = () => {
            // Fill background with white? Or transparent?
            // "Salon de Fotos" usually implies product photography, often white or transparent.
            // Backend produces transparent usually, but layout_on_white makes it white.
            // Let's assume transparent to be safe for PNGs, user can see white in dashboard due to CSS.
            // BUT backend `layout_on_white` returns WHITE background. 
            // If the user cutout, it might be transparent.
            // Let's clear rect (transparent).
            ctx.clearRect(0, 0, outputSize, outputSize);

            // Calculate scale ratio between editor (600px) and output (2048px)
            const ratio = outputSize / editorSize;

            ctx.save();

            // We need to match the visual behavior of ImageCanvas.
            // ImageCanvas puts image at 0,0 then applies transform.
            // transform-origin is "top left".
            // transform: translate(x, y) scale(s)

            // Apply translation (scaled)
            ctx.translate(transform.x * ratio, transform.y * ratio);

            // Apply scale (direct, as it's a multiplier)
            ctx.scale(transform.scale, transform.scale);

            // Draw image. 
            // We need to maintain the aspect ratio and "contain" logic of the editor if possible.
            // The editor displays image as:
            // width: 100%, height: 100%, objectFit: 'contain' inside 600x600.
            // This means the image is ALREADY fitted into 600x600?
            // Wait, in ImageCanvas:
            // <img style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            // This means the browser resizes the image to fit 600x600 VISUALLY.
            // When we bake, we want to draw the image such that it matches that "contain" fit relative to our output canvas.

            // Logic to replicate "object-fit: contain" onto our output canvas:
            const imgAspect = img.naturalWidth / img.naturalHeight;
            const canvasAspect = outputSize / outputSize; // 1

            let drawWidth, drawHeight;
            let drawX = 0, drawY = 0;

            if (imgAspect > canvasAspect) {
                // Wide image: constrain width
                drawWidth = outputSize;
                drawHeight = outputSize / imgAspect;
                drawY = (outputSize - drawHeight) / 2; // centered vertically?
                // Wait, 'contain' centers it?
                // Default 'object-fit: contain' centers content.
                // BUT ImageCanvas <img> has top:0, left:0.
                // Does 'contain' center? Yes usually.
                // Let's verify ImageCanvas CSS:
                // transformOrigin: 'top left'.
                // If I have a wide image in a square div with object-fit: contain, it centers vertically.
            } else {
                // Tall image: constrain height
                drawHeight = outputSize;
                drawWidth = outputSize * imgAspect;
                drawX = (outputSize - drawWidth) / 2; // centered horizontally?
            }

            // However, we are simulating the "base" state before transform.
            // If ImageCanvas uses <img> with object-fit, the base visual state is centered and fitted.
            // So we draw it centered and fitted on our output canvas.

            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

            ctx.restore();

            resolve(canvas.toDataURL('image/png'));
        };

        img.onerror = (err) => reject(err);
    });
};
