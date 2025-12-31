import { Download, ChevronRight } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useState } from 'react';
import { processImageWithGemini } from '../../services/api';
import { bakeImageTransform } from '../../utils/imageUtils';

export function Header() {
    const { images, selectedId, isProcessing, setIsProcessing, updateImage, viewMode, setViewMode, editorMode, setEditorMode } = useStudio();
    const [isZipping, setIsZipping] = useState(false);

    const activeImage = images.find(img => img.id === selectedId);

    // Calculate state
    const hasImages = images.length > 0;
    // Show Process button if ANY image (original) exists and we are not just reviewing
    // Logic: If any image status is NOT 'done', show process.
    const showProcessButton = hasImages && images.some(img => img.status !== 'done');
    // Show Download button if we have images and they are processed (or we allow partial)
    // Preference: If process button is hidden (all done), show download.
    const showDownloadButton = hasImages && !showProcessButton;

    const handleBatchProcess = async () => {
        setIsProcessing(true);
        try {
            // Process sequentially to avoid rate limits or overwhelming backend
            for (const img of images) {
                if (img.status === 'done') continue; // Skip already processed

                updateImage(img.id, { status: 'processing' });
                try {
                    const result = await processImageWithGemini(img.original, 'REMOVE_BG');
                    updateImage(img.id, { processed: result, status: 'done' });
                } catch (e) {
                    console.error(e);
                    updateImage(img.id, { status: 'error' });
                }
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveCurrent = () => {
        // "Hecho" action: Just return to Dashboard. 
        // We preserve the transform state in the context, so it's non-destructive.
        // The Dashboard applies it visually via CSS.
        // The Download action applies it permanently via baking.
        setViewMode('DASHBOARD');
    };

    const handleBatchDownload = async () => {
        if (images.length === 0) return;
        setIsZipping(true);
        try {
            const zip = new JSZip();
            const processedFolder = zip.folder("processed_images");

            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                let dataUrl = img.processed || img.original;

                // Non-destructive bake on download
                if (img.transform && (img.transform.x !== 0 || img.transform.y !== 0 || img.transform.scale !== 1)) {
                    try {
                        // Bake the transform into a temporary image for the ZIP
                        dataUrl = await bakeImageTransform(dataUrl, img.transform);
                    } catch (e) {
                        console.error(`Failed to bake image ${img.id}`, e);
                        // Fallback to unbaked
                    }
                }

                const base64Data = dataUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
                const ext = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,/)?.[1] || "png";
                processedFolder?.file(`imagen-${i + 1}.${ext}`, base64Data, { base64: true });
            }

            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, "salon_fotos_batch.zip");
        } catch (error) {
            console.error("Failed to zip images", error);
            alert("Failed to create zip file");
        } finally {
            setIsZipping(false);
        }
    };

    return (
        <header style={{
            padding: '0 1.5rem',
            height: '64px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-surface)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                    onClick={() => setViewMode('DASHBOARD')}
                    style={{
                        background: 'var(--color-primary)',
                        padding: '0.4rem',
                        borderRadius: 'var(--radius-md)',
                        color: 'white',
                        display: 'flex',
                        cursor: 'pointer'
                    }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                </div>
                <h1 style={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.025em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span onClick={() => setViewMode('DASHBOARD')} style={{ cursor: 'pointer' }}>SALON DE FOTOS</span>

                    {viewMode === 'EDITOR' && (
                        <>
                            <ChevronRight size={16} color="var(--color-text-muted)" />
                            <span
                                onClick={() => setEditorMode('ADJUST')}
                                style={{
                                    fontSize: '0.9rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    color: editorMode === 'ADJUST' ? 'var(--color-text)' : 'var(--color-text-muted)'
                                }}
                            >
                                Ajustar
                            </span>
                            <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', margin: '0 0.25rem' }}>|</span>
                            <span
                                onClick={() => setEditorMode('CUTOUT')}
                                style={{
                                    fontSize: '0.9rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    color: editorMode === 'CUTOUT' ? 'var(--color-text)' : 'var(--color-text-muted)'
                                }}
                            >
                                Recorte
                            </span>
                        </>
                    )}
                </h1>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {viewMode === 'DASHBOARD' && showProcessButton && (
                    <button
                        className="btn btn-primary"
                        onClick={handleBatchProcess}
                        disabled={isProcessing}
                    >
                        {isProcessing ? 'Procesando...' : 'Procesar Todo El Lote'}
                    </button>
                )}

                {viewMode === 'DASHBOARD' && showDownloadButton && (
                    <button
                        className="btn btn-primary"
                        onClick={handleBatchDownload}
                        disabled={isZipping || isProcessing}
                        style={{ background: '#22c55e', border: 'none' }}
                    >
                        {isZipping ? 'Comprimiendo...' : 'Descargar Todo (.zip)'}
                        <Download size={16} />
                    </button>
                )}

                {viewMode === 'EDITOR' && (
                    <button
                        className="btn btn-primary"
                        onClick={handleSaveCurrent}
                        disabled={!activeImage || isProcessing}
                    >
                        Hecho
                        <ChevronRight size={16} />
                    </button>
                )}
            </div>
        </header>
    );
}
