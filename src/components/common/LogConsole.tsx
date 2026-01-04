import { useEffect, useState, useRef } from 'react';
import { Terminal, XCircle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

interface LogMessage {
    type: 'info' | 'error';
    message: string;
    data?: any;
    timestamp: string;
}

export function LogConsole() {
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [isOpen, setIsOpen] = useState(true); // Open by default specifically for debugging session
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleLog = (event: Event) => {
            const customEvent = event as CustomEvent;
            setLogs(prev => [...prev, customEvent.detail]);
            if (!isOpen) setIsOpen(true); // Auto open on new log
        };

        const handleClear = () => {
            setLogs([]);
        };

        window.addEventListener('salon-log', handleLog);
        window.addEventListener('salon-clear-logs', handleClear);

        return () => {
            window.removeEventListener('salon-log', handleLog);
            window.removeEventListener('salon-clear-logs', handleClear);
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isOpen]);

    if (!isOpen) {
        return (
            <div
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '1rem',
                    right: '1rem',
                    background: '#1f2937',
                    color: '#e5e7eb',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    zIndex: 9999
                }}
            >
                <Terminal size={16} />
                <span>Mostrar Logs ({logs.length})</span>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: '300px',
            background: '#111827',
            color: '#e5e7eb',
            borderTop: '1px solid #374151',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            fontFamily: 'monospace'
        }}>
            {/* Header */}
            <div style={{
                padding: '0.5rem 1rem',
                background: '#1f2937',
                borderBottom: '1px solid #374151',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Terminal size={16} className="text-blue-400" />
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Monitor de Depuración (Backend Debug)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                        onClick={() => setLogs([])}
                        title="Limpiar logs"
                        style={{ padding: '4px', background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                    >
                        <Trash2 size={16} />
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        title="Minimizar"
                        style={{ padding: '4px', background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                    >
                        <ChevronDown size={16} />
                    </button>
                </div>
            </div>

            {/* Logs Body */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem',
                fontSize: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem'
            }}>
                {logs.length === 0 && (
                    <div style={{ color: '#6b7280', fontStyle: 'italic', textAlign: 'center', marginTop: '2rem' }}>
                        Esperando actividad... Sube una imagen para ver los logs.
                    </div>
                )}

                {logs.map((log, idx) => (
                    <div key={idx} style={{
                        display: 'flex',
                        gap: '0.75rem',
                        padding: '2px 0',
                        color: log.type === 'error' ? '#fca5a5' : '#e5e7eb'
                    }}>
                        <span style={{ color: '#6b7280', flexShrink: 0 }}>
                            {log.timestamp.split('T')[1].split('.')[0]}
                        </span>
                        <div style={{ flex: 1 }}>
                            <span style={{
                                display: 'inline-block',
                                marginRight: '0.5rem',
                                color: log.type === 'error' ? '#ef4444' : '#60a5fa',
                                fontWeight: 'bold'
                            }}>
                                [{log.type.toUpperCase()}]
                            </span>
                            {log.message}
                            {log.data && (
                                <pre style={{
                                    background: 'rgba(0,0,0,0.3)',
                                    padding: '0.5rem',
                                    borderRadius: '4px',
                                    marginTop: '0.25rem',
                                    whiteSpace: 'pre-wrap',
                                    overflowX: 'auto'
                                }}>
                                    {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                                </pre>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
}
