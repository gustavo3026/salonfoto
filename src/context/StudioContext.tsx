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
}

export type ViewMode = 'DASHBOARD' | 'EDITOR';
export type EditorMode = 'ADJUST' | 'CUTOUT';
export type BrushTool = 'ERASE' | 'RESTORE';

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
            filename
        };
        setImages(prev => [...prev, newImage]);
        // Stay in dashboard when adding
    };

    const updateImage = (id: string, updates: Partial<StudioImage>) => {
        setImages(prev => prev.map(img =>
            img.id === id ? { ...img, ...updates } : img
        ));
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
            setBrushSize
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
