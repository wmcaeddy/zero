/**
 * Home View Module
 * Handles Zero Access (SPA/MFA) and System Status
 */

const HomeView = {
    verifiedUser: null,

    init() {
        this.setupEventListeners();
        this.checkStatus();
    },

    setupEventListeners() {
        const verifyForm = document.getElementById('verifyIdentityForm');
        if (verifyForm) {
            verifyForm.onsubmit = this.handleVerify.bind(this);
        }

        const connectForm = document.getElementById('connectTargetForm');
        if (connectForm) {
            connectForm.onsubmit = this.handleConnect.bind(this);
        }
    },

    async checkStatus() {
        const statusEl = document.getElementById('status');
        if (!statusEl) return;

        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            if (data.configured) {
                statusEl.className = 'status ok';
                statusEl.textContent = typeof t === 'function' ? t('statusOk') : 'API Configured';
            } else {
                statusEl.className = 'status error';
                statusEl.textContent = typeof t === 'function' ? t('statusNotConfigured') : 'API Not Configured';
            }
            if (typeof log === 'function') log(data);
        } catch (e) {
            statusEl.className = 'status error';
            statusEl.textContent = (typeof t === 'function' ? t('statusError') : 'Error: ') + e.message;
        }
    },

    async handleVerify(e) {
        e.preventDefault();
        const user = document.getElementById('verifyUser').value;
        const otp = document.getElementById('verifyOtp').value;
        const btn = e.target.querySelector('button');

        btn.disabled = true;
        try {
            const res = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, otp })
            });
            const data = await res.json();
            if (typeof log === 'function') log(data);

            if (data.success) {
                this.verifiedUser = user;
                document.getElementById('stepVerify').style.display = 'none';
                document.getElementById('stepConnect').style.display = 'block';
            } else {
                alert('Verification Failed: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            alert('Error: ' + e.message);
        }
        btn.disabled = false;
    },

    async handleConnect(e) {
        e.preventDefault();
        if (!this.verifiedUser) {
            alert(typeof t === 'function' ? t('verifyFirst') : 'Please verify identity first');
            return;
        }

        const targetIp = document.getElementById('targetIp').value;
        const targetPort = document.getElementById('targetPort').value;
        const btn = e.target.querySelector('button');

        btn.disabled = true;
        try {
            const res = await fetch('/api/network/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetIp, port: targetPort })
            });
            const data = await res.json();
            if (typeof log === 'function') log(data);

            if (data.success) {
                alert(typeof t === 'function' ? t('accessGranted') : 'Access granted');
            } else {
                alert('Connection Failed: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            alert('Error: ' + e.message);
        }
        btn.disabled = false;
    }
};

// Export for use in other modules if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HomeView;
}
