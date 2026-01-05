// Define the type locally as originally intended
export type StudioTask = 'REMOVE_BG' | 'EDIT';

import { logger } from './logger';
import * as imgly from "@imgly/background-removal";
import type { Config } from "@imgly/background-removal";

// Robustly get the function (handles Default export vs Named export vs CommonJS)
// @ts-ignore
const removeBackground = (imgly.default as any) || (imgly.removeBackground as any) || (imgly as any);

let modelLoaded = false;
let hasLoggedInitialization = false;

// Helper to load image
const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};

// Helper for Canvas filters
const applyCanvasFilter = async (base64: string, filter: string): Promise<string> => {
    const img = await loadImage(base64);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get canvas context");

    // Parse filter instruction: "brightness:1.2"
    let filterString = 'none';
    if (filter.startsWith('brightness')) {
        const val = parseFloat(filter.split(':')[1]) * 100;
        filterString = `brightness(${val}%)`;
    } else if (filter.startsWith('contrast')) {
        const val = parseFloat(filter.split(':')[1]) * 100;
        filterString = `contrast(${val}%)`;
    } else if (filter.startsWith('saturation')) {
        const val = parseFloat(filter.split(':')[1]) * 100;
        filterString = `saturate(${val}%)`;
    }

    ctx.filter = filterString;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
};

const applyAlphaThreshold = async (base64: string, threshold: number): Promise<string> => {
    // Optimization: If threshold is 0, no change needed.
    if (threshold === 0) return base64;

    const img = await loadImage(base64);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get canvas context");

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const limit = (threshold / 100) * 255;
    const len = data.length;
    const chunkSize = 200000; // Process 200k bytes (~50k pixels) per tick

    // Process in chunks to avoid blocking the main thread
    for (let i = 0; i < len; i += chunkSize) {
        const end = Math.min(i + chunkSize, len);
        // Inner loop: highly optimized
        for (let j = i + 3; j < end; j += 4) {
            if (data[j] < limit) {
                data[j] = 0;
            }
        }
        // Yield to event loop
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
};

export async function processImageWithGemini(
    imageBase64: string,
    task: StudioTask,
    userInstruction?: string,
    onProgress?: (percent: number) => void
): Promise<string> {
    logger.log(`[CLIENT-SIDE] Iniciando proceso local: ${task}`, { instruction: userInstruction });

    try {
        // Helper to enhance image for AI detection (brighten shadows)
        const enhanceForDetection = async (base64: string): Promise<string> => {
            const img = await loadImage(base64);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not get canvas context");

            // Apply gamma/brightness to reveal dark details
            // Brightness 130%, Contrast 110%
            ctx.filter = 'brightness(1.3) contrast(1.1)';
            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL('image/png');
        };

        // Helper to apply the mask from processed image to the original
        const applyMaskToOriginal = async (originalBase64: string, maskBase64: string): Promise<string> => {
            const [original, mask] = await Promise.all([loadImage(originalBase64), loadImage(maskBase64)]);
            const canvas = document.createElement('canvas');
            canvas.width = original.width;
            canvas.height = original.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not get canvas context");

            // 1. Draw the mask (which has the transparency we want)
            ctx.drawImage(mask, 0, 0);

            // 2. Set composite mode to 'source-in'
            // This keeps the pixels of the NEXT draw only where the EXISTING pixels are opaque
            ctx.globalCompositeOperation = 'source-in';

            // 3. Draw the original image
            // It will be "clipped" by the mask we just drew
            ctx.drawImage(original, 0, 0);

            return canvas.toDataURL('image/png');
        };

        export async function processImageWithGemini(
            imageBase64: string,
            task: StudioTask,
            userInstruction?: string,
            onProgress?: (percent: number) => void
        ): Promise<string> {
            logger.log(`[CLIENT-SIDE] Iniciando proceso local: ${task}`, { instruction: userInstruction });

            try {
                if (task === 'REMOVE_BG') {
                    if (!modelLoaded && !hasLoggedInitialization) {
                        hasLoggedInitialization = true;
                        logger.log("Cargando modelo AI local (@imgly)... Esto puede tardar la primera vez.");
                    } else if (modelLoaded) {
                        // Info for debug but less alarming
                        console.log("[API] Reusing loaded AI model.");
                    }
                    const start = Date.now();

                    // Config object for progress tracking
                    const config: Config = {
                        model: 'isnet', // Use larger, more accurate model for better shadow removal
                        progress: (key: string, current: number, total: number) => {
                            if (key.includes('fetch')) {
                                const percent = Math.round((current / total) * 50);
                                if (onProgress) onProgress(percent);
                            }
                        }
                    };

                    // Manual simulation for inference part since imgly doesn't stream inference progress easily
                    let simProgress = 50;
                    const progressInterval = setInterval(() => {
                        simProgress += (95 - simProgress) * 0.1;
                        if (onProgress) onProgress(Math.round(simProgress));
                    }, 200);

                    try {
                        // SMART CUT PIPELINE
                        // 1. Enhance image to help AI see dark details
                        logger.log("Mejorando imagen para detección...");
                        const enhancedImage = await enhanceForDetection(imageBase64);

                        // 2. Run AI on the ENHANCED image
                        const blob = await removeBackground(enhancedImage, config);

                        // 3. Convert result to Base64 (this is the Mask, but with wrong colors)
                        const maskBase64 = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });

                        // 4. Apply the mask to the ORIGINAL image to get correct colors
                        const finalResult = await applyMaskToOriginal(imageBase64, maskBase64);

                        clearInterval(progressInterval);
                        if (onProgress) onProgress(100);

                        const duration = ((Date.now() - start) / 1000).toFixed(1);
                        logger.log(`¡Fondo eliminado localmente en ${duration}s!`);
                        modelLoaded = true;

                        return finalResult;
                    } catch (e) {
                        clearInterval(progressInterval);
                        throw e;
                    }

                } else if (task === 'EDIT' && userInstruction) {
                    if (userInstruction.startsWith('sensitivity')) {
                        logger.log("Aplicando limpieza de sombra...");
                        if (onProgress) onProgress(50);
                        const val = parseFloat(userInstruction.split(':')[1]);
                        // val is 0-100
                        const res = await applyAlphaThreshold(imageBase64, val);
                        if (onProgress) onProgress(100);
                        return res;
                    }

                    logger.log("Aplicando filtros con Canvas API...");
                    if (onProgress) onProgress(50);
                    const res = await applyCanvasFilter(imageBase64, userInstruction);
                    if (onProgress) onProgress(100);
                    return res;
                }

                return imageBase64;

            } catch (error) {
                logger.error("Error en procesamiento local", error);
                throw error;
            }
        }
