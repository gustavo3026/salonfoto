import { useRef, useEffect, useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import Moveable from 'react-moveable';
import { Loader2, Upload, Download, Eye, EyeOff, Plus, Minus } from 'lucide-react';
import { DownloadOptionsModal } from '../common/DownloadOptionsModal';

export function ImageCanvas() {
    const { images, selectedId, updateImage, addImage, isProcessing, editorMode, brushTool, brushSize } = useStudio();
    const activeImage = images.find(img => img.id === selectedId);

    const targetRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const originalImgRef = useRef<HTMLImageElement | null>(null);
    const cursorRef = useRef<HTMLDivElement>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);
    const [downloadModalOpen, setDownloadModalOpen] = useState(false);

    // Load original image for restoration source
    useEffect(() => {
        if (activeImage && activeImage.original) {
            const img = new Image();
            img.src = activeImage.original;
            img.onload = () => {
                originalImgRef.current = img;
            };
        }
    }, [activeImage?.original]);

    // Initialize Canvas on mode switch or image change
    useEffect(() => {
        if (!activeImage || editorMode !== 'CUTOUT' || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Load current processed state (or original if null)
        const currentSrc = activeImage.processed || activeImage.original;
        const img = new Image();
        img.src = currentSrc;
        img.onload = () => {
            // Reset canvas size to natural image size
            if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
            }
            ctx.drawImage(img, 0, 0);
        };
    }, [editorMode, activeImage?.id]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (editorMode !== 'CUTOUT') return;
        if (!canvasRef.current) return;

        if (brushTool === 'GUIDED') {
            handleGuidedClick(e);
            return;
        }

        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setIsDrawing(true);
        paint(e);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        // Update cursor position
        if (cursorRef.current && canvasRef.current) {
            cursorRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
            cursorRef.current.style.opacity = '1';
        }

        if (!isDrawing) return;
        paint(e);
    };

    const handlePointerLeave = () => {
        if (cursorRef.current) {
            cursorRef.current.style.opacity = '0';
        }
    }

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDrawing) return;
        setIsDrawing(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        // Save result
        if (canvasRef.current && activeImage) {
            const newData = canvasRef.current.toDataURL('image/png');
            updateImage(activeImage.id, { processed: newData });
        }
    };

    const paint = (e: React.PointerEvent) => {
        if (!canvasRef.current || !activeImage) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();

        // Map pointer to canvas internal resolution
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const effectiveBrushSize = brushSize * Math.max(scaleX, scaleY);

        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (brushTool === 'ERASE') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(x, y, effectiveBrushSize / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // RESTORE
            if (!originalImgRef.current) return;

            ctx.globalCompositeOperation = 'source-over';

            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, effectiveBrushSize / 2, 0, Math.PI * 2);
            ctx.clip();

            // Draw original image exactly aligned
            ctx.drawImage(originalImgRef.current, 0, 0, canvas.width, canvas.height);

            ctx.restore();
        }
    };

    const performFloodFill = (ctx: CanvasRenderingContext2D, startX: number, startY: number) => {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Get target color
        const targetIdx = (Math.round(startY) * width + Math.round(startX)) * 4;
        const targetR = data[targetIdx];
        const targetG = data[targetIdx + 1];
        const targetB = data[targetIdx + 2];
        const targetA = data[targetIdx + 3];

        // If transparent, nothing to do
        if (targetA === 0) return;

        const visited = new Uint8Array(width * height);
        const queue: [number, number][] = [[Math.round(startX), Math.round(startY)]];

        // Simple tolerance
        const tolerance = 30;

        while (queue.length > 0) {
            const [cx, cy] = queue.shift()!;
            const idx = (cy * width + cx) * 4;

            if (visited[cy * width + cx]) continue;
            visited[cy * width + cx] = 1;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];

            // Match condition
            if (
                Math.abs(r - targetR) < tolerance &&
                Math.abs(g - targetG) < tolerance &&
                Math.abs(b - targetB) < tolerance &&
                Math.abs(a - targetA) < tolerance
            ) {
                // Erase pixel
                data[idx + 3] = 0;

                // Add neighbors
                if (cx > 0) queue.push([cx - 1, cy]);
                if (cx < width - 1) queue.push([cx + 1, cy]);
                if (cy > 0) queue.push([cx, cy - 1]);
                if (cy < height - 1) queue.push([cx, cy + 1]);
            }
        }

        ctx.putImageData(imageData, 0, 0);
    };

    const handleGuidedClick = (e: React.PointerEvent) => {
        if (!canvasRef.current || !activeImage) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        performFloodFill(ctx, x, y);

        // Save
        const newData = canvas.toDataURL('image/png');
        updateImage(activeImage.id, { processed: newData });
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const result = e.target?.result as string;
                    addImage(result, file.name);
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const handleDownloadClick = () => {
        if (!activeImage) return;
        setDownloadModalOpen(true);
    };

    const processDownload = async (useWhiteBackground: boolean) => {
        setDownloadModalOpen(false);
        if (!activeImage) return;

        const src = activeImage.processed || activeImage.original;

        const link = document.createElement('a');

        if (useWhiteBackground) {
            // Composite with white background
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
                link.href = canvas.toDataURL('image/jpeg', 0.9);
                const nameWithoutExt = activeImage.filename.replace(/\.[^/.]+$/, "");
                link.download = `${nameWithoutExt}-editado.jpg`;
            }
        } else {
            // Transparent PNG
            link.href = src;
            const nameWithoutExt = activeImage.filename.replace(/\.[^/.]+$/, "");
            link.download = `${nameWithoutExt}-editado.png`;
        }

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useEffect(() => {
        if (activeImage && !activeImage.transform) {
            updateImage(activeImage.id, { transform: { x: 0, y: 0, scale: 1 } });
        }
    }, [activeImage?.id]);

    if (!activeImage) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#1e293b', color: '#94a3b8', height: '100%' }}>
                <Upload size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                <p>No image selected</p>
            </div>
        );
    }

    const { x = 0, y = 0, scale = 1 } = activeImage.transform || {};

    // Determine what to show: Original OR (Processed if available, else Original)
    const displaySrc = showOriginal ? activeImage.original : (activeImage.processed || activeImage.original);

    return (
        <div
            className="canvas-area"
            style={{
                flex: 1, position: 'relative', background: '#1e293b',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
                cursor: editorMode === 'CUTOUT' ? 'none' : 'default' // Hide default cursor in cutout
            }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onPointerMove={handlePointerMove} // Capture global move for cursor
            onPointerLeave={handlePointerLeave}
        >
            <DownloadOptionsModal
                isOpen={downloadModalOpen}
                onClose={() => setDownloadModalOpen(false)}
                onConfirm={processDownload}
            />

            {/* Toolbar Controls */}
            <div style={{
                position: 'absolute', top: '1rem', right: '1rem', zIndex: 100,
                display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.5)', padding: '0.5rem', borderRadius: '8px'
            }}>
                {editorMode === 'CUTOUT' && (
                    <>
                        <button
                            onClick={() => activeImage && updateImage(activeImage.id, { transform: { ...activeImage.transform!, scale: Math.min((activeImage.transform?.scale || 1) + 0.1, 5) } })}
                            title="Acercar (+)"
                            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}
                        >
                            <Plus size={20} />
                        </button>
                        <button
                            onClick={() => activeImage && updateImage(activeImage.id, { transform: { ...activeImage.transform!, scale: Math.max((activeImage.transform?.scale || 1) - 0.1, 0.1) } })}
                            title="Alejar (-)"
                            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}
                        >
                            <Minus size={20} />
                        </button>
                        <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)' }} />
                    </>
                )}

                <button
                    onClick={() => setShowOriginal(!showOriginal)}
                    title={showOriginal ? "Ver Editado" : "Ver Original"}
                    style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                    {showOriginal ? <EyeOff size={20} /> : <Eye size={20} />}
                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{showOriginal ? 'Original' : 'Resultado'}</span>
                </button>
                <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)' }} />
                <button
                    onClick={handleDownloadClick}
                    title="Descargar esta imagen"
                    style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}
                >
                    <Download size={20} />
                </button>
            </div>

            {/* Custom Brush Cursor */}
            {editorMode === 'CUTOUT' && brushTool !== 'GUIDED' && (
                <div
                    ref={cursorRef}
                    style={{
                        position: 'fixed', top: 0, left: 0,
                        width: brushSize + 'px', height: brushSize + 'px',
                        border: '2px solid white', boxShadow: '0 0 2px rgba(0,0,0,0.5)', borderRadius: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none', zIndex: 9999,
                        marginTop: `-${brushSize / 2}px`, marginLeft: `-${brushSize / 2}px`,
                        opacity: 0,
                        backgroundColor: brushTool === 'ERASE' ? 'rgba(255, 100, 100, 0.2)' : 'rgba(100, 255, 100, 0.2)'
                    }}
                />
            )}

            <div
                style={{
                    width: '600px', height: '600px',
                    // Pure white background for editing
                    background: 'white',
                    backgroundColor: 'white',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    position: 'relative', overflow: 'hidden'
                }}
            >
                {editorMode === 'CUTOUT' ? (
                    <canvas
                        ref={canvasRef}
                        style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            objectFit: 'contain',
                            transform: `translate(${x}px, ${y}px) scale(${scale})`,
                            transformOrigin: 'top left',
                            touchAction: 'none'
                        }}
                        onPointerDown={handlePointerDown}
                        onPointerUp={handlePointerUp}
                    />
                ) : (
                    <img
                        ref={targetRef}
                        src={displaySrc}
                        alt="Canvas"
                        style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            objectFit: 'contain',
                            transform: `translate(${x}px, ${y}px) scale(${scale})`,
                            transformOrigin: 'top left'
                        }}
                        onDragStart={(e) => e.preventDefault()}
                    />
                )}

                {activeImage && editorMode === 'ADJUST' && (
                    <Moveable
                        target={targetRef}
                        container={null}
                        origin={false}
                        edge={false}
                        draggable={true}
                        throttleDrag={0}
                        onDrag={({ beforeTranslate }) => {
                            updateImage(activeImage.id, {
                                transform: { x: beforeTranslate[0], y: beforeTranslate[1], scale }
                            });
                        }}
                        scalable={true}
                        keepRatio={true}
                        throttleScale={0}
                        onScale={({ drag, scale }) => {
                            updateImage(activeImage.id, {
                                transform: {
                                    x: drag.beforeTranslate[0],
                                    y: drag.beforeTranslate[1],
                                    scale: scale[0]
                                }
                            });
                        }}
                        rotatable={false}
                        snappable={true}
                        bounds={{ left: -500, top: -500, right: 1100, bottom: 1100 }}
                    />
                )}
            </div>

            {isProcessing && (
                <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }}>
                    <div style={{ background: 'white', padding: '1rem 2rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Loader2 className="animate-spin" size={20} color="var(--color-primary)" />
                        <span style={{ fontWeight: 600 }}>Procesando {activeImage?.progress || 0}%...</span>
                    </div>
                </div>
            )}
        </div>
    );
}
