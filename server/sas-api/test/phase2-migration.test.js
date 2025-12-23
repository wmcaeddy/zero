const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PUBLIC_DIR = path.join(__dirname, '../public');
const JS_DIR = path.join(PUBLIC_DIR, 'js');
const VIEWS_DIR = path.join(JS_DIR, 'views');

const FILES = [
    path.join(VIEWS_DIR, 'home.js'),
    path.join(VIEWS_DIR, 'assets.js'),
    path.join(VIEWS_DIR, 'policies.js'),
    path.join(VIEWS_DIR, 'users.js'),
    path.join(VIEWS_DIR, 'audit.js'),
    path.join(JS_DIR, 'legacy.js'),
    path.join(PUBLIC_DIR, 'index.html')
];

console.log('Running Phase 2 Migration Verification Tests...');

try {
    // 1. Verify all files exist
    FILES.forEach(f => {
        assert.ok(fs.existsSync(f), `${path.relative(PUBLIC_DIR, f)} missing`);
    });
    console.log('✓ All view modules and refactored files exist');

    // 2. Verify Index.html script tags
    const indexContent = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    const expectedScripts = [
        'js/legacy.js',
        'js/views/home.js',
        'js/views/assets.js',
        'js/views/policies.js',
        'js/views/users.js',
        'js/views/audit.js'
    ];
    expectedScripts.forEach(s => {
        assert.ok(indexContent.includes(`src="${s}"`), `Script tag for ${s} missing in index.html`);
    });
    console.log('✓ Index.html includes all module script tags');

    // 3. Verify Legacy.js is clean
    const legacyContent = fs.readFileSync(path.join(JS_DIR, 'legacy.js'), 'utf8');
    const removedTerms = [
        'async function loadAssets',
        'async function loadPolicies',
        'async function loadSasUsers',
        'async function checkStatus',
        'verifiedUser ='
    ];
    removedTerms.forEach(term => {
        assert.ok(!legacyContent.includes(term), `Legacy.js still contains refactored term: ${term}`);
    });
    console.log('✓ Legacy.js has been successfully cleaned of refactored logic');

    // 4. Verify View Inits in legacy.js
    const inits = [
        'HomeView.init()',
        'AssetsView.init()',
        'PoliciesView.init()',
        'UsersView.init()',
        'AuditView.init()'
    ];
    inits.forEach(i => {
        assert.ok(legacyContent.includes(i), `Legacy.js does not initialize: ${i}`);
    });
    console.log('✓ All view modules are initialized in legacy.js');

    console.log('✓ Phase 2 Migration Tests Passed');
} catch (err) {
    console.error('✘ Test Failed:', err.message);
    process.exit(1);
}
