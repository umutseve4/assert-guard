#!/usr/bin/env node
/**
 * Every number printed in the README is recounted here from the code itself.
 *
 * A README that quotes a test count is a claim. This script runs the suite, the
 * end to end check and the mutation gate, reads the totals they report, and
 * fails if the README says anything else. Numbers cannot drift out of date
 * without turning the build red.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ALL_RULES } = require(join(root, 'src', 'analyze.js'));

const readme = readFileSync(join(root, 'README.md'), 'utf8');
const problems = [];

function run(label, cmd, args) {
  process.stdout.write(`running ${label}...\n`);
  const res = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  const output = `${res.stdout || ''}${res.stderr || ''}`;
  if (res.status !== 0) {
    problems.push(`${label} did not pass (exit ${res.status}).\n${output.slice(-2000)}`);
  }
  return output;
}

function claimed(pattern, what) {
  const m = readme.match(pattern);
  if (!m) {
    problems.push(`The README does not state a number for ${what} in the expected form ${pattern}.`);
    return null;
  }
  return Number(m[1]);
}

function compare(what, claimedValue, actual) {
  if (claimedValue === null) return;
  if (claimedValue !== actual) {
    problems.push(`The README claims ${claimedValue} ${what}, the code produces ${actual}.`);
  } else {
    process.stdout.write(`[ok] ${what}: ${actual}\n`);
  }
}

const testOut = run('unit tests', process.execPath, ['--test', '--test-reporter=tap', ...['diff', 'analyze', 'report', 'cli', 'action'].map((n) => `test/${n}.test.js`)]);
const testMatch = testOut.match(/^# pass (\d+)/m);
const testCount = testMatch ? Number(testMatch[1]) : -1;
const testFail = testOut.match(/^# fail (\d+)/m);
if (testFail && Number(testFail[1]) !== 0) problems.push(`${testFail[1]} unit test(s) failed.`);

const e2eOut = run('end to end check', process.execPath, ['scripts/e2e.mjs']);
const e2eMatch = e2eOut.match(/(\d+)\/(\d+) end to end checks passed/);
const e2eCount = e2eMatch ? Number(e2eMatch[2]) : -1;
if (e2eMatch && e2eMatch[1] !== e2eMatch[2]) problems.push('Not every end to end check passed.');

const mutationOut = run('mutation gate', process.execPath, ['scripts/mutation-gate.mjs']);
const mutationMatch = mutationOut.match(/All (\d+) mutations were caught/);
const mutationCount = mutationMatch ? Number(mutationMatch[1]) : -1;

compare('unit tests', claimed(/\*\*(\d+)\*\* unit tests/, 'unit tests'), testCount);
compare('end to end checks', claimed(/\*\*(\d+)\*\* end to end checks/, 'end to end checks'), e2eCount);
compare('mutations', claimed(/\*\*(\d+)\*\* mutations/, 'mutations'), mutationCount);
compare('rules', claimed(/\*\*(\d+)\*\* rules/, 'rules'), ALL_RULES.length);

for (const rule of ALL_RULES) {
  if (!readme.includes(`\`${rule}\``)) problems.push(`Rule ${rule} is implemented but never documented in the README.`);
}

if (readme.includes('npm install') && !readme.includes('zero runtime dependencies')) {
  problems.push('The README mentions installing packages without stating the dependency position.');
}

process.stdout.write('\n');
if (problems.length > 0) {
  process.stdout.write(`${problems.length} claim problem(s):\n`);
  for (const p of problems) process.stdout.write(`  - ${p}\n`);
  process.exit(1);
}
process.stdout.write(`Every number in the README was recounted from the code: ${testCount} unit tests, ${e2eCount} end to end checks, ${mutationCount} mutations, ${ALL_RULES.length} rules.\n`);
