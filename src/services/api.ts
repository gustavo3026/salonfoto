export type StudioTask = 'REMOVE_BG' | 'EDIT';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function processImageWithGemini(
    // apiKey: string, // Kept for interface compatibility, but unused for local
    imageBase64: string,
    task: StudioTask,
    userInstruction?: string
): Promise<string> {
    // Convert DataURL to Blob for upload
    const res = await fetch(imageBase64);
    const blob = await res.blob();

    const formData = new FormData();
    formData.append('file', blob);
    formData.append('task', task);
    if (userInstruction) {
        formData.append('instruction', userInstruction);
    }

    try {
        const response = await fetch(`${API_URL}/process`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        // Get response as Blob and convert back to Base64 for display
        const resultBlob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(resultBlob);
        });

    } catch (error) {
        console.error("Local Service Error", error);
        throw error;
    }
}
