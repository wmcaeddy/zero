/**
 * Audit View Module
 * Handles real-time Audit Log display
 */

const AuditView = {
    init() {
        this.loadAudit();
        // Poll logs every 5s
        setInterval(this.loadAudit.bind(this), 5000);
    },

    async loadAudit() {
        const list = document.getElementById('auditList');
        if (!list) return;

        try {
            const res = await fetch('/api/audit');
            const data = await res.json();

            if (data.data && data.data.length > 0) {
                list.innerHTML = data.data.map(l => `
                    <div class="user-item" style="border-left: 4px solid ${l.success ? '#4caf50' : '#f44336'}">
                        <div class="user-info">
                            <div class="user-name">${l.user} [${l.action}]</div>
                            <div class="user-id">${new Date(l.timestamp).toLocaleString()} - ${l.details || ''}</div>
                        </div>
                    </div>
                `).join('');
            } else {
                list.innerHTML = `<div class="loading">${typeof t === 'function' ? t('noLogs') : 'No logs found'}</div>`;
            }
        } catch (e) {
            list.innerHTML = `<div class="loading">${typeof t === 'function' ? t('statusError') : 'Error: '} ${e.message}</div>`;
        }
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuditView;
}
