#!/usr/bin/env node
'use strict';

/**
 * GitHub Actions entry point. It resolves the diff of the current pull request
 * (or push), runs the analysis, prints annotations, writes a job summary and
 * fails the job when the threshold is crossed.
 *
 * No runtime dependencies: only node built-ins and the git binary that every
 * GitHub runner already ships.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
const { analyzeDiff } = require('./analyze');
const { toText, toMarkdown, toAnnotations } = require('./report');
const { exitCodeFor } = require('./cli');

function input(name, fallback = '') {
  // GitHub keeps hyphens in the environment key and only replaces spaces, but
  // local runs are easier with underscores, so both spellings are accepted.
  const base = name.replace(/ /g, '_').toUpperCase();
  for (const key of [`INPUT_${base}`, `INPUT_${base.replace(/-/g, '_')}`]) {
    const value = process.env[key];
    if (value !== undefined && value !== '') return value;
  }
  return fallback;
}

function list(value) {
  return String(value).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

function readEvent() {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return null;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
}

function tryGit(args) {
  try {
    return { ok: true, out: git(args) };
  } catch (e) {
    return { ok: false, error: e.stderr ? String(e.stderr) : String(e.message) };
  }
}

/** Work out which two commits bound the change under review. */
function resolveRange(event) {
  const explicitBase = input('base');
  const explicitHead = input('head');
  if (explicitBase && explicitHead) return { base: explicitBase, head: explicitHead, source: 'inputs' };

  if (event && event.pull_request) {
    return {
      base: explicitBase || event.pull_request.base.sha,
      head: explicitHead || event.pull_request.head.sha,
      source: 'pull_request',
    };
  }
  if (event && event.before && event.after && !/^0+$/.test(event.before)) {
    return { base: explicitBase || event.before, head: explicitHead || event.after, source: 'push' };
  }
  return { base: explicitBase || 'HEAD~1', head: explicitHead || 'HEAD', source: 'fallback' };
}

function fetchIfMissing(sha) {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return;
  if (tryGit(['cat-file', '-e', `${sha}^{commit}`]).ok) return;
  tryGit(['fetch', '--no-tags', '--depth=1', 'origin', sha]);
}

function waived(event, label) {
  if (!label) return false;
  const labels = event && event.pull_request && Array.isArray(event.pull_request.labels)
    ? event.pull_request.labels.map((l) => String(l.name).toLowerCase())
    : [];
  return labels.includes(String(label).toLowerCase());
}

function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  const line = `${name}<<__ASSERT_GUARD_EOF__\n${value}\n__ASSERT_GUARD_EOF__\n`;
  if (file) fs.appendFileSync(file, line);
  else process.stdout.write(`[output] ${name}=${value}\n`);
}

function appendSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) fs.appendFileSync(file, `${markdown}\n`);
}

function main() {
  const event = readEvent();
  const failOn = input('fail-on', 'error');
  const waiverLabel = input('waiver-label', 'assert-guard:waived');
  const options = {
    ignore: list(input('ignore', '')),
    disable: list(input('disable', '')),
    includeNonTestFiles: input('include-non-test-files', 'false') === 'true',
  };

  const { base, head, source } = resolveRange(event);
  fetchIfMissing(base);
  fetchIfMissing(head);

  const mergeBase = tryGit(['merge-base', base, head]);
  const from = mergeBase.ok ? mergeBase.out.trim() : base;

  const diff = tryGit(['diff', '--no-color', '--no-ext-diff', '--unified=0', `${from}`, `${head}`]);
  if (!diff.ok) {
    process.stdout.write(
      `::error title=assert-guard::Could not compute the diff between ${base} and ${head}. Use actions/checkout with fetch-depth: 0.\n${diff.error}\n`,
    );
    process.exitCode = 1;
    return;
  }

  let result;
  try {
    result = analyzeDiff(diff.out, options);
  } catch (e) {
    process.stdout.write(`::error title=assert-guard::${e.message}\n`);
    process.exitCode = 2;
    return;
  }

  for (const annotation of toAnnotations(result)) process.stdout.write(`${annotation}\n`);
  process.stdout.write(`${toText(result)}\n`);
  process.stdout.write(`diff range: ${from}..${head} (resolved from ${source})\n`);

  const markdown = toMarkdown(result);
  appendSummary(markdown);
  setOutput('findings', JSON.stringify(result.findings));
  setOutput('summary', markdown);
  setOutput('error-count', String(result.stats.errors));
  setOutput('warning-count', String(result.stats.warnings));

  const code = exitCodeFor(result.stats, failOn);
  if (code !== 0 && waived(event, waiverLabel)) {
    process.stdout.write(
      `::notice title=assert-guard::Findings were waived by the "${waiverLabel}" label. The report stays on the record.\n`,
    );
    process.exitCode = 0;
    return;
  }
  process.exitCode = code;
}

if (require.main === module) main();

module.exports = { resolveRange, waived, input, list };
