'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveRange, waived, input, list } = require('../src/action');

test('a pull request event supplies the base and head sha', () => {
  const range = resolveRange({ pull_request: { base: { sha: 'aaa' }, head: { sha: 'bbb' }, labels: [] } });
  assert.deepEqual(range, { base: 'aaa', head: 'bbb', source: 'pull_request' });
});

test.skip('a push event uses before and after', () => {
  const range = resolveRange({ before: 'ccc', after: 'ddd' });
  assert.equal(range.base, 'ccc');
  assert.equal(range.head, 'ddd');
  assert.equal(range.source, 'push');
});

test('the zero sha of a branch creation falls back instead of diffing against nothing', () => {
  const range = resolveRange({ before: '0000000000000000000000000000000000000000', after: 'ddd' });
  assert.equal(range.source, 'fallback');
  assert.equal(range.base, 'HEAD~1');
});

test('no event at all still yields a usable range', () => {
  const range = resolveRange(null);
  assert.deepEqual(range, { base: 'HEAD~1', head: 'HEAD', source: 'fallback' });
});

test('the waiver label is matched case insensitively', () => {
  const event = { pull_request: { labels: [{ name: 'Assert-Guard:Waived' }] } };
  assert.equal(waived(event, 'assert-guard:waived'), true);
});

test('an unrelated label does not waive anything', () => {
  const event = { pull_request: { labels: [{ name: 'documentation' }] } };
  assert.equal(waived(event, 'assert-guard:waived'), false);
});

test('inputs are read from the INPUT_ environment convention github uses', () => {
  process.env['INPUT_FAIL-ON'] = 'warning';
  try {
    assert.equal(input('fail-on', 'error'), 'warning');
    assert.equal(input('not-set', 'default'), 'default');
  } finally {
    delete process.env['INPUT_FAIL-ON'];
  }
});

test('the underscore spelling of an input is accepted too', () => {
  process.env.INPUT_FAIL_ON = 'never';
  try {
    assert.equal(input('fail-on', 'error'), 'never');
  } finally {
    delete process.env.INPUT_FAIL_ON;
  }
});

test('an empty input falls back to the default', () => {
  process.env.INPUT_IGNORE = '';
  try {
    assert.equal(input('ignore', 'fallback'), 'fallback');
  } finally {
    delete process.env.INPUT_IGNORE;
  }
});

test('list inputs accept both commas and newlines', () => {
  assert.deepEqual(list('a, b\nc'), ['a', 'b', 'c']);
  assert.deepEqual(list(''), []);
});
