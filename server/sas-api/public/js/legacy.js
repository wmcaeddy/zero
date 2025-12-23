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

    async function checkStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.configured) {
          statusEl.className = 'status ok';
          statusEl.textContent = t('statusOk');
        } else {
          statusEl.className = 'status error';
          statusEl.textContent = t('statusNotConfigured');
        }
        log(data);
      } catch (e) {
        statusEl.className = 'status error';
        statusEl.textContent = t('statusError') + e.message;
      }
    }

    async function loadUsers() {
      const list = document.getElementById('userList');
      list.innerHTML = '<div class="loading">' + t('loading') + '</div>';
      try {
        const res = await fetch('/api/scim/users');
        const data = await res.json();
        log(data);
        if (data.success && data.data.Resources) {
          if (data.data.Resources.length === 0) {
            list.innerHTML = '<div class="loading">' + t('noUsers') + '</div>';
          } else {
            list.innerHTML = data.data.Resources.map(u => {
              const emailValue = u.emails && u.emails.length > 0 ? u.emails[0].value : '';
              return `
              <div class="user-item">
                <div class="user-info">
                  <div class="user-name">${u.name?.givenName || ''} ${u.name?.familyName || ''}</div>
                  <div class="user-id">${t('idLabel')}${u.userName || u.id}</div>
                  ${emailValue ? `<div class="user-id">${t('emailLabel')}${emailValue}</div>` : ''}
                </div>
                <div class="user-actions">
                  <button onclick="selectUser('${u.userName || u.id}')">${t('select')}</button>
                  <button class="danger" onclick="deleteUser('${u.id}')">${t('delete')}</button>
                </div>
              </div>
              `;
            }).join('');
          }
        } else {
          list.innerHTML = '<div class="loading">' + t('failedToLoad') + '</div>';
        }
      } catch (e) {
        list.innerHTML = '<div class="loading">' + t('statusError') + e.message + '</div>';
      }
    }

    function selectUser(userName) {
      document.getElementById('tokenUserName').value = userName;
      alert(t('usernameCopied'));
    }

    async function deleteUser(id) {
      if (!confirm(t('deleteConfirm'))) return;
      try {
        const res = await fetch('/api/scim/users/' + id, { method: 'DELETE' });
        const data = await res.json();
        log(data);
        loadUsers();
      } catch (e) {
        alert(t('statusError') + e.message);
      }
    }

    // SAS Users functions
    let selectedSasUsers = [];
    let sasCurrentPage = 1;
    let sasTotalPages = 1;
    let sasPageCache = {}; // Cache for prefetched pages

    function renderSasUsers(users) {
      const list = document.getElementById('sasUserList');
      if (users.length === 0) {
        list.innerHTML = '<div class="loading">' + t('noUsers') + '</div>';
      } else {
        list.innerHTML = users.map(u => {
          const userId = u.username || u.userid || '';
          const firstName = u.firstname || '';
          const lastName = u.lastname || '';
          const email = u.email || '';
          const authMethod = u.authmethod || '';
          const displayName = (firstName + ' ' + lastName).trim() || userId;
          const isSelected = selectedSasUsers.some(su => su.username === userId);
          return `
          <div class="user-item-sas">
            <input type="checkbox" class="user-checkbox"
              data-username="${userId}"
              data-email="${email}"
              data-firstname="${firstName}"
              data-lastname="${lastName}"
              ${isSelected ? 'checked' : ''}
              onchange="toggleSasUser(this)">
            <div class="user-info">
              <div class="user-name">${displayName}</div>
              <div class="user-id">${t('idLabel')}${userId}</div>
              ${firstName ? `<div class="user-id">${t('firstName')}: ${firstName}</div>` : ''}
              ${lastName ? `<div class="user-id">${t('lastName')}: ${lastName}</div>` : ''}
              ${email ? `<div class="user-id">${t('emailLabel')}${email}</div>` : ''}
              ${authMethod ? `<div class="user-id">Auth: ${authMethod}</div>` : ''}
            </div>
          </div>
        `;
        }).join('');
      }
    }

    function updateSasPagination(pagination) {
      const paginationEl = document.getElementById('sasPagination');
      const pageInfo = document.getElementById('sasPageInfo');
      const prevBtn = document.getElementById('sasPrevPage');
      const nextBtn = document.getElementById('sasNextPage');

      sasCurrentPage = pagination.page;
      sasTotalPages = pagination.totalPages;

      // Show "1 / ?" while background is fetching full list
      const totalDisplay = pagination.totalPages === 1 && pagination.hasNextPage ? '?' : pagination.totalPages;
      pageInfo.textContent = `${pagination.page} / ${totalDisplay}`;
      prevBtn.disabled = !pagination.hasPrevPage;
      nextBtn.disabled = !pagination.hasNextPage;
      // Show pagination if there's a next page OR more than 1 page
      paginationEl.style.display = (pagination.hasNextPage || pagination.hasPrevPage || pagination.totalPages > 1) ? 'flex' : 'none';
    }

    async function loadSasUsers(page = 1, forceRefresh = false) {
      const list = document.getElementById('sasUserList');

      // Check frontend cache first (for instant navigation without network)
      if (!forceRefresh && sasPageCache[page]) {
        const cachedData = sasPageCache[page];
        renderSasUsers(cachedData.users);
        updateSasPagination(cachedData.pagination);
        log({ ...cachedData, _source: 'frontend-cache' });
        return;
      }

      list.innerHTML = '<div class="loading">' + t('loading') + '</div>';

      try {
        const refreshParam = forceRefresh ? '&refresh=true' : '';
        const res = await fetch(`/api/sas/users?page=${page}&pageSize=5${refreshParam}`);
        const data = await res.json();
        log(data);

        if (data.success && data.users) {
          sasPageCache[page] = data; // Cache in frontend for instant re-access
          renderSasUsers(data.users);
          if (data.pagination) {
            updateSasPagination(data.pagination);
            // Pre-cache adjacent pages from server (already fast due to server cache)
            prefetchAdjacentPages(page, data.pagination.totalPages);
          }
        } else {
          list.innerHTML = '<div class="loading">' + t('failedToLoad') + (data.error ? ': ' + data.error : '') + '</div>';
        }
      } catch (e) {
        list.innerHTML = '<div class="loading">' + t('statusError') + e.message + '</div>';
      }
    }

    // Prefetch adjacent pages in background (server responds instantly from cache)
    async function prefetchAdjacentPages(currentPage, totalPages) {
      const pagesToFetch = [currentPage - 1, currentPage + 1, currentPage + 2].filter(
        p => p >= 1 && p <= totalPages && !sasPageCache[p]
      );

      // Fetch all adjacent pages in parallel (server has full cache, so this is fast)
      await Promise.all(pagesToFetch.map(async (p) => {
        try {
          const res = await fetch(`/api/sas/users?page=${p}&pageSize=5`);
          const data = await res.json();
          if (data.success) {
            sasPageCache[p] = data;
            console.log(`Page ${p} cached`);
          }
        } catch (e) { /* ignore prefetch errors */ }
      }));
    }

    function toggleSasUser(checkbox) {
      const userData = {
        username: checkbox.dataset.username,
        email: checkbox.dataset.email,
        firstname: checkbox.dataset.firstname,
        lastname: checkbox.dataset.lastname
      };
      if (checkbox.checked) {
        selectedSasUsers.push(userData);
      } else {
        selectedSasUsers = selectedSasUsers.filter(u => u.username !== userData.username);
      }
    }

    async function createSelectedInSta() {
      if (selectedSasUsers.length === 0) {
        alert(t('noUsersSelected'));
        return;
      }

      const btn = document.getElementById('createSelectedInSta');
      btn.disabled = true;
      let successCount = 0;
      let failCount = 0;

      for (const user of selectedSasUsers) {
        try {
          const res = await fetch('/api/scim/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.username,
              email: user.email || user.username + '@placeholder.local',
              givenName: user.firstname || user.username,
              familyName: user.lastname || ''
            })
          });
          const data = await res.json();
          log(data);
          if (data.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (e) {
          failCount++;
        }
      }

      alert(t('usersCreatedResult').replace('{success}', successCount).replace('{fail}', failCount));
      selectedSasUsers = [];
      loadUsers(); // Refresh STA users to show newly created
      // Re-render SAS list from cache with cleared checkboxes (no need to re-fetch)
      if (sasPageCache[sasCurrentPage]) {
        renderSasUsers(sasPageCache[sasCurrentPage].users);
      }
      btn.disabled = false;
    }

    document.getElementById('refreshSasUsers').onclick = () => {
      sasPageCache = {}; // Clear cache on refresh
      selectedSasUsers = []; // Clear selections
      loadSasUsers(1, true);
    };
    document.getElementById('createSelectedInSta').onclick = createSelectedInSta;
    document.getElementById('sasPrevPage').onclick = () => loadSasUsers(sasCurrentPage - 1);
    document.getElementById('sasNextPage').onclick = () => loadSasUsers(sasCurrentPage + 1);

    document.getElementById('createUserForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        const res = await fetch('/api/scim/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: document.getElementById('userId').value,
            email: document.getElementById('emailAddress').value,
            givenName: document.getElementById('givenName').value,
            familyName: document.getElementById('familyName').value
          })
        });
        const data = await res.json();
        log(data);
        if (data.success) {
          alert(t('userCreated') + (data.data?.id || t('seeDebug')));
          e.target.reset();
          loadUsers();
        }
      } catch (e) {
        alert(t('statusError') + e.message);
      }
      btn.disabled = false;
    };

    document.getElementById('provisionTokenForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        const res = await fetch('/api/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName: document.getElementById('tokenUserName').value,
            tokenType: document.getElementById('tokenType').value,
            description: document.getElementById('tokenDescription').value
          })
        });
        const data = await res.json();
        log(data);
        if (data.success) {
          const results = data.provisioningResults || [];
          alert(t('tokenProvisioned') + results.join(', '));
        } else {
          alert(t('provisioningFailed') + (data.error || t('seeDebug')));
        }
      } catch (e) {
        alert(t('statusError') + e.message);
      }
      btn.disabled = false;
    };

    document.getElementById('refreshUsers').onclick = loadUsers;

    // Zero Access Logic
    let verifiedUser = null;

    document.getElementById('verifyIdentityForm').onsubmit = async (e) => {
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
        log(data);

        if (data.success) {
          verifiedUser = user;
          document.getElementById('stepVerify').style.display = 'none';
          document.getElementById('stepConnect').style.display = 'block';
        } else {
          alert('Verification Failed: ' + (data.error || 'Unknown error'));
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
      btn.disabled = false;
    };

    document.getElementById('connectTargetForm').onsubmit = async (e) => {
      e.preventDefault();
      if (!verifiedUser) {
        alert(t('verifyFirst'));
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
        log(data);

        if (data.success) {
          alert(t('accessGranted'));
        } else {
          alert('Connection Failed: ' + (data.error || 'Unknown error'));
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
      btn.disabled = false;
    };

    // Tokens section commented out
    // document.getElementById('refreshTokens').onclick = async () => {
    //   try {
    //     const res = await fetch('/api/tokens');
    //     const data = await res.json();
    //     log(data);
    //   } catch (e) {
    //     alert('Error: ' + e.message);
    //   }
    // };

    // --- ZERO NETWORKS FRONTEND LOGIC ---

    // Assets
    async function loadAssets() {
      const list = document.getElementById('assetList');
      const policySelect = document.getElementById('policyAssetId');

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
                <button class="danger" onclick="deleteAsset('${a.id}')">${t('delete')}</button>
              </div>
            </div>
          `).join('');

          // Populate Policy Dropdown
          policySelect.innerHTML = data.data.map(a => `<option value="${a.id}">${a.name} (${a.ip})</option>`).join('');
        } else {
          list.innerHTML = `<div class="loading">${t('noAssets')}</div>`;
          policySelect.innerHTML = '';
        }
      } catch (e) {
        list.innerHTML = `<div class="loading">${t('statusError')} ${e.message}</div>`;
      }
    }

    document.getElementById('addAssetForm').onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById('assetName').value;
      const ip = document.getElementById('assetIp').value;

      try {
        await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, ip })
        });
        e.target.reset();
        loadAssets();
      } catch (e) { alert(e.message); }
    };

    async function deleteAsset(id) {
      if (!confirm(t('deleteConfirm'))) return;
      await fetch('/api/assets/' + id, { method: 'DELETE' });
      loadAssets();
      loadPolicies(); // Refresh policies as some might reference deleted asset
    }

    // Policies
    async function loadPolicies() {
      const list = document.getElementById('policyList');
      try {
        const res = await fetch('/api/policies');
        const data = await res.json();

        if (data.data && data.data.length > 0) {
          // Enh: efficient lookup for asset names would be better, but this is fine for prototype
          // We can fetch assets again or use a global cache if needed.
          // For now, raw ID display or simple match if we have asset list in memory? 
          // Let's just display data raw-ish for speed.
          list.innerHTML = data.data.map(p => `
             <div class="user-item">
              <div class="user-info">
                <div class="user-name">${p.user} -> Asset:${p.assetId}</div>
                <div class="user-id">Port: ${p.port} (${p.action})</div>
              </div>
              <div class="user-actions">
                <button class="danger" onclick="deletePolicy('${p.id}')">${t('delete')}</button>
              </div>
            </div>
          `).join('');
        } else {
          list.innerHTML = `<div class="loading">${t('noPolicies')}</div>`;
        }
      } catch (e) {
        list.innerHTML = `<div class="loading">${t('statusError')} ${e.message}</div>`;
      }
    }

    document.getElementById('addPolicyForm').onsubmit = async (e) => {
      e.preventDefault();
      const user = document.getElementById('policyUser').value;
      const assetId = document.getElementById('policyAssetId').value;
      const port = document.getElementById('policyPort').value;

      try {
        await fetch('/api/policies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user, assetId, port })
        });
        e.target.reset();
        loadPolicies();
      } catch (e) { alert(e.message); }
    };

    async function deletePolicy(id) {
      if (!confirm(t('deleteConfirm'))) return;
      await fetch('/api/policies/' + id, { method: 'DELETE' });
      loadPolicies();
    }

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
      checkStatus();
      loadAssets();
      loadPolicies();
      loadAudit();
    });
