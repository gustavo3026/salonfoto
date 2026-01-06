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

// Helper to call local Python server
const processWithServer = async (base64Img: string, task: string, instruction?: string): Promise<string> => {
    const formData = new FormData();
    // Convert base64 to blob
    const res = await fetch(base64Img);
    const blob = await res.blob();
    formData.append('file', blob);
    formData.append('task', task);
    if (instruction) formData.append('instruction', instruction);

    try {
        // Since we are running in Electron or local, localhost:8000 is accessible.
        const response = await fetch('http://localhost:8000/process', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }

        const resultBlob = await response.blob();
        // Convert to base64
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(resultBlob);
        });
    } catch (error) {
        console.warn("Local server unreachable or failed, falling back to WASM", error);
        throw error;
    }
};

export async function processImageWithGemini(
    imageBase64: string,
    task: StudioTask,
    userInstruction?: string,
    onProgress?: (percent: number) => void
): Promise<string> {
    logger.log(`[CLIENT-SIDE] Iniciando proceso: ${task}`, { instruction: userInstruction });

    // TRY 1: High Quality Local Server
    try {
        if (onProgress) onProgress(10);
        logger.log("Intentando conectar con servidor Python local (Alta Calidad)...");
        const serverResult = await processWithServer(imageBase64, task, userInstruction || '');
        if (onProgress) onProgress(100);
        logger.log("¡Procesado exitoso en servidor local!");
        return serverResult;

    } catch (serverError) {
        logger.warn("Servidor local no disponible. Usando fallback WASM...", serverError);

        // FALLBACK: Browser WASM (The simplified version)
        try {
            if (task === 'REMOVE_BG') {
                if (!modelLoaded && !hasLoggedInitialization) {
                    hasLoggedInitialization = true;
                    logger.log("Cargando modelo AI navegador (@imgly)... Esto puede tardar la primera vez.");
                } else if (modelLoaded) {
                    console.log("[API] Reusing loaded AI model.");
                }
                const start = Date.now();

                const config: Config = {
                    model: 'isnet',
                    progress: (key: string, current: number, total: number) => {
                        if (key.includes('fetch')) {
                            const percent = Math.round((current / total) * 50);
                            if (onProgress) onProgress(percent);
                        }
                    }
                };

                let simProgress = 50;
                const progressInterval = setInterval(() => {
                    simProgress += (95 - simProgress) * 0.1;
                    if (onProgress) onProgress(Math.round(simProgress));
                }, 200);

                try {
                    logger.log("Procesando imagen con modelo isnet (WASM)...");
                    const blob = await removeBackground(imageBase64, config);
                    const finalResult = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });

                    clearInterval(progressInterval);
                    if (onProgress) onProgress(100);

                    const duration = ((Date.now() - start) / 1000).toFixed(1);
                    logger.log(`¡Fondo eliminado (WASM) en ${duration}s!`);
                    modelLoaded = true;

                    return finalResult;
                } catch (e) {
                    clearInterval(progressInterval);
                    throw e;
                }

            } else if (task === 'EDIT' && userInstruction) {
                if (userInstruction.startsWith('sensitivity')) {
                    const val = parseFloat(userInstruction.split(':')[1]);
                    return await applyAlphaThreshold(imageBase64, val);
                }
                return await applyCanvasFilter(imageBase64, userInstruction);
            }

            return imageBase64;

        } catch (error) {
            logger.error("Error en procesamiento local", error);
            throw error;
        }
    }
}
