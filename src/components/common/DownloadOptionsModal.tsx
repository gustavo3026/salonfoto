import { X, Check } from 'lucide-react';

interface DownloadOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (useWhiteBackground: boolean) => void;
    count?: number;
}

export function DownloadOptionsModal({ isOpen, onClose, onConfirm, count = 1 }: DownloadOptionsModalProps) {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                background: '#1f2937', color: 'white', padding: '2rem', borderRadius: '12px',
                width: '100%', maxWidth: '400px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1px solid #374151'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Descargar {count > 1 ? `${count} Imágenes` : 'Imagen'}</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <p style={{ color: '#d1d5db', marginBottom: '2rem' }}>
                    ¿Cómo quieres descargar el resultado?
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <button
                        onClick={() => onConfirm(false)}
                        className="btn"
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            padding: '1rem', background: '#374151', border: '1px solid #4b5563', borderRadius: '8px',
                            color: 'white', cursor: 'pointer', fontWeight: 500, fontSize: '1rem'
                        }}
                    >
                        <div style={{ width: 16, height: 16, background: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)', backgroundSize: '8px 8px', backgroundColor: 'white', border: '1px solid #6b7280' }} />
                        Sin Fondo (PNG Transparente)
                    </button>

                    <button
                        onClick={() => onConfirm(true)}
                        className="btn"
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            padding: '1rem', background: 'white', border: 'none', borderRadius: '8px',
                            color: 'black', cursor: 'pointer', fontWeight: 600, fontSize: '1rem'
                        }}
                    >
                        <div style={{ width: 16, height: 16, background: 'white', border: '1px solid #e5e7eb' }} />
                        Con Fondo Blanco (JPG)
                    </button>
                </div>
            </div>
        </div>
    );
}
