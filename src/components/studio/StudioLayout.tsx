import type { ReactNode } from 'react';

interface StudioLayoutProps {
    sidebar: ReactNode;
    canvas: ReactNode;
}

export function StudioLayout({ sidebar, canvas }: StudioLayoutProps) {
    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            <div style={{
                flex: 1,
                background: 'var(--color-background)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            }}>
                {canvas}
            </div>
            <aside style={{
                width: '320px',
                background: 'var(--color-surface)',
                borderLeft: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {sidebar}
            </aside>
        </div>
    );
}
