const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PUBLIC_DIR = path.join(__dirname, '../public');
const USERS_JS = path.join(PUBLIC_DIR, 'js', 'views', 'users.js');
const LEGACY_JS = path.join(PUBLIC_DIR, 'js', 'legacy.js');

console.log('Running Users View Refactor Tests...');

try {
    // 1. Check users.js structure
    const usersContent = fs.readFileSync(USERS_JS, 'utf8');
    assert.ok(usersContent.includes('const UsersView ='), 'UsersView should be defined');
    assert.ok(usersContent.includes('loadUsers()'), 'UsersView.loadUsers should be defined');
    assert.ok(usersContent.includes('loadSasUsers'), 'UsersView.loadSasUsers should be defined');
    assert.ok(usersContent.includes('handleProvisionToken'), 'UsersView.handleProvisionToken should be defined');
    console.log('✓ UsersView module structure is correct');

    // 2. Check legacy.js refactor
    const legacyContent = fs.readFileSync(LEGACY_JS, 'utf8');
    assert.ok(!legacyContent.includes('let selectedSasUsers = [];'), 'selectedSasUsers should be removed from legacy.js');
    assert.ok(!legacyContent.includes('function renderSasUsers(users)'), 'renderSasUsers should be removed from legacy.js');
    assert.ok(legacyContent.includes('UsersView.init()'), 'legacy.js should call UsersView.init()');
    console.log('✓ legacy.js successfully refactored');

    console.log('✓ Users View Refactor Tests Passed');
} catch (err) {
    console.error('✘ Test Failed:', err.message);
    process.exit(1);
}
