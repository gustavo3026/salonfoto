import { useStudio } from '../../context/StudioContext';
import { Pencil, Trash2, Plus, Loader2 } from 'lucide-react';

export function Dashboard() {
    const { images, selectImage, deleteImage, addImage } = useStudio();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            Array.from(e.target.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const result = e.target?.result as string;
                    addImage(result);
                };
                reader.readAsDataURL(file);
            });
        }
    };

    return (
        <div style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        Procesando {images.length} imágenes
                    </h2>
                    <p style={{ color: 'var(--color-text-muted)' }}>Listo para comenzar</p>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
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
                                    <div className="animate-spin" style={{ color: 'var(--color-primary)' }}>
                                        <Loader2 size={20} />
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
