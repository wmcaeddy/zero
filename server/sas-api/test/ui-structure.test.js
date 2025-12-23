const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PUBLIC_DIR = path.join(__dirname, '../public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');
const LEGACY_CSS = path.join(PUBLIC_DIR, 'css', 'legacy.css');
const LAYOUT_CSS = path.join(PUBLIC_DIR, 'css', 'layout.css');
const LEGACY_JS = path.join(PUBLIC_DIR, 'js', 'legacy.js');
const NAV_JS = path.join(PUBLIC_DIR, 'js', 'navigation.js');

console.log('Running UI Structure Tests...');

try {
    // 1. Check Files Exist
    assert.ok(fs.existsSync(INDEX_FILE), 'index.html missing');
    assert.ok(fs.existsSync(LEGACY_CSS), 'css/legacy.css missing');
    assert.ok(fs.existsSync(LAYOUT_CSS), 'css/layout.css missing');
    assert.ok(fs.existsSync(LEGACY_JS), 'js/legacy.js missing');
    assert.ok(fs.existsSync(NAV_JS), 'js/navigation.js missing');
    console.log('✓ All required files exist');

    // 2. Check Index.html Links
    const indexContent = fs.readFileSync(INDEX_FILE, 'utf8');
    assert.ok(indexContent.includes('href="css/legacy.css"'), 'Link to legacy.css missing');
    assert.ok(indexContent.includes('href="css/layout.css"'), 'Link to layout.css missing');
    assert.ok(indexContent.includes('src="js/legacy.js"'), 'Script tag for legacy.js missing');
    assert.ok(indexContent.includes('src="js/navigation.js"'), 'Script tag for navigation.js missing');
    console.log('✓ Index.html correctly links resources');

    // 3. Check App Shell Structure
    assert.ok(indexContent.includes('class="app-shell"'), '.app-shell missing');
    assert.ok(indexContent.includes('class="sidebar"'), '.sidebar missing');
    assert.ok(indexContent.includes('class="main-content"'), '.main-content missing');
    console.log('✓ App Shell DOM structure is correct');

    console.log('✓ UI Structure Tests Passed');
} catch (err) {
    console.error('✘ Test Failed:', err.message);
    process.exit(1);
}
