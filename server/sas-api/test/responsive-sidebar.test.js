const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PUBLIC_DIR = path.join(__dirname, '../public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');
const LAYOUT_CSS = path.join(PUBLIC_DIR, 'css', 'layout.css');
const NAV_JS = path.join(PUBLIC_DIR, 'js', 'navigation.js');

console.log('Running Responsive Sidebar Tests...');

try {
    // 1. Check Index.html
    const indexContent = fs.readFileSync(INDEX_FILE, 'utf8');
    assert.ok(indexContent.includes('id="hamburgerBtn"'), 'hamburgerBtn missing');
    assert.ok(indexContent.includes('id="sidebarOverlay"'), 'sidebarOverlay missing');
    console.log('✓ HTML structure updated for responsiveness');

    // 2. Check Layout CSS
    const cssContent = fs.readFileSync(LAYOUT_CSS, 'utf8');
    assert.ok(cssContent.includes('@media (max-width: 768px)'), 'Media query missing');
    assert.ok(cssContent.includes('.sidebar.open'), 'Sidebar open state styling missing');
    assert.ok(cssContent.includes('.hamburger'), 'Hamburger styling missing');
    console.log('✓ CSS updated with media queries and toggle classes');

    // 3. Check Navigation JS
    const jsContent = fs.readFileSync(NAV_JS, 'utf8');
    assert.ok(jsContent.includes('hamburgerBtn.addEventListener'), 'Toggle listener missing');
    assert.ok(jsContent.includes('sidebar.classList.toggle(\'open\')'), 'Toggle logic missing');
    console.log('✓ Navigation JS updated with toggle logic');

    console.log('✓ Responsive Sidebar Tests Passed');
} catch (err) {
    console.error('✘ Test Failed:', err.message);
    process.exit(1);
}
