#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { analyzeDiff, ALL_RULES } = require('./analyze');
const { toText, toMarkdown, toAnnotations } = require('./report');

const USAGE = `assert-guard: prove that a pull request still asserts something.

Usage:
  assert-guard [--diff <file>] [options]
  git diff main...HEAD | assert-guard [options]

Options:
  --diff <file>              read a unified diff from a file ("-" means stdin)
  --format <fmt>             text | markdown | json | github   (default: text)
  --fail-on <level>          error | warning | never           (default: error)
  --ignore <paths>           comma separated path prefixes to skip
  --disable <rules>          comma separated rule ids to switch off
  --include-non-test-files   apply the rules outside test paths too
  --help                     print this message

Rules: ${ALL_RULES.join(', ')}

Exit codes: 0 clean, 1 findings at or above --fail-on, 2 bad usage.
`;

function parseArgs(argv) {
  const opts = {
    diff: null,
    format: 'text',
    failOn: 'error',
    ignore: [],
    disable: [],
    includeNonTestFiles: false,
    help: false,
  };
  const list = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return v;
    };
    switch (arg) {
      case '--diff': opts.diff = next(); break;
      case '--format': opts.format = next(); break;
      case '--fail-on': opts.failOn = next(); break;
      case '--ignore': opts.ignore = list(next()); break;
      case '--disable': opts.disable = list(next()); break;
      case '--include-non-test-files': opts.includeNonTestFiles = true; break;
      case '--help':
      case '-h': opts.help = true; break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
        if (opts.diff === null) opts.diff = arg;
        else throw new Error(`Unexpected argument ${arg}`);
    }
  }

  if (!['text', 'markdown', 'json', 'github'].includes(opts.format)) {
    throw new Error(`Unknown --format ${opts.format}`);
  }
  if (!['error', 'warning', 'never'].includes(opts.failOn)) {
    throw new Error(`Unknown --fail-on ${opts.failOn}`);
  }
  return opts;
}

/** Decide the process exit code from findings and the chosen threshold. */
function exitCodeFor(stats, failOn) {
  if (failOn === 'never') return 0;
  if (failOn === 'warning') return stats.errors + stats.warnings > 0 ? 1 : 0;
  return stats.errors > 0 ? 1 : 0;
}

function render(result, format) {
  if (format === 'json') return JSON.stringify(result, null, 2);
  if (format === 'markdown') return toMarkdown(result);
  if (format === 'github') return toAnnotations(result).join('\n');
  return toText(result);
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function run(argv, io = {}) {
  const out = io.out || ((s) => process.stdout.write(`${s}\n`));
  const err = io.err || ((s) => process.stderr.write(`${s}\n`));

  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    err(e.message);
    err('');
    err(USAGE);
    return 2;
  }
  if (opts.help) {
    out(USAGE);
    return 0;
  }

  let diffText;
  try {
    diffText = opts.diff && opts.diff !== '-' ? fs.readFileSync(opts.diff, 'utf8') : (io.stdin != null ? io.stdin : readStdin());
  } catch (e) {
    err(`Cannot read diff: ${e.message}`);
    return 2;
  }

  let result;
  try {
    result = analyzeDiff(diffText, {
      ignore: opts.ignore,
      disable: opts.disable,
      includeNonTestFiles: opts.includeNonTestFiles,
    });
  } catch (e) {
    err(e.message);
    return 2;
  }

  out(render(result, opts.format));
  return exitCodeFor(result.stats, opts.failOn);
}

module.exports = { run, parseArgs, exitCodeFor, render, USAGE };

if (require.main === module) {
  process.exitCode = run(process.argv.slice(2));
}
