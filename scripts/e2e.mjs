#!/usr/bin/env node
/**
 * End to end check.
 *
 * Builds a throwaway git repository, commits a weakened test, then runs the
 * real action entry point against it exactly as a runner would. This proves the
 * git plumbing, the event parsing, the exit codes, the annotations, the job
 * summary and the waiver path, none of which the unit tests touch.
 */

import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let checks = 0;

function check(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    process.stdout.write(`[ok]   ${name}\n`);
  } else {
    process.stdout.write(`[FAIL] ${name}${detail ? `\n       ${detail}` : ''}\n`);
    failures.push(name);
  }
}

function git(cwd, args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
}

function runAction(cwd, env) {
  return spawnSync(process.execPath, [join(root, 'src', 'action.js')], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function writeEvent(dir, payload) {
  const file = join(dir, `event-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(payload));
  return file;
}

const STRONG = `const { sum } = require('../src/sum');
const test = require('node:test');
const assert = require('node:assert/strict');

test('adds two numbers', () => {
  assert.equal(sum(1, 2), 3);
  assert.equal(sum(-1, 1), 0);
});
`;

const WEAK = `const { sum } = require('../src/sum');
const test = require('node:test');
const assert = require('node:assert/strict');

test.skip('adds two numbers', () => {
  console.log(sum(1, 2));
});
`;

const STRONGER = `${STRONG}
test('adds zero', () => {
  assert.equal(sum(0, 0), 0);
});
`;

function main() {
  const probe = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    process.stdout.write('git is required for the end to end check and was not found.\n');
    process.exit(1);
  }

  const dir = mkdtempSync(join(tmpdir(), 'assert-guard-e2e-'));
  mkdirSync(join(dir, 'tests'), { recursive: true });
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  git(dir, ['config', 'user.email', 'e2e@example.com']);
  git(dir, ['config', 'user.name', 'assert-guard e2e']);
  git(dir, ['config', 'commit.gpgsign', 'false']);

  writeFileSync(join(dir, 'tests', 'sum.test.js'), STRONG);
  git(dir, ['add', '.']);
  git(dir, ['commit', '--quiet', '-m', 'add tests']);
  const base = git(dir, ['rev-parse', 'HEAD']);

  writeFileSync(join(dir, 'tests', 'sum.test.js'), WEAK);
  git(dir, ['commit', '--quiet', '-am', 'weaken tests']);
  const weakHead = git(dir, ['rev-parse', 'HEAD']);

  const outputs = join(dir, 'outputs.txt');
  const summary = join(dir, 'summary.md');
  writeFileSync(outputs, '');
  writeFileSync(summary, '');

  // 1. A pull request that weakens the tests must fail the job.
  const prEvent = writeEvent(dir, {
    pull_request: { base: { sha: base }, head: { sha: weakHead }, labels: [] },
  });
  const weak = runAction(dir, {
    GITHUB_EVENT_PATH: prEvent,
    GITHUB_OUTPUT: outputs,
    GITHUB_STEP_SUMMARY: summary,
  });
  check('a weakened pull request exits non zero', weak.status === 1, `exit ${weak.status}\n${weak.stdout}${weak.stderr}`);
  check('the skipped test is annotated', /::error file=tests\/sum\.test\.js,line=\d+,title=assert-guard: test-skipped::/.test(weak.stdout), weak.stdout);
  check('the lost assertions are annotated', weak.stdout.includes('assertions-removed'), weak.stdout);
  check('the human readable report is printed', weak.stdout.includes('assert-guard'), weak.stdout);
  check('the resolved diff range is printed', weak.stdout.includes('diff range:'), weak.stdout);

  const summaryText = readFileSync(summary, 'utf8');
  check('a job summary table is written', summaryText.includes('## assert-guard') && summaryText.includes('| error |'), summaryText);

  const outputText = readFileSync(outputs, 'utf8');
  check('the error-count output is published', /error-count<<__ASSERT_GUARD_EOF__\n[1-9]/.test(outputText), outputText);
  check('the findings output is published as json', outputText.includes('"rule": "test-skipped"') || outputText.includes('"rule":"test-skipped"'), outputText);

  // 2. The same diff with the waiver label must pass while keeping the report.
  const waivedEvent = writeEvent(dir, {
    pull_request: { base: { sha: base }, head: { sha: weakHead }, labels: [{ name: 'assert-guard:waived' }] },
  });
  const waived = runAction(dir, { GITHUB_EVENT_PATH: waivedEvent });
  check('the waiver label lets the job pass', waived.status === 0, `exit ${waived.status}`);
  check('the waiver is announced in the log', waived.stdout.includes('::notice title=assert-guard::'), waived.stdout);
  check('the findings stay on the record after a waiver', waived.stdout.includes('test-skipped'), waived.stdout);

  // 3. A pull request that adds assertions must pass.
  git(dir, ['checkout', '--quiet', '-b', 'stronger', base]);
  writeFileSync(join(dir, 'tests', 'sum.test.js'), STRONGER);
  git(dir, ['commit', '--quiet', '-am', 'add another assertion']);
  const strongHead = git(dir, ['rev-parse', 'HEAD']);
  const strongEvent = writeEvent(dir, {
    pull_request: { base: { sha: base }, head: { sha: strongHead }, labels: [] },
  });
  const strong = runAction(dir, { GITHUB_EVENT_PATH: strongEvent });
  check('a strengthened pull request exits zero', strong.status === 0, `exit ${strong.status}\n${strong.stdout}`);
  check('a clean run says so', strong.stdout.includes('No weakened tests found'), strong.stdout);

  // 4. fail-on never reports without blocking.
  const lenient = runAction(dir, { GITHUB_EVENT_PATH: prEvent, 'INPUT_FAIL-ON': 'never' });
  check('fail-on never reports without blocking', lenient.status === 0 && lenient.stdout.includes('test-skipped'), `exit ${lenient.status}`);

  // 5. Disabling a rule silences exactly that rule.
  const disabled = runAction(dir, {
    GITHUB_EVENT_PATH: prEvent,
    INPUT_DISABLE: 'test-skipped,assertions-removed',
  });
  check('disabled rules stop blocking the job', disabled.status === 0, `exit ${disabled.status}\n${disabled.stdout}`);
  check('a disabled rule disappears from the annotations', !disabled.stdout.includes('::error'), disabled.stdout);

  // 6. An ignored path is not scanned at all.
  const ignored = runAction(dir, { GITHUB_EVENT_PATH: prEvent, INPUT_IGNORE: 'tests/' });
  check('an ignored path removes the failure', ignored.status === 0, `exit ${ignored.status}`);

  // 7. A push event is understood as well as a pull request.
  const pushEvent = writeEvent(dir, { before: base, after: weakHead });
  const push = runAction(dir, { GITHUB_EVENT_PATH: pushEvent });
  check('a push event is diffed the same way', push.status === 1 && push.stdout.includes('test-skipped'), `exit ${push.status}`);

  // 8. A bad rule id is a configuration error, not a silent pass.
  const bad = runAction(dir, { GITHUB_EVENT_PATH: prEvent, INPUT_DISABLE: 'not-a-rule' });
  check('an unknown rule id fails loudly', bad.status === 2 && bad.stdout.includes('::error'), `exit ${bad.status}\n${bad.stdout}`);

  process.stdout.write(`\n${checks - failures.length}/${checks} end to end checks passed.\n`);
  if (existsSync(summary) === false) process.exit(1);
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
