#!/usr/bin/env node
/**
 * Mutation gate.
 *
 * A green test suite only means something if it turns red when the code breaks.
 * This script damages the source on purpose, one edit at a time, and requires
 * the suite to fail every single time. If a mutation survives, the suite is not
 * actually checking that behaviour and the build fails here.
 *
 * Every mutation must match its target exactly once. A mutation that matches
 * zero times or many times is a broken mutation, not a passing one.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MUTATIONS = [
  { file: 'src/analyze.js', find: 'return count > 0 ? 1 : 0;', replace: 'return 0;', note: 'stop counting assertions' },
  { file: 'src/analyze.js', find: 'if (scoped && net < 0', replace: 'if (scoped && net < -99', note: 'never report assertion loss' },
  { file: 'src/analyze.js', find: 'if (isComment(text)) return 0;', replace: 'if (false) return 0;', note: 'count commented assertions as real' },
  { file: 'src/analyze.js', find: 'if (skip && !isComment(text))', replace: 'if (false)', note: 'ignore skipped tests' },
  { file: 'src/analyze.js', find: 'if (focus && !isComment(text))', replace: 'if (false)', note: 'ignore focused tests' },
  { file: 'src/analyze.js', find: 'if (taut && !isComment(text))', replace: 'if (false)', note: 'ignore tautological assertions' },
  { file: 'src/analyze.js', find: 'if (empty && !isComment(text))', replace: 'if (false)', note: 'ignore empty test bodies' },
  { file: 'src/analyze.js', find: "if (testFile && file.status === 'removed')", replace: 'if (false)', note: 'ignore deleted test files' },
  { file: 'src/analyze.js', find: 'const scoped = testFile || includeNonTestFiles;', replace: 'const scoped = true;', note: 'scan production files by default' },
  { file: 'src/analyze.js', find: 'if (file.binary || ignored(file.path)) continue;', replace: 'if (false) continue;', note: 'scan binary and ignored files' },
  { file: 'src/analyze.js', find: 'if (unknown.length > 0) {', replace: 'if (false) {', note: 'accept unknown rule ids silently' },
  { file: 'src/analyze.js', find: "[RULES.ASSERTION_COMMENTED_OUT]: 'warning',", replace: "[RULES.ASSERTION_COMMENTED_OUT]: 'error',", note: 'escalate a warning to an error' },
  { file: 'src/diff.js', find: 'newLine += 1;\n      continue;', replace: 'continue;', note: 'stop advancing added line numbers' },
  { file: 'src/diff.js', find: "current.binary = true;", replace: 'current.binary = false;', note: 'treat binary files as source' },
  { file: 'src/diff.js', find: "if (raw.startsWith('deleted file mode')) {", replace: 'if (false) {', note: 'lose the deleted file status' },
  { file: 'src/diff.js', find: "return path.replace(/^[abciow]\\//, '');", replace: 'return path;', note: 'leave the a/ and b/ prefixes on paths' },
  { file: 'src/cli.js', find: "if (failOn === 'never') return 0;", replace: 'if (false) return 0;', note: 'ignore the never threshold' },
  { file: 'src/cli.js', find: "if (failOn === 'warning') return stats.errors + stats.warnings > 0 ? 1 : 0;", replace: "if (failOn === 'warning') return 0;", note: 'never fail on warnings' },
  { file: 'src/cli.js', find: 'return stats.errors > 0 ? 1 : 0;', replace: 'return 0;', note: 'always exit clean' },
  { file: 'src/report.js', find: "return severity === 'error' ? 'x' : '!';", replace: "return 'x';", note: 'blur the severity marker' },
  { file: 'src/report.js', find: "f.severity === 'error' ? 'error' : 'warning'", replace: "'error'", note: 'annotate every warning as an error' },
  { file: 'src/report.js', find: "const cell = (s) => String(s).replace(/\\|/g, '\\\\|');", replace: 'const cell = (s) => String(s);', note: 'stop escaping table pipes' },
  { file: 'src/action.js', find: "if (event && event.before && event.after && !/^0+$/.test(event.before))", replace: 'if (event && event.before && event.after)', note: 'diff against the zero sha' },
  { file: 'src/action.js', find: 'return labels.includes(String(label).toLowerCase());', replace: 'return true;', note: 'waive every run' },
  { file: 'src/action.js', find: "if (!label) return false;", replace: 'if (!label) return true;', note: 'waive when no label is configured' },
];

const TEST_FILES = readdirSync(join(root, 'test'))
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => join('test', f))
  .sort();

if (TEST_FILES.length === 0) {
  process.stdout.write('No test files were found, so there is nothing to trust.\n');
  process.exit(1);
}

function runTests() {
  const res = spawnSync(process.execPath, ['--test', ...TEST_FILES], { cwd: root, encoding: 'utf8' });
  return res.status === 0;
}

function main() {
  if (!runTests()) {
    process.stdout.write('The suite must be green before mutating anything.\n');
    process.exit(1);
  }
  process.stdout.write(`Baseline is green. Applying ${MUTATIONS.length} mutations.\n\n`);

  const survivors = [];
  const broken = [];

  MUTATIONS.forEach((m, index) => {
    const path = join(root, m.file);
    const original = readFileSync(path, 'utf8');
    const hits = original.split(m.find).length - 1;
    const id = `${String(index + 1).padStart(2, '0')}/${MUTATIONS.length} ${m.file}: ${m.note}`;

    if (hits !== 1) {
      broken.push(`${id} (anchor matched ${hits} times, expected exactly 1)`);
      process.stdout.write(`[anchor] ${id}\n`);
      return;
    }

    writeFileSync(path, original.replace(m.find, m.replace));
    let caught;
    try {
      caught = !runTests();
    } finally {
      writeFileSync(path, original);
    }

    process.stdout.write(`${caught ? '[caught]  ' : '[SURVIVED]'} ${id}\n`);
    if (!caught) survivors.push(id);
  });

  process.stdout.write('\n');
  if (broken.length > 0) {
    process.stdout.write(`${broken.length} mutation anchor(s) no longer match the source:\n`);
    for (const b of broken) process.stdout.write(`  ${b}\n`);
  }
  if (survivors.length > 0) {
    process.stdout.write(`${survivors.length} mutation(s) survived, so the suite does not cover them:\n`);
    for (const s of survivors) process.stdout.write(`  ${s}\n`);
  }
  if (broken.length > 0 || survivors.length > 0) process.exit(1);

  if (!runTests()) {
    process.stdout.write('The source was not restored cleanly.\n');
    process.exit(1);
  }
  process.stdout.write(`All ${MUTATIONS.length} mutations were caught and the source is restored.\n`);
}

main();
