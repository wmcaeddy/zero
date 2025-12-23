const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PUBLIC_DIR = path.join(__dirname, '../public');
const HOME_JS = path.join(PUBLIC_DIR, 'js', 'views', 'home.js');
const LEGACY_JS = path.join(PUBLIC_DIR, 'js', 'legacy.js');

console.log('Running Home View Refactor Tests...');

try {
    // 1. Check home.js content
    const homeContent = fs.readFileSync(HOME_JS, 'utf8');
    assert.ok(homeContent.includes('const HomeView ='), 'HomeView should be defined');
    assert.ok(homeContent.includes('init()'), 'HomeView.init should be defined');
    assert.ok(homeContent.includes('handleVerify(e)'), 'HomeView.handleVerify should be defined');
    assert.ok(homeContent.includes('handleConnect(e)'), 'HomeView.handleConnect should be defined');
    console.log('✓ HomeView module structure is correct');

    // 2. Check legacy.js refactor
    const legacyContent = fs.readFileSync(LEGACY_JS, 'utf8');
    assert.ok(!legacyContent.includes('let verifiedUser = null;'), 'verifiedUser should be removed from legacy.js');
    assert.ok(!legacyContent.includes('function checkStatus()'), 'checkStatus should be removed from legacy.js');
    assert.ok(legacyContent.includes('HomeView.init()'), 'legacy.js should call HomeView.init()');
    console.log('✓ legacy.js successfully refactored');

    console.log('✓ Home View Refactor Tests Passed');
} catch (err) {
    console.error('✘ Test Failed:', err.message);
    process.exit(1);
}
