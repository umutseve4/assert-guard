'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeDiff } = require('../src/analyze');
const { toText, toMarkdown, toAnnotations } = require('../src/report');
const F = require('./fixtures');

test('text output says plainly when nothing is wrong', () => {
  const out = toText(analyzeDiff(F.HEALTHY));
  assert.match(out, /No weakened tests found/);
});

test('text output names the file, the line and the rule', () => {
  const out = toText(analyzeDiff(F.SKIPPED_TEST));
  assert.match(out, /test\/user\.test\.js:4/);
  assert.match(out, /test-skipped/);
  assert.match(out, /fix: /);
});

test('text output marks errors and warnings with different symbols', () => {
  const errorLine = toText(analyzeDiff(F.SKIPPED_TEST))
    .split('\n')
    .find((l) => l.includes('test-skipped'));
  const warningLine = toText(analyzeDiff(F.COMMENTED_ASSERTION))
    .split('\n')
    .find((l) => l.includes('assertion-commented-out'));
  assert.match(errorLine, /^\[x\] /);
  assert.match(warningLine, /^\[!\] /);
  assert.notEqual(errorLine.slice(0, 3), warningLine.slice(0, 3));
});

test('markdown output builds a table row per finding', () => {
  const result = analyzeDiff(`${F.SKIPPED_TEST}${F.TAUTOLOGY}`);
  const md = toMarkdown(result);
  const rows = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| --- '));
  assert.equal(rows.length, result.findings.length + 1); // header plus findings
  assert.match(md, /`test-skipped`/);
});

test('markdown escapes pipe characters so the table cannot be broken', () => {
  const result = {
    findings: [
      { rule: 'test-skipped', severity: 'error', file: 'a|b.test.js', line: 2, message: 'x | y', evidence: null },
    ],
    stats: { filesScanned: 1, testFilesScanned: 1, assertionsAdded: 0, assertionsRemoved: 0, errors: 1, warnings: 0 },
  };
  const md = toMarkdown(result);
  assert.match(md, /a\\\|b\.test\.js/);
  assert.match(md, /x \\\| y/);
});

test('annotations use the workflow command syntax github understands', () => {
  const lines = toAnnotations(analyzeDiff(F.SKIPPED_TEST));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^::error file=test\/user\.test\.js,line=4,title=assert-guard: test-skipped::/);
});

test('warnings are annotated as warnings, not errors', () => {
  const lines = toAnnotations(analyzeDiff(F.COMMENTED_ASSERTION));
  assert.match(lines[0], /^::warning /);
});

test('annotation messages stay on a single line', () => {
  const result = {
    findings: [
      { rule: 'empty-test', severity: 'error', file: 'a.test.js', line: 1, message: 'first\nsecond', evidence: null },
    ],
    stats: {},
  };
  const [line] = toAnnotations(result);
  assert.equal(line.includes('\n'), false);
  assert.match(line, /first second/);
});

test('reports carry the assertion counters', () => {
  const result = analyzeDiff(F.REMOVED_ASSERTIONS);
  assert.match(toText(result), /assertions added 0, removed 2/);
  assert.match(toMarkdown(result), /removed \*\*2\*\*/);
});
