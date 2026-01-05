import { ChevronRight } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';


export function Header() {
    const { images, selectedId, isProcessing, setViewMode, viewMode, editorMode, setEditorMode } = useStudio();

    const activeImage = images.find(img => img.id === selectedId);

    const handleSaveCurrent = () => {
        // "Hecho" action: Just return to Dashboard. 
        setViewMode('DASHBOARD');
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
