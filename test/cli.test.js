'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, parseArgs, exitCodeFor } = require('../src/cli');
const F = require('./fixtures');

function capture(argv, stdin) {
  const out = [];
  const err = [];
  const code = run(argv, { out: (s) => out.push(s), err: (s) => err.push(s), stdin });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

test('a clean diff exits 0', () => {
  const r = capture([], F.HEALTHY);
  assert.equal(r.code, 0);
  assert.match(r.out, /No weakened tests found/);
});

test('a weakened diff exits 1', () => {
  const r = capture([], F.SKIPPED_TEST);
  assert.equal(r.code, 1);
});

test('--fail-on never reports but never fails', () => {
  const r = capture(['--fail-on', 'never'], F.SKIPPED_TEST);
  assert.equal(r.code, 0);
  assert.match(r.out, /test-skipped/);
});

test('--fail-on warning turns a warning into a failure', () => {
  assert.equal(capture([], F.COMMENTED_ASSERTION).code, 0);
  assert.equal(capture(['--fail-on', 'warning'], F.COMMENTED_ASSERTION).code, 1);
});

test('--format json emits parseable output with findings and stats', () => {
  const r = capture(['--format', 'json'], F.SKIPPED_TEST);
  const parsed = JSON.parse(r.out);
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.findings[0].rule, 'test-skipped');
  assert.equal(parsed.stats.errors, 1);
});

test('--format github emits annotation lines only', () => {
  const r = capture(['--format', 'github'], F.SKIPPED_TEST);
  for (const line of r.out.split('\n').filter(Boolean)) {
    assert.match(line, /^::(error|warning) /);
  }
});

test('--diff reads a file from disk', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ag-')), 'patch.diff');
  fs.writeFileSync(file, F.TAUTOLOGY);
  const r = capture(['--diff', file]);
  assert.equal(r.code, 1);
  assert.match(r.out, /tautological-assertion/);
});

test('a missing diff file is a usage error, not a crash', () => {
  const r = capture(['--diff', '/nope/does/not/exist.diff']);
  assert.equal(r.code, 2);
  assert.match(r.err, /Cannot read diff/);
});

test('an unknown option exits 2 and prints the usage', () => {
  const r = capture(['--wat'], F.HEALTHY);
  assert.equal(r.code, 2);
  assert.match(r.err, /Unknown option --wat/);
  assert.match(r.err, /Usage:/);
});

test('an unknown rule in --disable exits 2', () => {
  const r = capture(['--disable', 'nope'], F.HEALTHY);
  assert.equal(r.code, 2);
  assert.match(r.err, /Unknown rule id/);
});

test('--help exits 0 and documents every rule', () => {
  const r = capture(['--help']);
  assert.equal(r.code, 0);
  for (const rule of ['assertions-removed', 'test-skipped', 'test-focused', 'tautological-assertion']) {
    assert.ok(r.out.includes(rule), rule);
  }
});

test('parseArgs splits comma separated lists', () => {
  const opts = parseArgs(['--ignore', 'a/, b/', '--disable', 'test-skipped']);
  assert.deepEqual(opts.ignore, ['a/', 'b/']);
  assert.deepEqual(opts.disable, ['test-skipped']);
});

test('parseArgs rejects a flag with a missing value', () => {
  assert.throws(() => parseArgs(['--format']), /Missing value for --format/);
});

test('parseArgs rejects an unsupported format or threshold', () => {
  assert.throws(() => parseArgs(['--format', 'xml']), /Unknown --format/);
  assert.throws(() => parseArgs(['--fail-on', 'sometimes']), /Unknown --fail-on/);
});

test('exitCodeFor implements the three thresholds', () => {
  const clean = { errors: 0, warnings: 0 };
  const warned = { errors: 0, warnings: 3 };
  const failed = { errors: 1, warnings: 0 };
  assert.equal(exitCodeFor(clean, 'error'), 0);
  assert.equal(exitCodeFor(warned, 'error'), 0);
  assert.equal(exitCodeFor(failed, 'error'), 1);
  assert.equal(exitCodeFor(warned, 'warning'), 1);
  assert.equal(exitCodeFor(failed, 'never'), 0);
});
