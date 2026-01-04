// Simple event-based logger
// Dispatches custom events that the LogConsole component can listen to

export const logger = {
    log: (message: string, data?: any) => {
        const event = new CustomEvent('salon-log', {
            detail: { type: 'info', message, data, timestamp: new Date().toISOString() }
        });
        window.dispatchEvent(event);
        console.log(`[SalonFoto] ${message}`, data || '');
    },

    error: (message: string, error?: any) => {
        const event = new CustomEvent('salon-log', {
            detail: { type: 'error', message, data: error, timestamp: new Date().toISOString() }
        });
        window.dispatchEvent(event);
        console.error(`[SalonFoto] ${message}`, error || '');
    },

    clear: () => {
        const event = new CustomEvent('salon-clear-logs');
        window.dispatchEvent(event);
    }
};
