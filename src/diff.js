'use strict';

/**
 * A dependency free unified diff parser.
 *
 * It keeps the information the rules need and nothing else: which file a line
 * belongs to, whether the line was added or removed, and the line number the
 * reviewer will see on GitHub (new file numbering for additions, old file
 * numbering for removals).
 */

const HUNK_HEADER = /^@@+ (?:-(\d+)(?:,(\d+))? )?\+(\d+)(?:,(\d+))? @@/;

function stripPrefix(path) {
  if (path === '/dev/null') return null;
  return path.replace(/^[abciow]\//, '');
}

function unquote(path) {
  if (path.length > 1 && path.startsWith('"') && path.endsWith('"')) {
    try {
      return JSON.parse(path);
    } catch {
      return path.slice(1, -1);
    }
  }
  return path;
}

/**
 * @param {string} diffText raw output of `git diff` in unified format
 * @returns {Array<{path: string, oldPath: string|null, newPath: string|null,
 *   status: 'added'|'removed'|'renamed'|'modified', binary: boolean,
 *   added: Array<{line: number, text: string}>,
 *   removed: Array<{line: number, text: string}>}>}
 */
function parseDiff(diffText) {
  const files = [];
  let current = null;
  let oldLine = 0;
  let newLine = 0;

  const push = () => {
    if (current) files.push(current);
  };

  const lines = String(diffText == null ? '' : diffText).split(/\r?\n/);

  for (const raw of lines) {
    if (raw.startsWith('diff --git ')) {
      push();
      current = {
        path: '',
        oldPath: null,
        newPath: null,
        status: 'modified',
        binary: false,
        added: [],
        removed: [],
      };
      const m = raw.match(/^diff --git (\S+|".*?") (\S+|".*?")$/);
      if (m) {
        current.oldPath = stripPrefix(unquote(m[1]));
        current.newPath = stripPrefix(unquote(m[2]));
        current.path = current.newPath || current.oldPath || '';
      }
      oldLine = 0;
      newLine = 0;
      continue;
    }

    if (!current) continue;

    if (raw.startsWith('--- ')) {
      const p = stripPrefix(unquote(raw.slice(4).trim()));
      current.oldPath = p;
      if (p === null) current.status = 'added';
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const p = stripPrefix(unquote(raw.slice(4).trim()));
      current.newPath = p;
      if (p === null) current.status = 'removed';
      else current.path = p;
      continue;
    }
    if (raw.startsWith('new file mode')) {
      current.status = 'added';
      continue;
    }
    if (raw.startsWith('deleted file mode')) {
      current.status = 'removed';
      continue;
    }
    if (raw.startsWith('rename from') || raw.startsWith('rename to')) {
      current.status = 'renamed';
      continue;
    }
    if (raw.startsWith('Binary files ') || raw.startsWith('GIT binary patch')) {
      current.binary = true;
      continue;
    }

    const hunk = raw.match(HUNK_HEADER);
    if (hunk) {
      oldLine = hunk[1] ? Number(hunk[1]) : 0;
      newLine = Number(hunk[3]);
      continue;
    }

    if (raw.startsWith('\\')) continue; // "\ No newline at end of file"

    if (raw.startsWith('+')) {
      current.added.push({ line: newLine, text: raw.slice(1) });
      newLine += 1;
      continue;
    }
    if (raw.startsWith('-')) {
      current.removed.push({ line: oldLine, text: raw.slice(1) });
      oldLine += 1;
      continue;
    }
    if (raw.startsWith(' ') || raw === '') {
      oldLine += 1;
      newLine += 1;
    }
  }

  push();

  if (current && current.path === '' && current.newPath) current.path = current.newPath;
  return files.filter((f) => f.path);
}

module.exports = { parseDiff };
