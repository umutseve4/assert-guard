'use strict';

const RULE_HELP = {
  'assertions-removed': 'Restore the assertions, or explain the loss in the pull request body and apply the waiver label.',
  'test-file-deleted': 'Move the coverage somewhere else first, then delete the file in a separate commit.',
  'test-skipped': 'Fix the test or delete it. A skipped test is a green tick that checks nothing.',
  'test-focused': 'Remove the focus marker before merging, otherwise the rest of the file never runs in CI.',
  'tautological-assertion': 'Assert the real value the code produces, not a literal you wrote yourself.',
  'empty-test': 'Give the test a body that can fail.',
  'assertion-commented-out': 'Delete the line or make the assertion work again.',
};

function icon(severity) {
  return severity === 'error' ? 'x' : '!';
}

function toText({ findings, stats }) {
  const lines = [];
  lines.push('assert-guard');
  lines.push(
    `scanned ${stats.filesScanned} changed file(s), ${stats.testFilesScanned} of them test files`,
  );
  lines.push(`assertions added ${stats.assertionsAdded}, removed ${stats.assertionsRemoved}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No weakened tests found in this diff.');
    return lines.join('\n');
  }
  for (const f of findings) {
    lines.push(`[${icon(f.severity)}] ${f.file}:${f.line}  ${f.rule}`);
    lines.push(`    ${f.message}`);
    if (f.evidence) lines.push(`    > ${f.evidence}`);
    const help = RULE_HELP[f.rule];
    if (help) lines.push(`    fix: ${help}`);
    lines.push('');
  }
  lines.push(`${stats.errors} error(s), ${stats.warnings} warning(s)`);
  return lines.join('\n');
}

function toMarkdown({ findings, stats }) {
  const lines = [];
  lines.push('## assert-guard');
  lines.push('');
  if (findings.length === 0) {
    lines.push(
      `No weakened tests found. Scanned **${stats.filesScanned}** changed file(s) (**${stats.testFilesScanned}** test files), assertions added **${stats.assertionsAdded}**, removed **${stats.assertionsRemoved}**.`,
    );
    return lines.join('\n');
  }
  lines.push(
    `**${stats.errors}** error(s) and **${stats.warnings}** warning(s) across **${stats.filesScanned}** changed file(s). Assertions added **${stats.assertionsAdded}**, removed **${stats.assertionsRemoved}**.`,
  );
  lines.push('');
  lines.push('| | file | line | rule | what happened |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const f of findings) {
    const cell = (s) => String(s).replace(/\|/g, '\\|');
    lines.push(
      `| ${f.severity === 'error' ? 'error' : 'warn'} | \`${cell(f.file)}\` | ${f.line} | \`${f.rule}\` | ${cell(f.message)} |`,
    );
  }
  lines.push('');
  const rules = [...new Set(findings.map((f) => f.rule))];
  lines.push('<details><summary>How to fix</summary>');
  lines.push('');
  for (const r of rules) {
    if (RULE_HELP[r]) lines.push(`- \`${r}\`: ${RULE_HELP[r]}`);
  }
  lines.push('');
  lines.push('</details>');
  return lines.join('\n');
}

function toAnnotations({ findings }) {
  return findings.map(
    (f) =>
      `::${f.severity === 'error' ? 'error' : 'warning'} file=${f.file},line=${f.line},title=assert-guard: ${f.rule}::${f.message.replace(/\r?\n/g, ' ')}`,
  );
}

module.exports = { toText, toMarkdown, toAnnotations, RULE_HELP };
