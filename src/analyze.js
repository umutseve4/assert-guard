'use strict';

const { parseDiff } = require('./diff');
const {
  ASSERTION_PATTERNS,
  SKIP_PATTERNS,
  FOCUS_PATTERNS,
  TAUTOLOGY_PATTERNS,
  EMPTY_TEST_PATTERNS,
  COMMENT_PREFIX,
  TEST_PATH_PATTERNS,
} = require('./patterns');

const RULES = {
  ASSERTIONS_REMOVED: 'assertions-removed',
  TEST_FILE_DELETED: 'test-file-deleted',
  TEST_SKIPPED: 'test-skipped',
  TEST_FOCUSED: 'test-focused',
  TAUTOLOGICAL_ASSERTION: 'tautological-assertion',
  EMPTY_TEST: 'empty-test',
  ASSERTION_COMMENTED_OUT: 'assertion-commented-out',
};

const DEFAULT_SEVERITY = {
  [RULES.ASSERTIONS_REMOVED]: 'error',
  [RULES.TEST_FILE_DELETED]: 'error',
  [RULES.TEST_SKIPPED]: 'error',
  [RULES.TEST_FOCUSED]: 'error',
  [RULES.TAUTOLOGICAL_ASSERTION]: 'error',
  [RULES.EMPTY_TEST]: 'error',
  [RULES.ASSERTION_COMMENTED_OUT]: 'warning',
};

const ALL_RULES = Object.values(RULES);

function isTestPath(path) {
  return TEST_PATH_PATTERNS.some((re) => re.test(path));
}

function isComment(text) {
  return COMMENT_PREFIX.test(text);
}

/** Count assertion calls on a single source line, ignoring commented lines. */
function countAssertions(text) {
  if (isComment(text)) return 0;
  let count = 0;
  for (const re of ASSERTION_PATTERNS) {
    if (re.test(text)) count += 1;
  }
  return count > 0 ? 1 : 0;
}

function matchLabel(text, table) {
  for (const entry of table) {
    if (entry.re.test(text)) return entry.label;
  }
  return null;
}

function trim(text, max = 140) {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 3)}...` : t;
}

/**
 * @param {string} diffText unified diff of the pull request
 * @param {object} [options]
 * @param {string[]} [options.ignore] glob-free path prefixes to ignore
 * @param {string[]} [options.disable] rule ids to switch off
 * @param {boolean} [options.includeNonTestFiles] apply rules outside test paths
 * @returns {{findings: Array, stats: object}}
 */
function analyzeDiff(diffText, options = {}) {
  const disabled = new Set(options.disable || []);
  const ignore = (options.ignore || []).filter(Boolean);
  const includeNonTestFiles = options.includeNonTestFiles === true;

  const unknown = [...disabled].filter((r) => !ALL_RULES.includes(r));
  if (unknown.length > 0) {
    throw new Error(`Unknown rule id in disable list: ${unknown.join(', ')}`);
  }

  const files = parseDiff(diffText);
  const findings = [];
  const stats = {
    filesScanned: 0,
    testFilesScanned: 0,
    assertionsAdded: 0,
    assertionsRemoved: 0,
  };

  const ignored = (path) => ignore.some((p) => path === p || path.startsWith(p.replace(/\/*$/, '/')));
  const enabled = (rule) => !disabled.has(rule);

  const add = (rule, file, line, message, evidence) => {
    if (!enabled(rule)) return;
    findings.push({
      rule,
      severity: DEFAULT_SEVERITY[rule],
      file,
      line,
      message,
      evidence: evidence == null ? null : trim(evidence),
    });
  };

  for (const file of files) {
    if (file.binary || ignored(file.path)) continue;
    stats.filesScanned += 1;

    const testFile = isTestPath(file.path);
    if (testFile) stats.testFilesScanned += 1;
    const scoped = testFile || includeNonTestFiles;

    if (testFile && file.status === 'removed') {
      add(
        RULES.TEST_FILE_DELETED,
        file.path,
        1,
        'A test file was deleted. Deleting tests removes evidence, so it needs an explicit waiver.',
        null,
      );
    }

    let addedAssertions = 0;
    let removedAssertions = 0;

    for (const { line, text } of file.added) {
      if (scoped) {
        addedAssertions += countAssertions(text);

        const skip = matchLabel(text, SKIP_PATTERNS);
        if (skip && !isComment(text)) {
          add(RULES.TEST_SKIPPED, file.path, line, `A test was switched off with ${skip}.`, text);
        }

        const focus = matchLabel(text, FOCUS_PATTERNS);
        if (focus && !isComment(text)) {
          add(
            RULES.TEST_FOCUSED,
            file.path,
            line,
            `${focus} silently stops every other test in this file from running.`,
            text,
          );
        }

        const taut = matchLabel(text, TAUTOLOGY_PATTERNS);
        if (taut && !isComment(text)) {
          add(
            RULES.TAUTOLOGICAL_ASSERTION,
            file.path,
            line,
            `${taut} can never fail, so it proves nothing.`,
            text,
          );
        }

        const empty = matchLabel(text, EMPTY_TEST_PATTERNS);
        if (empty && !isComment(text)) {
          add(RULES.EMPTY_TEST, file.path, line, `${empty}: this test passes without checking anything.`, text);
        }

        if (isComment(text)) {
          const bare = text.replace(COMMENT_PREFIX, '');
          if (countAssertions(bare) > 0) {
            add(
              RULES.ASSERTION_COMMENTED_OUT,
              file.path,
              line,
              'An assertion was commented out instead of being fixed or deleted.',
              text,
            );
          }
        }
      }
    }

    for (const { text } of file.removed) {
      if (scoped) removedAssertions += countAssertions(text);
    }

    stats.assertionsAdded += addedAssertions;
    stats.assertionsRemoved += removedAssertions;

    const net = addedAssertions - removedAssertions;
    if (scoped && net < 0 && file.status !== 'removed') {
      add(
        RULES.ASSERTIONS_REMOVED,
        file.path,
        file.added.length > 0 ? file.added[0].line : 1,
        `This file loses ${-net} assertion${net === -1 ? '' : 's'} (removed ${removedAssertions}, added ${addedAssertions}). The suite can still go green while checking less.`,
        null,
      );
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));

  stats.errors = findings.filter((f) => f.severity === 'error').length;
  stats.warnings = findings.filter((f) => f.severity === 'warning').length;

  return { findings, stats };
}

module.exports = { analyzeDiff, isTestPath, countAssertions, RULES, ALL_RULES, DEFAULT_SEVERITY };
