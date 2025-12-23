const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PUBLIC_DIR = path.join(__dirname, '../public');
const AUDIT_JS = path.join(PUBLIC_DIR, 'js', 'views', 'audit.js');
const LEGACY_JS = path.join(PUBLIC_DIR, 'js', 'legacy.js');

console.log('Running Audit View Refactor Tests...');

try {
    // 1. Check audit.js structure
    const auditContent = fs.readFileSync(AUDIT_JS, 'utf8');
    assert.ok(auditContent.includes('const AuditView ='), 'AuditView should be defined');
    assert.ok(auditContent.includes('loadAudit()'), 'AuditView.loadAudit should be defined');
    assert.ok(auditContent.includes('setInterval'), 'AuditView should setup polling');
    console.log('✓ AuditView module structure is correct');

    // 2. Check legacy.js refactor
    const legacyContent = fs.readFileSync(LEGACY_JS, 'utf8');
    assert.ok(!legacyContent.includes('async function loadAudit()'), 'loadAudit should be removed from legacy.js');
    assert.ok(!legacyContent.includes('setInterval(loadAudit, 5000);'), 'polling should be removed from legacy.js');
    assert.ok(legacyContent.includes('AuditView.init()'), 'legacy.js should call AuditView.init()');
    console.log('✓ legacy.js successfully refactored');

    console.log('✓ Audit View Refactor Tests Passed');
} catch (err) {
    console.error('✘ Test Failed:', err.message);
    process.exit(1);
}
