const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PUBLIC_DIR = path.join(__dirname, '../public');
const ASSETS_JS = path.join(PUBLIC_DIR, 'js', 'views', 'assets.js');
const POLICIES_JS = path.join(PUBLIC_DIR, 'js', 'views', 'policies.js');
const LEGACY_JS = path.join(PUBLIC_DIR, 'js', 'legacy.js');

console.log('Running Assets & Policies Refactor Tests...');

try {
    // 1. Check assets.js
    const assetsContent = fs.readFileSync(ASSETS_JS, 'utf8');
    assert.ok(assetsContent.includes('const AssetsView ='), 'AssetsView should be defined');
    assert.ok(assetsContent.includes('loadAssets()'), 'AssetsView.loadAssets should be defined');
    console.log('✓ AssetsView module structure is correct');

    // 2. Check policies.js
    const policiesContent = fs.readFileSync(POLICIES_JS, 'utf8');
    assert.ok(policiesContent.includes('const PoliciesView ='), 'PoliciesView should be defined');
    assert.ok(policiesContent.includes('loadPolicies()'), 'PoliciesView.loadPolicies should be defined');
    console.log('✓ PoliciesView module structure is correct');

    // 3. Check legacy.js refactor
    const legacyContent = fs.readFileSync(LEGACY_JS, 'utf8');
    assert.ok(!legacyContent.includes('async function loadAssets()'), 'loadAssets should be removed from legacy.js');
    assert.ok(!legacyContent.includes('async function loadPolicies()'), 'loadPolicies should be removed from legacy.js');
    assert.ok(legacyContent.includes('AssetsView.init()'), 'legacy.js should call AssetsView.init()');
    assert.ok(legacyContent.includes('PoliciesView.init()'), 'legacy.js should call PoliciesView.init()');
    console.log('✓ legacy.js successfully refactored');

    console.log('✓ Assets & Policies Refactor Tests Passed');
} catch (err) {
    console.error('✘ Test Failed:', err.message);
    process.exit(1);
}
