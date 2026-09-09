'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeDiff, isTestPath, countAssertions, RULES } = require('../src/analyze');
const F = require('./fixtures');

const rules = (result) => result.findings.map((f) => f.rule);

test('a clean diff produces no findings', () => {
  const result = analyzeDiff(F.HEALTHY);
  assert.deepEqual(result.findings, []);
  assert.equal(result.stats.errors, 0);
  assert.equal(result.stats.warnings, 0);
  assert.equal(result.stats.assertionsAdded, 2);
  assert.equal(result.stats.assertionsRemoved, 0);
});

test('reports a net loss of assertions in a test file', () => {
  const result = analyzeDiff(F.REMOVED_ASSERTIONS);
  assert.ok(rules(result).includes(RULES.ASSERTIONS_REMOVED));
  assert.equal(result.stats.assertionsRemoved, 2);
  assert.equal(result.stats.assertionsAdded, 0);
  assert.equal(result.stats.errors, 1);
  assert.match(result.findings[0].message, /loses 2 assertions/);
});

test('a rename that drops one assertion is still reported', () => {
  const result = analyzeDiff(F.RENAMED_WITH_LOSS);
  assert.ok(rules(result).includes(RULES.ASSERTIONS_REMOVED));
  assert.match(result.findings[0].message, /loses 1 assertion\b/);
});

test('detects a skipped javascript test', () => {
  const result = analyzeDiff(F.SKIPPED_TEST);
  assert.ok(rules(result).includes(RULES.TEST_SKIPPED));
  const finding = result.findings.find((f) => f.rule === RULES.TEST_SKIPPED);
  assert.equal(finding.severity, 'error');
  assert.equal(finding.file, 'test/user.test.js');
  assert.equal(finding.line, 4);
  assert.match(finding.evidence, /it\.skip/);
});

test('detects a skipped python test', () => {
  const result = analyzeDiff(F.PYTHON_SKIP);
  assert.ok(rules(result).includes(RULES.TEST_SKIPPED));
});

test('detects a skipped go test', () => {
  const result = analyzeDiff(F.GO_SKIP);
  assert.ok(rules(result).includes(RULES.TEST_SKIPPED));
});

test('detects a focused test that silences its siblings', () => {
  const result = analyzeDiff(F.FOCUSED_TEST);
  assert.ok(rules(result).includes(RULES.TEST_FOCUSED));
  assert.match(result.findings[0].message, /stops every other test/);
});

test('detects a tautological assertion', () => {
  const result = analyzeDiff(F.TAUTOLOGY);
  assert.ok(rules(result).includes(RULES.TAUTOLOGICAL_ASSERTION));
  assert.match(result.findings[0].message, /never fail/);
});

test('detects an empty test body', () => {
  const result = analyzeDiff(F.EMPTY_TEST);
  assert.ok(rules(result).includes(RULES.EMPTY_TEST));
});

test('a commented out assertion is a warning, not an error', () => {
  const result = analyzeDiff(F.COMMENTED_ASSERTION);
  const finding = result.findings.find((f) => f.rule === RULES.ASSERTION_COMMENTED_OUT);
  assert.ok(finding);
  assert.equal(finding.severity, 'warning');
  assert.equal(result.stats.errors, 0);
  assert.equal(result.stats.warnings, 1);
});

test('a commented out assertion does not count as an added assertion', () => {
  const result = analyzeDiff(F.COMMENTED_ASSERTION);
  assert.equal(result.stats.assertionsAdded, 0);
});

test('deleting a test file is an error', () => {
  const result = analyzeDiff(F.DELETED_TEST_FILE);
  assert.ok(rules(result).includes(RULES.TEST_FILE_DELETED));
  assert.equal(result.findings.find((f) => f.rule === RULES.TEST_FILE_DELETED).severity, 'error');
});

test('a deleted test file is not double reported as an assertion loss', () => {
  const result = analyzeDiff(F.DELETED_TEST_FILE);
  assert.ok(!rules(result).includes(RULES.ASSERTIONS_REMOVED));
});

test('production files are left alone by default', () => {
  const result = analyzeDiff(F.PRODUCTION_ONLY);
  assert.deepEqual(result.findings, []);
  assert.equal(result.stats.testFilesScanned, 0);
  assert.equal(result.stats.filesScanned, 1);
});

test('production files are scanned when asked explicitly', () => {
  const result = analyzeDiff(F.PRODUCTION_ONLY, { includeNonTestFiles: true });
  assert.ok(rules(result).includes(RULES.ASSERTIONS_REMOVED));
});

test('ignored paths are skipped entirely', () => {
  const result = analyzeDiff(F.SKIPPED_TEST, { ignore: ['test/'] });
  assert.deepEqual(result.findings, []);
  assert.equal(result.stats.filesScanned, 0);
});

test('an ignore entry matches a directory, not a name prefix', () => {
  const result = analyzeDiff(F.SKIPPED_TEST, { ignore: ['te'] });
  assert.equal(result.stats.filesScanned, 1);
});

test('disabled rules stop firing but the rest keep working', () => {
  const combined = `${F.SKIPPED_TEST}${F.TAUTOLOGY}`;
  const all = analyzeDiff(combined);
  assert.equal(all.findings.length, 2);
  const partial = analyzeDiff(combined, { disable: [RULES.TEST_SKIPPED] });
  assert.deepEqual(rules(partial), [RULES.TAUTOLOGICAL_ASSERTION]);
});

test('an unknown rule id in the disable list is rejected loudly', () => {
  assert.throws(() => analyzeDiff(F.HEALTHY, { disable: ['no-such-rule'] }), /Unknown rule id/);
});

test('binary files never produce findings', () => {
  const result = analyzeDiff(F.BINARY);
  assert.deepEqual(result.findings, []);
  assert.equal(result.stats.filesScanned, 0);
});

test('findings are sorted by file then line', () => {
  const result = analyzeDiff(`${F.TAUTOLOGY}${F.SKIPPED_TEST}${F.EMPTY_TEST}`);
  const keys = result.findings.map((f) => `${f.file}:${f.line}`);
  assert.deepEqual(keys, [...keys].sort((a, b) => a.localeCompare(b)));
});

test('evidence is trimmed and carries the offending source line', () => {
  const result = analyzeDiff(F.TAUTOLOGY);
  assert.equal(result.findings[0].evidence, 'expect(true).toBe(true);');
});

test('every finding carries the fields a reviewer needs', () => {
  const result = analyzeDiff(`${F.SKIPPED_TEST}${F.TAUTOLOGY}`);
  for (const f of result.findings) {
    assert.equal(typeof f.rule, 'string');
    assert.ok(['error', 'warning'].includes(f.severity));
    assert.ok(f.file.length > 0);
    assert.ok(Number.isInteger(f.line) && f.line > 0);
    assert.ok(f.message.length > 10);
  }
});

test('isTestPath recognises the common layouts', () => {
  for (const p of [
    'tests/api.test.js',
    'test/user.test.js',
    'src/__tests__/math.test.ts',
    'spec/cart_spec.rb',
    'tests/test_payments.py',
    'internal/ledger/ledger_test.go',
    'src/Widget.Tests.cs',
  ]) {
    assert.equal(isTestPath(p), true, p);
  }
});

test('isTestPath does not claim ordinary source files', () => {
  for (const p of ['src/server.js', 'lib/contest.js', 'app/latest.py', 'README.md']) {
    assert.equal(isTestPath(p), false, p);
  }
});

test('countAssertions counts a line once even with several matches', () => {
  assert.equal(countAssertions('expect(a).toBe(1); assert(b);'), 1);
  assert.equal(countAssertions('const a = 1;'), 0);
  assert.equal(countAssertions('// expect(a).toBe(1);'), 0);
  assert.equal(countAssertions('    assert x == 1'), 1);
});
