/**
 * Assets View Module
 * Handles Asset Inventory Management
 */

const AssetsView = {
    init() {
        this.setupEventListeners();
        this.loadAssets();
    },

    setupEventListeners() {
        const addAssetForm = document.getElementById('addAssetForm');
        if (addAssetForm) {
            addAssetForm.onsubmit = this.handleAddAsset.bind(this);
        }
    },

    async loadAssets() {
        const list = document.getElementById('assetList');
        const policySelect = document.getElementById('policyAssetId');
        if (!list) return;

        try {
            const res = await fetch('/api/assets');
            const data = await res.json();

            // Render List
            if (data.data && data.data.length > 0) {
                list.innerHTML = data.data.map(a => `
                    <div class="user-item">
                        <div class="user-info">
                            <div class="user-name">${a.name}</div>
                            <div class="user-id">${a.ip} (${a.os})</div>
                        </div>
                        <div class="user-actions">
                            <button class="danger" onclick="AssetsView.deleteAsset('${a.id}')">${typeof t === 'function' ? t('delete') : 'Delete'}</button>
                        </div>
                    </div>
                `).join('');

                // Populate Policy Dropdown
                if (policySelect) {
                    policySelect.innerHTML = data.data.map(a => `<option value="${a.id}">${a.name} (${a.ip})</option>`).join('');
                }
            } else {
                list.innerHTML = `<div class="loading">${typeof t === 'function' ? t('noAssets') : 'No assets found'}</div>`;
                if (policySelect) policySelect.innerHTML = '';
            }
        } catch (e) {
            list.innerHTML = `<div class="loading">${typeof t === 'function' ? t('statusError') : 'Error: '} ${e.message}</div>`;
        }
    },

    async handleAddAsset(e) {
        e.preventDefault();
        const name = document.getElementById('assetName').value;
        const ip = document.getElementById('assetIp').value;

        try {
            const res = await fetch('/api/assets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, ip })
            });
            const data = await res.json();
            if (typeof log === 'function') log(data);
            
            e.target.reset();
            this.loadAssets();
        } catch (e) { 
            alert(e.message); 
        }
    },

    async deleteAsset(id) {
        if (!confirm(typeof t === 'function' ? t('deleteConfirm') : 'Are you sure?')) return;
        try {
            const res = await fetch('/api/assets/' + id, { method: 'DELETE' });
            const data = await res.json();
            if (typeof log === 'function') log(data);
            
            this.loadAssets();
            if (typeof PoliciesView !== 'undefined') {
                PoliciesView.loadPolicies(); // Refresh policies as some might reference deleted asset
            }
        } catch (e) {
            alert(e.message);
        }
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AssetsView;
}
