/**
 * Users View Module
 * Handles SCIM Users, SAS Users, and Token Provisioning
 */

const UsersView = {
    selectedSasUsers: [],
    sasCurrentPage: 1,
    sasTotalPages: 1,
    sasPageCache: {},

    init() {
        this.setupEventListeners();
        this.loadUsers(); // Load SCIM users
        // SAS users are loaded on refresh button click as per original UI
    },

    setupEventListeners() {
        const createUserForm = document.getElementById('createUserForm');
        if (createUserForm) {
            createUserForm.onsubmit = this.handleCreateUser.bind(this);
        }

        const provisionTokenForm = document.getElementById('provisionTokenForm');
        if (provisionTokenForm) {
            provisionTokenForm.onsubmit = this.handleProvisionToken.bind(this);
        }

        const refreshUsersBtn = document.getElementById('refreshUsers');
        if (refreshUsersBtn) {
            refreshUsersBtn.onclick = this.loadUsers.bind(this);
        }

        const refreshSasUsersBtn = document.getElementById('refreshSasUsers');
        if (refreshSasUsersBtn) {
            refreshSasUsersBtn.onclick = () => {
                this.sasPageCache = {};
                this.selectedSasUsers = [];
                this.loadSasUsers(1, true);
            };
        }

        const createSelectedInStaBtn = document.getElementById('createSelectedInSta');
        if (createSelectedInStaBtn) {
            createSelectedInStaBtn.onclick = this.createSelectedInSta.bind(this);
        }

        const sasPrevPageBtn = document.getElementById('sasPrevPage');
        if (sasPrevPageBtn) {
            sasPrevPageBtn.onclick = () => this.loadSasUsers(this.sasCurrentPage - 1);
        }

        const sasNextPageBtn = document.getElementById('sasNextPage');
        if (sasNextPageBtn) {
            sasNextPageBtn.onclick = () => this.loadSasUsers(this.sasCurrentPage + 1);
        }
    },

    // --- SCIM Users ---

    async loadUsers() {
        const list = document.getElementById('userList');
        if (!list) return;
        list.innerHTML = '<div class="loading">' + (typeof t === 'function' ? t('loading') : 'Loading...') + '</div>';
        try {
            const res = await fetch('/api/scim/users');
            const data = await res.json();
            if (typeof log === 'function') log(data);
            if (data.success && data.data.Resources) {
                if (data.data.Resources.length === 0) {
                    list.innerHTML = '<div class="loading">' + (typeof t === 'function' ? t('noUsers') : 'No users found') + '</div>';
                } else {
                    list.innerHTML = data.data.Resources.map(u => {
                        const emailValue = u.emails && u.emails.length > 0 ? u.emails[0].value : '';
                        return `
                        <div class="user-item">
                            <div class="user-info">
                                <div class="user-name">${u.name?.givenName || ''} ${u.name?.familyName || ''}</div>
                                <div class="user-id">${typeof t === 'function' ? t('idLabel') : 'ID: '}${u.userName || u.id}</div>
                                ${emailValue ? `<div class="user-id">${typeof t === 'function' ? t('emailLabel') : 'Email: '}${emailValue}</div>` : ''}
                            </div>
                            <div class="user-actions">
                                <button onclick="UsersView.selectUser('${u.userName || u.id}')">${typeof t === 'function' ? t('select') : 'Select'}</button>
                                <button class="danger" onclick="UsersView.deleteUser('${u.id}')">${typeof t === 'function' ? t('delete') : 'Delete'}</button>
                            </div>
                        </div>
                        `;
                    }).join('');
                }
            } else {
                list.innerHTML = '<div class="loading">' + (typeof t === 'function' ? t('failedToLoad') : 'Failed to load users') + '</div>';
            }
        } catch (e) {
            list.innerHTML = '<div class="loading">' + (typeof t === 'function' ? t('statusError') : 'Error: ') + e.message + '</div>';
        }
    },

    selectUser(userName) {
        const tokenUserEl = document.getElementById('tokenUserName');
        if (tokenUserEl) {
            tokenUserEl.value = userName;
            alert(typeof t === 'function' ? t('usernameCopied') : 'Username copied to token provision form');
        }
    },

    async deleteUser(id) {
        if (!confirm(typeof t === 'function' ? t('deleteConfirm') : 'Are you sure?')) return;
        try {
            const res = await fetch('/api/scim/users/' + id, { method: 'DELETE' });
            const data = await res.json();
            if (typeof log === 'function') log(data);
            this.loadUsers();
        } catch (e) {
            alert((typeof t === 'function' ? t('statusError') : 'Error: ') + e.message);
        }
    },

    async handleCreateUser(e) {
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
            if (typeof log === 'function') log(data);
            if (data.success) {
                alert((typeof t === 'function' ? t('userCreated') : 'User created: ') + (data.data?.id || 'See debug output'));
                e.target.reset();
                this.loadUsers();
            }
        } catch (e) {
            alert((typeof t === 'function' ? t('statusError') : 'Error: ') + e.message);
        }
        btn.disabled = false;
    },

    // --- SAS Users ---

    renderSasUsers(users) {
        const list = document.getElementById('sasUserList');
        if (!list) return;
        if (users.length === 0) {
            list.innerHTML = '<div class="loading">' + (typeof t === 'function' ? t('noUsers') : 'No users found') + '</div>';
        } else {
            list.innerHTML = users.map(u => {
                const userId = u.username || u.userid || '';
                const firstName = u.firstname || '';
                const lastName = u.lastname || '';
                const email = u.email || '';
                const authMethod = u.authmethod || '';
                const displayName = (firstName + ' ' + lastName).trim() || userId;
                const isSelected = this.selectedSasUsers.some(su => su.username === userId);
                return `
                <div class="user-item-sas">
                    <input type="checkbox" class="user-checkbox"
                        data-username="${userId}"
                        data-email="${email}"
                        data-firstname="${firstName}"
                        data-lastname="${lastName}"
                        ${isSelected ? 'checked' : ''}
                        onchange="UsersView.toggleSasUser(this)">
                    <div class="user-info">
                        <div class="user-name">${displayName}</div>
                        <div class="user-id">${typeof t === 'function' ? t('idLabel') : 'ID: '}${userId}</div>
                        ${firstName ? `<div class="user-id">${typeof t === 'function' ? t('firstName') : 'First Name'}: ${firstName}</div>` : ''}
                        ${lastName ? `<div class="user-id">${typeof t === 'function' ? t('lastName') : 'Last Name'}: ${lastName}</div>` : ''}
                        ${email ? `<div class="user-id">${typeof t === 'function' ? t('emailLabel') : 'Email: '}${email}</div>` : ''}
                        ${authMethod ? `<div class="user-id">Auth: ${authMethod}</div>` : ''}
                    </div>
                </div>
                `;
            }).join('');
        }
    },

    updateSasPagination(pagination) {
        const paginationEl = document.getElementById('sasPagination');
        const pageInfo = document.getElementById('sasPageInfo');
        const prevBtn = document.getElementById('sasPrevPage');
        const nextBtn = document.getElementById('sasNextPage');
        if (!paginationEl) return;

        this.sasCurrentPage = pagination.page;
        this.sasTotalPages = pagination.totalPages;

        const totalDisplay = pagination.totalPages === 1 && pagination.hasNextPage ? '?' : pagination.totalPages;
        pageInfo.textContent = `${pagination.page} / ${totalDisplay}`;
        prevBtn.disabled = !pagination.hasPrevPage;
        nextBtn.disabled = !pagination.hasNextPage;
        paginationEl.style.display = (pagination.hasNextPage || pagination.hasPrevPage || pagination.totalPages > 1) ? 'flex' : 'none';
    },

    async loadSasUsers(page = 1, forceRefresh = false) {
        const list = document.getElementById('sasUserList');
        if (!list) return;

        if (!forceRefresh && this.sasPageCache[page]) {
            const cachedData = this.sasPageCache[page];
            this.renderSasUsers(cachedData.users);
            this.updateSasPagination(cachedData.pagination);
            return;
        }

        list.innerHTML = '<div class="loading">' + (typeof t === 'function' ? t('loading') : 'Loading...') + '</div>';

        try {
            const refreshParam = forceRefresh ? '&refresh=true' : '';
            const res = await fetch(`/api/sas/users?page=${page}&pageSize=5${refreshParam}`);
            const data = await res.json();
            if (typeof log === 'function') log(data);

            if (data.success && data.users) {
                this.sasPageCache[page] = data;
                this.renderSasUsers(data.users);
                if (data.pagination) {
                    this.updateSasPagination(data.pagination);
                    this.prefetchAdjacentPages(page, data.pagination.totalPages);
                }
            } else {
                list.innerHTML = '<div class="loading">' + (typeof t === 'function' ? t('failedToLoad') : 'Failed to load users') + (data.error ? ': ' + data.error : '') + '</div>';
            }
        } catch (e) {
            list.innerHTML = '<div class="loading">' + (typeof t === 'function' ? t('statusError') : 'Error: ') + e.message + '</div>';
        }
    },

    async prefetchAdjacentPages(currentPage, totalPages) {
        const pagesToFetch = [currentPage - 1, currentPage + 1, currentPage + 2].filter(
            p => p >= 1 && p <= totalPages && !this.sasPageCache[p]
        );

        await Promise.all(pagesToFetch.map(async (p) => {
            try {
                const res = await fetch(`/api/sas/users?page=${p}&pageSize=5`);
                const data = await res.json();
                if (data.success) {
                    this.sasPageCache[p] = data;
                }
            } catch (e) { /* ignore prefetch errors */ }
        }));
    },

    toggleSasUser(checkbox) {
        const userData = {
            username: checkbox.dataset.username,
            email: checkbox.dataset.email,
            firstname: checkbox.dataset.firstname,
            lastname: checkbox.dataset.lastname
        };
        if (checkbox.checked) {
            this.selectedSasUsers.push(userData);
        } else {
            this.selectedSasUsers = this.selectedSasUsers.filter(u => u.username !== userData.username);
        }
    },

    async createSelectedInSta() {
        if (this.selectedSasUsers.length === 0) {
            alert(typeof t === 'function' ? t('noUsersSelected') : 'No users selected');
            return;
        }

        const btn = document.getElementById('createSelectedInSta');
        btn.disabled = true;
        let successCount = 0;
        let failCount = 0;

        for (const user of this.selectedSasUsers) {
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
                if (typeof log === 'function') log(data);
                if (data.success) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (e) {
                failCount++;
            }
        }

        alert((typeof t === 'function' ? t('usersCreatedResult') : 'Created: {success}, Failed: {fail}')
            .replace('{success}', successCount).replace('{fail}', failCount));
        
        this.selectedSasUsers = [];
        this.loadUsers();
        if (this.sasPageCache[this.sasCurrentPage]) {
            this.renderSasUsers(this.sasPageCache[this.sasCurrentPage].users);
        }
        btn.disabled = false;
    },

    // --- Token Provisioning ---

    async handleProvisionToken(e) {
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
            if (typeof log === 'function') log(data);
            if (data.success) {
                const results = data.provisioningResults || [];
                alert((typeof t === 'function' ? t('tokenProvisioned') : 'Token provisioned: ') + results.join(', '));
            } else {
                alert((typeof t === 'function' ? t('provisioningFailed') : 'Provisioning failed: ') + (data.error || 'See debug output'));
            }
        } catch (e) {
            alert((typeof t === 'function' ? t('statusError') : 'Error: ') + e.message);
        }
        btn.disabled = false;
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UsersView;
}
