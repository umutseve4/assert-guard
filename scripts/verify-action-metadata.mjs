#!/usr/bin/env node
/**
 * The action manifest is a promise made to every user of the action. This
 * script checks that the promise matches the code: every documented input is
 * actually read, every input the code reads is documented and forwarded, every
 * output the code writes is declared, and the README lists all of them.
 *
 * It parses the small, fixed shape of action.yml directly, so the repository
 * keeps its zero dependency position.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = readFileSync(join(root, 'action.yml'), 'utf8');
const actionSource = readFileSync(join(root, 'src', 'action.js'), 'utf8');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const problems = [];
const ok = [];

function section(name) {
  const re = new RegExp(`^${name}:\\n((?:[ \\t]+.*\\n|\\n)*)`, 'm');
  const m = manifest.match(re);
  return m ? m[1] : '';
}

function keysOf(block) {
  return [...block.matchAll(/^ {2}([a-z][a-z0-9-]*):/gm)].map((m) => m[1]);
}

const declaredInputs = keysOf(section('inputs'));
const declaredOutputs = keysOf(section('outputs'));
const forwarded = [...manifest.matchAll(/^ {8}INPUT_([A-Z0-9_-]+):/gm)].map((m) => m[1].toLowerCase());
const usedInputs = [...actionSource.matchAll(/\binput\('([a-z0-9-]+)'/g)].map((m) => m[1]);
const writtenOutputs = [...actionSource.matchAll(/setOutput\('([a-z0-9-]+)'/g)].map((m) => m[1]);

function expect(condition, message, okMessage) {
  if (condition) ok.push(okMessage);
  else problems.push(message);
}

expect(declaredInputs.length > 0, 'action.yml declares no inputs.', `${declaredInputs.length} inputs declared`);
expect(declaredOutputs.length > 0, 'action.yml declares no outputs.', `${declaredOutputs.length} outputs declared`);

for (const name of usedInputs) {
  expect(
    declaredInputs.includes(name),
    `src/action.js reads the input "${name}" but action.yml never declares it.`,
    `input ${name} is declared`,
  );
  expect(
    forwarded.includes(name),
    `The input "${name}" is declared but never forwarded to the step environment, so it would always be empty.`,
    `input ${name} is forwarded`,
  );
}

for (const name of declaredInputs) {
  expect(
    usedInputs.includes(name),
    `action.yml promises the input "${name}" but no code reads it.`,
    `input ${name} is read`,
  );
  expect(
    readme.includes(`\`${name}\``),
    `The input "${name}" is not documented in the README.`,
    `input ${name} is documented`,
  );
}

for (const name of writtenOutputs) {
  expect(
    declaredOutputs.includes(name),
    `src/action.js writes the output "${name}" but action.yml never declares it.`,
    `output ${name} is declared`,
  );
}

for (const name of declaredOutputs) {
  expect(
    writtenOutputs.includes(name),
    `action.yml promises the output "${name}" but no code writes it.`,
    `output ${name} is written`,
  );
  expect(
    new RegExp(`\`${name}[\`,]`).test(readme),
    `The output "${name}" is not documented in the README.`,
    `output ${name} is documented`,
  );
}

expect(
  /runs:\n {2}using: 'composite'/.test(manifest),
  'The action must run as a composite action so it needs no build step.',
  'the action runs as a composite action',
);
expect(
  manifest.includes('$GITHUB_ACTION_PATH/src/action.js'),
  'The composite step must call the action entry point through GITHUB_ACTION_PATH.',
  'the composite step resolves its own path',
);
expect(
  Object.keys(pkg.dependencies || {}).length === 0,
  'package.json declares runtime dependencies, but the README promises none.',
  'there are no runtime dependencies',
);
expect(
  readme.includes('zero runtime dependency') || readme.includes('no runtime dependency'),
  'The README no longer states the dependency position.',
  'the dependency position is stated',
);

for (const line of ok) process.stdout.write(`[ok] ${line}\n`);
process.stdout.write('\n');
if (problems.length > 0) {
  process.stdout.write(`${problems.length} contract problem(s):\n`);
  for (const p of problems) process.stdout.write(`  - ${p}\n`);
  process.exit(1);
}
process.stdout.write(`The action manifest matches the code: ${ok.length} contract checks passed.\n`);
