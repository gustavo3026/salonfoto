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
                    // Logic: 
                    // 'fetch' indicates downloading model (0-50%)
                    // 'compute' (if available, mostly internal) or inference time (50-100%)
                    // Since imgly only gives download progress reliably, we map it.

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
                const blob = await removeBackground(imageBase64, config);
                clearInterval(progressInterval);
                if (onProgress) onProgress(100);

                const duration = ((Date.now() - start) / 1000).toFixed(1);
                logger.log(`¡Fondo eliminado localmente en ${duration}s!`);
                modelLoaded = true;

                // Convert Blob to Base64
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                clearInterval(progressInterval);
                throw e;
            }

        } else if (task === 'EDIT' && userInstruction) {
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
