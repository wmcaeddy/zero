/**
 * Policies View Module
 * Handles Policy/Rules Management
 */

const PoliciesView = {
    init() {
        this.setupEventListeners();
        this.loadPolicies();
    },

    setupEventListeners() {
        const addPolicyForm = document.getElementById('addPolicyForm');
        if (addPolicyForm) {
            addPolicyForm.onsubmit = this.handleAddPolicy.bind(this);
        }
    },

    async loadPolicies() {
        const list = document.getElementById('policyList');
        if (!list) return;

        try {
            const res = await fetch('/api/policies');
            const data = await res.json();

            if (data.data && data.data.length > 0) {
                list.innerHTML = data.data.map(p => `
                    <div class="user-item">
                        <div class="user-info">
                            <div class="user-name">${p.user} -> Asset:${p.assetId}</div>
                            <div class="user-id">Port: ${p.port} (${p.action})</div>
                        </div>
                        <div class="user-actions">
                            <button class="danger" onclick="PoliciesView.deletePolicy('${p.id}')">${typeof t === 'function' ? t('delete') : 'Delete'}</button>
                        </div>
                    </div>
                `).join('');
            } else {
                list.innerHTML = `<div class="loading">${typeof t === 'function' ? t('noPolicies') : 'No policies found'}</div>`;
            }
        } catch (e) {
            list.innerHTML = `<div class="loading">${typeof t === 'function' ? t('statusError') : 'Error: '} ${e.message}</div>`;
        }
    },

    async handleAddPolicy(e) {
        e.preventDefault();
        const user = document.getElementById('policyUser').value;
        const assetId = document.getElementById('policyAssetId').value;
        const port = document.getElementById('policyPort').value;

        try {
            const res = await fetch('/api/policies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user, assetId, port })
            });
            const data = await res.json();
            if (typeof log === 'function') log(data);

            e.target.reset();
            this.loadPolicies();
        } catch (e) { 
            alert(e.message); 
        }
    },

    async deletePolicy(id) {
        if (!confirm(typeof t === 'function' ? t('deleteConfirm') : 'Are you sure?')) return;
        try {
            const res = await fetch('/api/policies/' + id, { method: 'DELETE' });
            const data = await res.json();
            if (typeof log === 'function') log(data);
            
            this.loadPolicies();
        } catch (e) {
            alert(e.message);
        }
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PoliciesView;
}
