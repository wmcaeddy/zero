    const debugEl = document.getElementById('debugOutput');
    const statusEl = document.getElementById('status');
    let translations = {};
    let currentLang = localStorage.getItem('lang') || 'en';

    // Load translations and initialize language
    async function initI18n() {
      try {
        const res = await fetch('/translations.json');
        translations = await res.json();
        document.getElementById('langSelect').value = currentLang;
        applyTranslations(currentLang);
      } catch (e) {
        console.error('Failed to load translations:', e);
      }
    }

    function applyTranslations(lang) {
      const t = translations[lang];
      if (!t) return;

      // Update HTML lang attribute
      document.documentElement.lang = lang;

      // Translate text content
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) {
          el.textContent = t[key];
        }
      });

      // Translate placeholders
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (t[key]) {
          el.placeholder = t[key];
        }
      });

      currentLang = lang;
      localStorage.setItem('lang', lang);
    }

    function t(key) {
      return translations[currentLang]?.[key] || key;
    }

    document.getElementById('langSelect').onchange = (e) => {
      applyTranslations(e.target.value);
    };

    function formatDebugOutput(data) {
      let output = '';

      // Show REQUEST section if available
      if (data.debug && data.debug.request) {
        const req = data.debug.request;
        output += '=== REQUEST ===\n';
        output += `Method: ${req.method}\n`;
        output += `URL: ${req.url}\n`;

        if (req.headers) {
          output += '\nHeaders:\n';
          for (const [key, value] of Object.entries(req.headers)) {
            output += `  ${key}: ${value}\n`;
          }
        }

        if (req.soapAction) {
          output += `\nSOAP Action: ${req.soapAction}\n`;
        }

        if (req.body || req.parameters) {
          output += '\nPayload:\n';
          if (req.soapEnvelope) {
            output += req.soapEnvelope + '\n';
          } else if (req.body) {
            output += JSON.stringify(req.body, null, 2) + '\n';
          }
          if (req.parameters) {
            output += '\nParameters: ' + JSON.stringify(req.parameters, null, 2) + '\n';
          }
        }

        if (req.note) {
          output += `\nNote: ${req.note}\n`;
        }

        output += '\n';
      }

      // Show RESPONSE section if available
      if (data.debug && data.debug.response) {
        const res = data.debug.response;
        output += '=== RESPONSE ===\n';
        output += `Status: ${res.status} ${res.statusText || ''}\n`;

        if (res.headers) {
          output += '\nHeaders:\n';
          for (const [key, value] of Object.entries(res.headers)) {
            if (value) output += `  ${key}: ${value}\n`;
          }
        }

        output += '\n';
      }

      // Show full response data
      output += '=== FULL RESPONSE ===\n';
      output += JSON.stringify(data, null, 2);

      return output;
    }

    function log(data) {
      // Use enhanced formatting if debug info is available
      if (data.debug && (data.debug.request || data.debug.response)) {
        debugEl.textContent = formatDebugOutput(data);
      } else {
        debugEl.textContent = JSON.stringify(data, null, 2);
      }
    }

    async function loadUsers() {
      // Placeholder: UsersView handles this now
    }

    // --- ZERO NETWORKS FRONTEND LOGIC ---

    // Audit Logs
    async function loadAudit() {
      const list = document.getElementById('auditList');
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
          list.innerHTML = `<div class="loading">${t('noLogs')}</div>`;
        }
      } catch (e) {
        list.innerHTML = `<div class="loading">${t('statusError')} ${e.message}</div>`;
      }
    }

    // Poll logs every 5s
    setInterval(loadAudit, 5000);

    // Initialize translations first, then check API status
    initI18n().then(() => {
      if (typeof HomeView !== 'undefined') HomeView.init();
      if (typeof AssetsView !== 'undefined') AssetsView.init();
      if (typeof PoliciesView !== 'undefined') PoliciesView.init();
      if (typeof UsersView !== 'undefined') UsersView.init();
      loadAudit();
    });
