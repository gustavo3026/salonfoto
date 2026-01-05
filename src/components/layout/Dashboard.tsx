import { useStudio } from '../../context/StudioContext';
import { Pencil, Trash2, Plus, Loader2, Download } from 'lucide-react';
import JSZip from 'jszip';
import { useState } from 'react';
import { DownloadOptionsModal } from '../common/DownloadOptionsModal';

import { processImageWithGemini } from '../../services/api';

export function Dashboard() {
    const { images, selectImage, deleteImage, addImage, updateImage } = useStudio();
    const [downloadModalOpen, setDownloadModalOpen] = useState(false);

    const handleBatchProcess = async () => {
        const idleImages = images.filter(img => img.status === 'idle');
        if (idleImages.length === 0) return;

        // Concurrency Control: Process 3 at a time
        const CONCURRENCY_LIMIT = 3;
        const queue = [...idleImages];
        const activePromises: Promise<void>[] = [];

        const processNext = async () => {
            if (queue.length === 0) return;

            const img = queue.shift();
            if (!img) return;

            try {
                updateImage(img.id, { status: 'processing', progress: 0 });
                const result = await processImageWithGemini(
                    img.original,
                    'REMOVE_BG',
                    undefined,
                    (p) => updateImage(img.id, { progress: p })
                );
                updateImage(img.id, { status: 'done', processed: result, progress: 100 });
            } catch (err) {
                console.error("Batch error", err);
                updateImage(img.id, { status: 'error' });
            } finally {
                // After one finishes, try to pick up the next one
                await processNext();
            }
        };

        // Start initial batch
        for (let i = 0; i < CONCURRENCY_LIMIT && i < idleImages.length; i++) {
            activePromises.push(processNext());
        }

        await Promise.all(activePromises);
    };

    const handleBatchDownloadClick = () => {
        if (!images.some(img => img.status === 'done')) return;
        setDownloadModalOpen(true);
    };

    const processBatchDownload = async (useWhiteBackground: boolean) => {
        setDownloadModalOpen(false);
        const doneImages = images.filter(img => img.status === 'done');
        if (doneImages.length === 0) return;

        const zip = new JSZip();

        for (let i = 0; i < doneImages.length; i++) {
            const imgData = doneImages[i];
            const src = imgData.processed || imgData.original;
            // Remove extension from original filename
            // Remove extension from original filename
            const nameWithoutExt = imgData.filename.replace(/\.[^/.]+$/, "");
            const filename = `${nameWithoutExt}-editado`;

            if (useWhiteBackground) {
                // Composite
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = src;
                await new Promise((resolve) => { img.onload = resolve; });

                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    // Get base64 without prefix
                    const data = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
                    zip.file(`${filename}.jpg`, data, { base64: true });
                }
            } else {
                // Transparent PNG
                const data = src.split(',')[1]; // Remove prefix
                zip.file(`${filename}.png`, data, { base64: true });
            }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `lote-fotos-${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);

            // Enforce 100 image limit
            if (images.length + newFiles.length > 100) {
                alert("El límite es de 100 imágenes por sesión.");
                return;
            }

            newFiles.forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const result = e.target?.result as string;
                    addImage(result, file.name);
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const newFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));

            if (images.length + newFiles.length > 100) {
                alert("El límite es de 100 imágenes por sesión.");
                return;
            }

            newFiles.forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const result = e.target?.result as string;
                    addImage(result, file.name);
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const doneCount = images.filter(img => img.status === 'done').length;

    return (
        <div
            style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            <DownloadOptionsModal
                isOpen={downloadModalOpen}
                onClose={() => setDownloadModalOpen(false)}
                onConfirm={processBatchDownload}
                count={doneCount}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        Procesando {images.length} imágenes
                    </h2>
                    <p style={{ color: 'var(--color-text-muted)' }}>Listo para comenzar</p>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    {/* Batch Process Button */}
                    <button
                        className="btn btn-primary"
                        onClick={handleBatchProcess}
                        disabled={!images.some(img => img.status === 'idle')}
                    >
                        <Loader2 size={16} className={images.some(img => img.status === 'processing') ? "animate-spin" : ""} />
                        Procesar Todo
                    </button>

                    {/* Batch Download Button */}
                    {doneCount > 0 && (
                        <button
                            className="btn btn-secondary"
                            onClick={handleBatchDownloadClick}
                            style={{ background: '#10b981', color: 'white', border: 'none' }}
                        >
                            <Download size={16} />
                            Descargar {doneCount}
                        </button>
                    )}

                    <label className="btn" style={{ cursor: 'pointer', border: '1px solid var(--color-border)' }}>
                        <Plus size={16} />
                        Añadir
                        <input
                            type="file"
                            hidden
                            multiple
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                    </label>
                </div>
            </div>

            {images.length === 0 ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4rem',
                    border: '2px dashed var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--color-text-muted)'
                }}>
                    <p>Arrastra imágenes aquí o usa el botón Añadir</p>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '1.5rem'
                }}>
                    {images.map(img => (
                        <div key={img.id} className="group" style={{
                            position: 'relative',
                            aspectRatio: '1',
                            backgroundColor: 'var(--color-surface-hover)',
                            borderRadius: 'var(--radius-md)',
                            overflow: 'hidden',
                            border: '1px solid var(--color-border)'
                        }}>
                            <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                                {/* Canvas Simulation Layer */}
                                <div style={{
                                    width: '100%', height: '100%',
                                    position: 'relative',
                                    backgroundColor: 'white' // Matches ImageCanvas bg
                                }}>
                                    <img
                                        src={img.processed || img.original}
                                        alt="Thumb"
                                        style={{
                                            width: '100%', height: '100%',
                                            objectFit: 'contain',
                                            // Apply transform. 
                                            // x/y are from 600px canvas. Convert to % 
                                            transform: img.transform
                                                ? `translate(${img.transform.x / 600 * 100}%, ${img.transform.y / 600 * 100}%) scale(${img.transform.scale})`
                                                : 'none',
                                            transformOrigin: 'top left',
                                            transition: 'transform 0.2s', // Smooth update
                                            pointerEvents: 'none'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Overlay Actions */}
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0,0,0,0.4)',
                                opacity: 0,
                                transition: 'opacity 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '1rem'
                            }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                            >
                                <button
                                    onClick={() => selectImage(img.id)}
                                    style={{
                                        background: 'white',
                                        color: 'black',
                                        border: 'none',
                                        padding: '0.75rem',
                                        borderRadius: '50%',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                    }}
                                    title="Editar"
                                >
                                    <Pencil size={20} />
                                </button>

                                <button
                                    onClick={(e) => { e.stopPropagation(); deleteImage(img.id); }}
                                    style={{
                                        background: 'rgba(239, 68, 68, 0.9)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '0.75rem',
                                        borderRadius: '50%',
                                        cursor: 'pointer'
                                    }}
                                    title="Eliminar"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </div>

                            {/* Status Indicators */}
                            <div style={{ position: 'absolute', top: 8, right: 8 }}>
                                {img.status === 'done' && (
                                    <div style={{ background: '#22c55e', borderRadius: '50%', padding: 4 }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                    </div>
                                )}
                                {img.status === 'processing' && (
                                    <div style={{ color: 'var(--color-primary)', fontWeight: 'bold', fontSize: '0.9rem', background: 'rgba(255,255,255,0.9)', padding: '2px 6px', borderRadius: '4px' }}>
                                        {img.progress || 0}%
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
