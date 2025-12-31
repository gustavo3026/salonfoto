import { useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import { processImageWithGemini } from '../../services/api';
import { Zap, Sun, Palette, Cloud, Scissors, Contrast } from 'lucide-react';

export function PromptPanel() {
    const { images, selectedId, updateImage, setIsProcessing, editorMode, brushTool, setBrushTool, brushSize, setBrushSize } = useStudio();
    const activeImage = images.find(img => img.id === selectedId);

    const [brightness, setBrightness] = useState(1.2);
    const [saturation, setSaturation] = useState(1.0);
    const [contrast, setContrast] = useState(1.0);

    const processSingleImage = async (id: string, task: 'REMOVE_BG' | 'EDIT', instruction?: string, useProcessedAsInput = false) => {
        const img = images.find(i => i.id === id);
        if (!img) return;

        try {
            setIsProcessing(true);
            updateImage(id, { status: 'processing' });

            const inputImage = useProcessedAsInput && img.processed ? img.processed : img.original;

            const processedBase64 = await processImageWithGemini(
                inputImage,
                task,
                instruction
            );

            updateImage(id, {
                processed: processedBase64,
                status: 'done'
            });
        } catch (error) {
            console.error(error);
            updateImage(id, { status: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleEditCommand = async (command: string) => {
        if (!activeImage) return;
        await processSingleImage(activeImage.id, 'EDIT', command, true);
    };

    const applyEdit = async (type: 'brightness' | 'saturation' | 'contrast', value: number) => {
        if (!activeImage) return;
        await processSingleImage(activeImage.id, 'EDIT', `${type}:${value}`, true);
    };

    return (
        <div style={{ width: '320px', borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column' }}>

            {/* Header Panel */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {editorMode === 'ADJUST' ? <Zap size={16} /> : <Scissors size={16} />}
                    {editorMode === 'ADJUST' ? 'Ajustes' : 'Editar recorte'}
                </h2>

                {editorMode === 'ADJUST' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <button
                            className="btn btn-primary"
                            onClick={() => activeImage && processSingleImage(activeImage.id, 'REMOVE_BG', undefined, false)}
                            disabled={!activeImage}
                            style={{ width: '100%', justifyContent: 'center' }}
                        >
                            <Scissors size={16} />
                            Quitar fondo de nuevo
                        </button>
                    </div>
                )}
            </div>

            <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>

                {editorMode === 'ADJUST' ? (
                    <>
                        {/* Brightness */}
                        <div style={{ marginBottom: '2rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                <Sun size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                                Luminosidad ({brightness}x)
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="range" min="0.5" max="2.0" step="0.1"
                                    value={brightness}
                                    onChange={(e) => setBrightness(parseFloat(e.target.value))}
                                    onMouseUp={() => applyEdit('brightness', brightness)}
                                    onTouchEnd={() => applyEdit('brightness', brightness)}
                                    style={{ flex: 1 }}
                                />
                            </div>
                        </div>

                        {/* Saturation */}
                        <div style={{ marginBottom: '2rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                <Palette size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                                Saturación ({saturation}x)
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="range" min="0.0" max="2.0" step="0.1"
                                    value={saturation}
                                    onChange={(e) => setSaturation(parseFloat(e.target.value))}
                                    onMouseUp={() => applyEdit('saturation', saturation)}
                                    onTouchEnd={() => applyEdit('saturation', saturation)}
                                    style={{ flex: 1 }}
                                />
                            </div>
                        </div>

                        {/* Contrast */}
                        <div style={{ marginBottom: '2rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                <Contrast size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                                Contraste ({contrast}x)
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="range" min="0.5" max="1.5" step="0.1"
                                    value={contrast}
                                    onChange={(e) => setContrast(parseFloat(e.target.value))}
                                    onMouseUp={() => applyEdit('contrast', contrast)}
                                    onTouchEnd={() => applyEdit('contrast', contrast)}
                                    style={{ flex: 1 }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '2rem' }}>
                            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Efectos</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => handleEditCommand('shadow')}
                                    disabled={!activeImage?.processed}
                                    style={{ width: '100%' }}
                                >
                                    <Cloud size={16} />
                                    Añadir sombra
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '2.5rem' }}>
                            <div
                                onClick={() => setBrushTool('ERASE')}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    cursor: 'pointer', opacity: brushTool === 'ERASE' ? 1 : 0.5
                                }}
                            >
                                <div style={{
                                    width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-surface-hover)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: brushTool === 'ERASE' ? '2px solid var(--color-primary)' : '2px solid transparent',
                                    marginBottom: '0.5rem'
                                }}>
                                    <div style={{ width: '20px', height: '20px', background: '#ef4444', borderRadius: '2px' }} />
                                </div>
                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Borrar</span>
                            </div>

                            <div
                                onClick={() => setBrushTool('RESTORE')}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    cursor: 'pointer', opacity: brushTool === 'RESTORE' ? 1 : 0.5
                                }}
                            >
                                <div style={{
                                    width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-surface-hover)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: brushTool === 'RESTORE' ? '2px solid var(--color-primary)' : '2px solid transparent',
                                    marginBottom: '0.5rem'
                                }}>
                                    <div style={{ width: '20px', height: '20px', background: 'white', border: '1px solid black', borderRadius: '50%' }} />
                                </div>
                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Restaurar</span>
                            </div>
                        </div>

                        <div style={{ marginBottom: '2rem' }}>
                            <div style={{ background: 'var(--color-surface-hover)', borderRadius: '99px', padding: '4px', display: 'flex' }}>
                                <button
                                    style={{
                                        flex: 1, border: 'none', background: 'var(--color-primary)', color: 'white',
                                        padding: '0.5rem', borderRadius: '99px', fontSize: '0.875rem', fontWeight: 500
                                    }}
                                >
                                    Manual
                                </button>
                                <button
                                    style={{
                                        flex: 1, border: 'none', background: 'transparent', color: 'var(--color-text-muted)',
                                        padding: '0.5rem', borderRadius: '99px', fontSize: '0.875rem', fontWeight: 500
                                    }}
                                    disabled
                                >
                                    Guiado (WIP)
                                </button>
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                TAMAÑO DEL PINCEL ({brushSize}px)
                            </label>
                            <input
                                type="range" min="5" max="100"
                                value={brushSize}
                                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                style={{ width: '100%' }}
                            />
                        </div>
                    </>
                )}

            </div>

            <div style={{ padding: '1rem', borderTop: '1px solid var(--color-border)', fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                SALON DE FOTOS v2.2
            </div>
        </div>
    );
}
