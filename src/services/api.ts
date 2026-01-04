// Define the type locally as originally intended
export type StudioTask = 'REMOVE_BG' | 'EDIT';

import { logger } from './logger';
import removeBackground from "@imgly/background-removal";
import type { Config } from "@imgly/background-removal";

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
    userInstruction?: string
): Promise<string> {
    logger.log(`[CLIENT-SIDE] Iniciando proceso local: ${task}`, { instruction: userInstruction });

    try {
        if (task === 'REMOVE_BG') {
            logger.log("Cargando modelo AI local (@imgly)... Esto puede tardar la primera vez.");
            const start = Date.now();

            // Config object for progress tracking
            const config: Config = {
                progress: (key: string, current: number, total: number) => {
                    const percent = Math.round((current / total) * 100);
                    // Only log significant updates to avoid spam
                    if (percent % 20 === 0) {
                        logger.log(`Descargando AI: ${key} ${percent}%`);
                    }
                }
            };

            const blob = await removeBackground(imageBase64, config);

            const duration = ((Date.now() - start) / 1000).toFixed(1);
            logger.log(`¡Fondo eliminado localmente en ${duration}s!`);

            // Convert Blob to Base64
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

        } else if (task === 'EDIT' && userInstruction) {
            logger.log("Aplicando filtros con Canvas API...");
            return await applyCanvasFilter(imageBase64, userInstruction);
        }

        return imageBase64;

    } catch (error) {
        logger.error("Error en procesamiento local", error);
        throw error;
    }
}
