import { createContext, useContext, useState, type ReactNode } from 'react';

export interface ImageTransform {
    x: number;
    y: number;
    scale: number;
}

export interface StudioImage {
    id: string;
    original: string;
    processed: string | null;
    status: 'idle' | 'processing' | 'done' | 'error';
    transform?: ImageTransform;
    progress?: number;
    filename: string;
    history: string[]; // Stack of 'processed' states
    historyIndex: number;
}

export type ViewMode = 'DASHBOARD' | 'EDITOR';
export type EditorMode = 'ADJUST' | 'CUTOUT';
export type BrushTool = 'ERASE' | 'RESTORE' | 'GUIDED';

interface StudioState {
    images: StudioImage[];
    selectedId: string | null;
    isProcessing: boolean;
    apiKey: string;
    viewMode: ViewMode;
    editorMode: EditorMode;
    brushTool: BrushTool;
    brushSize: number;

    addImage: (img: string, filename: string) => void;
    updateImage: (id: string, updates: Partial<StudioImage>) => void;
    selectImage: (id: string) => void;
    deleteImage: (id: string) => void;
    setApiKey: (key: string) => void;
    setIsProcessing: (loading: boolean) => void;
    setViewMode: (mode: ViewMode) => void;
    setEditorMode: (mode: EditorMode) => void;
    setBrushTool: (tool: BrushTool) => void;
    pushToHistory: (id: string, imageData: string) => void;
    undoImage: (id: string) => void;
    redoImage: (id: string) => void;
    setBrushSize: (size: number) => void;
}

const StudioContext = createContext<StudioState | undefined>(undefined);

export function StudioProvider({ children }: { children: ReactNode }) {
    const [images, setImages] = useState<StudioImage[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('DASHBOARD');
    const [editorMode, setEditorMode] = useState<EditorMode>('ADJUST');
    const [brushTool, setBrushTool] = useState<BrushTool>('ERASE');
    const [brushSize, setBrushSize] = useState(20);

    const addImage = (img: string, filename: string) => {
        const newImage: StudioImage = {
            id: crypto.randomUUID(),
            original: img,
            processed: null,
            status: 'idle',
            transform: { x: 0, y: 0, scale: 1 },
            progress: 0,
            filename,
            history: [],
            historyIndex: -1
        };
        setImages(prev => [...prev, newImage]);
        // Stay in dashboard when adding
    };

    const updateImage = (id: string, updates: Partial<StudioImage>) => {
        setImages(prev => prev.map(img => {
            if (img.id !== id) return img;

            // History Logic: If 'processed' is changing, push to history
            if (updates.processed !== undefined && updates.processed !== img.processed) {
                const newHistory = img.history.slice(0, img.historyIndex + 1);
                // Keep history limited to 10 steps to save memory
                if (newHistory.length >= 10) newHistory.shift();

                newHistory.push(updates.processed || img.original); // Save the state being transitioned TO? No, usually save PREVIOUS state for undo. 
                // Actually, standard is: History contains all states. index points to current.

                // Let's adopt: History contains valid 'processed' states.
                // When we effectively change image, we push.
                // But wait, if we are in Undo, we don't want to push.

                // Simplified: The caller handles history push via a separate method? 
                // No, automated is better. But complex.

                // Let's rely on explicit 'pushToHistory' calls or specific 'commit' actions for simplicity in this refactor.
                // But user wants Ctrl+Z. 

                return { ...img, ...updates };
            }
            return { ...img, ...updates };
        }));
    };

    const pushToHistory = (id: string, imageData: string) => {
        setImages(prev => prev.map(img => {
            if (img.id !== id) return img;
            const newHistory = img.history.slice(0, img.historyIndex + 1);
            if (newHistory.length > 10) newHistory.shift(); // Limit
            newHistory.push(imageData);
            return { ...img, history: newHistory, historyIndex: newHistory.length - 1, processed: imageData };
        }));
    };

    const undoImage = (id: string) => {
        setImages(prev => prev.map(img => {
            if (img.id !== id || img.historyIndex <= 0) return img;
            const newIndex = img.historyIndex - 1;
            return { ...img, historyIndex: newIndex, processed: img.history[newIndex] };
        }));
    };

    const redoImage = (id: string) => {
        setImages(prev => prev.map(img => {
            if (img.id !== id || img.historyIndex >= img.history.length - 1) return img;
            const newIndex = img.historyIndex + 1;
            return { ...img, historyIndex: newIndex, processed: img.history[newIndex] };
        }));
    };

    const selectImage = (id: string) => {
        setSelectedId(id);
        setViewMode('EDITOR');
        setEditorMode('ADJUST'); // Reset to adjust on select
    };

    const deleteImage = (id: string) => {
        setImages(prev => prev.filter(img => img.id !== id));
        if (selectedId === id) {
            setSelectedId(null);
            setViewMode('DASHBOARD');
        }
    };

    return (
        <StudioContext.Provider value={{
            images,
            selectedId,
            isProcessing,
            apiKey,
            viewMode,
            editorMode,
            brushTool,
            brushSize,
            addImage,
            updateImage,
            selectImage,
            deleteImage,
            setApiKey,
            setIsProcessing,
            setViewMode,
            setEditorMode,
            setBrushTool,
            setBrushSize,
            pushToHistory,
            undoImage,
            redoImage
        }}>
            {children}
        </StudioContext.Provider>
    );
}

export function useStudio() {
    const context = useContext(StudioContext);
    if (context === undefined) {
        throw new Error('useStudio must be used within a StudioProvider');
    }
    return context;
}
