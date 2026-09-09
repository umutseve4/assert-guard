'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDiff } = require('../src/diff');
const F = require('./fixtures');

test('parses a modified file with added and removed lines', () => {
  const [file] = parseDiff(F.REMOVED_ASSERTIONS);
  assert.equal(file.path, 'test/user.test.js');
  assert.equal(file.status, 'modified');
  assert.equal(file.removed.length, 2);
  assert.equal(file.added.length, 1);
  assert.equal(file.added[0].text, '  console.log(user);');
});

test('numbers added lines with the new file numbering', () => {
  const [file] = parseDiff(F.HEALTHY);
  assert.deepEqual(file.added.map((a) => a.line), [6, 7]);
});

test('numbers removed lines with the old file numbering', () => {
  const [file] = parseDiff(F.REMOVED_ASSERTIONS);
  assert.deepEqual(file.removed.map((r) => r.line), [10, 11]);
});

test('marks a deleted file as removed', () => {
  const [file] = parseDiff(F.DELETED_TEST_FILE);
  assert.equal(file.status, 'removed');
  assert.equal(file.path, 'tests/legacy.test.js');
  assert.equal(file.removed.length, 3);
});

test('reads the removed status from the file mode line when git omits the header', () => {
  const [file] = parseDiff(F.DELETED_TEST_FILE_NO_HEADER);
  assert.equal(file.status, 'removed');
  assert.equal(file.path, 'tests/legacy.test.js');
});

test('a deleted binary file keeps both its removed status and its binary flag', () => {
  const [file] = parseDiff(F.DELETED_BINARY_TEST_FIXTURE);
  assert.equal(file.status, 'removed');
  assert.equal(file.binary, true);
});

test('marks a new file as added', () => {
  const diff = [
    'diff --git a/tests/new.test.js b/tests/new.test.js',
    'new file mode 100644',
    'index 0000000..2222222',
    '--- /dev/null',
    '+++ b/tests/new.test.js',
    '@@ -0,0 +1,1 @@',
    "+expect(1).toBe(1);",
  ].join('\n');
  const [file] = parseDiff(diff);
  assert.equal(file.status, 'added');
  assert.equal(file.path, 'tests/new.test.js');
});

test('marks a rename and keeps the new path', () => {
  const [file] = parseDiff(F.RENAMED_WITH_LOSS);
  assert.equal(file.path, 'tests/new.test.js');
  assert.equal(file.status, 'renamed');
});

test('flags binary files instead of reading their bytes as source', () => {
  const [file] = parseDiff(F.BINARY);
  assert.equal(file.binary, true);
  assert.equal(file.added.length, 0);
});

test('handles several files in one diff', () => {
  const files = parseDiff(`${F.HEALTHY}${F.SKIPPED_TEST}`);
  assert.equal(files.length, 2);
  assert.deepEqual(files.map((f) => f.path), ['tests/api.test.js', 'test/user.test.js']);
});

test('ignores the no-newline marker', () => {
  const diff = [
    'diff --git a/tests/a.test.js b/tests/a.test.js',
    '--- a/tests/a.test.js',
    '+++ b/tests/a.test.js',
    '@@ -1,1 +1,1 @@',
    '-expect(a).toBe(1);',
    '\\ No newline at end of file',
    '+expect(a).toBe(2);',
  ].join('\n');
  const [file] = parseDiff(diff);
  assert.equal(file.removed.length, 1);
  assert.equal(file.added.length, 1);
  assert.equal(file.added[0].line, 1);
});

test('keeps context lines in step so later hunks are numbered correctly', () => {
  const diff = [
    'diff --git a/tests/a.test.js b/tests/a.test.js',
    '--- a/tests/a.test.js',
    '+++ b/tests/a.test.js',
    '@@ -1,4 +1,4 @@',
    ' const a = 1;',
    ' const b = 2;',
    '-expect(a).toBe(1);',
    '+expect(a).toBe(2);',
  ].join('\n');
  const [file] = parseDiff(diff);
  assert.equal(file.added[0].line, 3);
  assert.equal(file.removed[0].line, 3);
});

test('returns an empty list for empty or non diff input', () => {
  assert.deepEqual(parseDiff(''), []);
  assert.deepEqual(parseDiff('just some text\nwith no diff header'), []);
  assert.deepEqual(parseDiff(null), []);
  assert.deepEqual(parseDiff(undefined), []);
});

test('strips the a/ and b/ prefixes but keeps directories named a or b', () => {
  const diff = [
    'diff --git a/a/tests/x.test.js b/a/tests/x.test.js',
    '--- a/a/tests/x.test.js',
    '+++ b/a/tests/x.test.js',
    '@@ -1,0 +2,1 @@',
    '+expect(1).toBe(1);',
  ].join('\n');
  const [file] = parseDiff(diff);
  assert.equal(file.path, 'a/tests/x.test.js');
});
