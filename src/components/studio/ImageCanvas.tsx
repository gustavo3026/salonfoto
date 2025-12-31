import { useRef, useEffect, useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import Moveable from 'react-moveable';
import { Loader2, Upload } from 'lucide-react';

export function ImageCanvas() {
    const { images, selectedId, updateImage, addImage, isProcessing, editorMode, brushTool, brushSize } = useStudio();
    const activeImage = images.find(img => img.id === selectedId);

    const targetRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const originalImgRef = useRef<HTMLImageElement | null>(null);
    const cursorRef = useRef<HTMLDivElement>(null);

    const [isDrawing, setIsDrawing] = useState(false);

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

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const result = e.target?.result as string;
                    addImage(result);
                };
                reader.readAsDataURL(file);
            });
        }
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
            {/* Custom Brush Cursor */}
            {editorMode === 'CUTOUT' && (
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
                    background: editorMode === 'CUTOUT' ? 'transparent' : 'white',
                    backgroundImage: editorMode === 'CUTOUT' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none',
                    backgroundSize: '20px 20px',
                    backgroundColor: editorMode === 'CUTOUT' ? 'white' : 'white',
                    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
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
                        src={activeImage.processed || activeImage.original}
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
                        <span style={{ fontWeight: 600 }}>Procesando...</span>
                    </div>
                </div>
            )}
        </div>
    );
}
