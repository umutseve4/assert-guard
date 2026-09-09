'use strict';

/**
 * Language aware pattern tables.
 *
 * Every pattern is deliberately conservative. A false positive costs a
 * developer a red build, so a rule only fires on syntax that has no other
 * plausible reading.
 */

/** Calls that assert something about program state. */
const ASSERTION_PATTERNS = [
  // JavaScript / TypeScript
  /\bexpect\s*\(/,
  /\bexpect\s*\.\s*(?:soft|poll)\s*\(/,
  /\bassert\s*\(/,
  /\bassert\s*\.\s*[A-Za-z_$][\w$]*\s*\(/,
  /\bshould\s*\.\s*[A-Za-z_$][\w$]*\s*\(/,
  /\.\s*should\s*\.\s*(?:equal|eql|be|have|not|deep|throw|exist)\b/,
  /\bt\s*\.\s*(?:is|not|true|false|deepEqual|notDeepEqual|throws|throwsAsync|like|regex)\s*\(/,
  // Python
  /^\s*assert\s+\S/,
  /\bself\s*\.\s*assert[A-Za-z_]\w*\s*\(/,
  /\bpytest\s*\.\s*raises\s*\(/,
  /\bnp\s*\.\s*testing\s*\.\s*assert_\w+\s*\(/,
  // Go
  /\bt\s*\.\s*(?:Error|Errorf|Fatal|Fatalf)\s*\(/,
  /\b(?:require|assert)\s*\.\s*[A-Z]\w*\s*\(/,
  // Rust
  /\bassert(?:_eq|_ne)?\s*!\s*[([{]/,
  /\bdebug_assert(?:_eq|_ne)?\s*!\s*[([{]/,
  // Java / Kotlin / C#
  /\bAssert\s*\.\s*[A-Za-z]\w*\s*\(/,
  /\bassertThat\s*\(/,
  /\bassert(?:True|False|Equals|NotNull|Null|Throws)\s*\(/,
  // Ruby
  /\bassert_\w+\s*[\s(]/,
  // Shell / generic harness
  /\bassert_(?:eq|equal|ok|fail)\b/,
];

/** Markers that switch a test off while leaving it in the file. */
const SKIP_PATTERNS = [
  { re: /\b(?:it|test|describe|context|suite|bench)\s*\.\s*skip\s*[(`]/, label: 'it.skip' },
  { re: /\b(?:xit|xtest|xdescribe|xcontext|xspecify)\s*[(`]/, label: 'xit' },
  { re: /\b(?:it|test|describe)\s*\.\s*todo\s*[(`]/, label: 'it.todo' },
  { re: /\bpending\s*\(/, label: 'pending()' },
  { re: /@\s*pytest\s*\.\s*mark\s*\.\s*(?:skip|skipif|xfail)\b/, label: '@pytest.mark.skip' },
  { re: /@\s*unittest\s*\.\s*(?:skip|expectedFailure)\b/, label: '@unittest.skip' },
  { re: /\bt\s*\.\s*Skip(?:Now|f)?\s*\(/, label: 't.Skip' },
  { re: /#\s*\[\s*ignore\s*[\]\(]/, label: '#[ignore]' },
  { re: /@\s*(?:Disabled|Ignore)\b/, label: '@Disabled' },
  { re: /\[\s*(?:Ignore|Skip)\s*[\]\(]/, label: '[Ignore]' },
  { re: /\bskip\s*\(\s*["'`]/, label: 'skip("...")' },
];

/** Markers that silently disable every sibling test in the file. */
const FOCUS_PATTERNS = [
  { re: /\b(?:it|test|describe|context|suite)\s*\.\s*only\s*[(`]/, label: '.only' },
  { re: /\b(?:fit|fdescribe|ftest)\s*[(`]/, label: 'fdescribe' },
  { re: /\bdescribe\s*\.\s*serial\s*\.\s*only\s*[(`]/, label: '.serial.only' },
];

/** Assertions that can never fail, so they prove nothing. */
const TAUTOLOGY_PATTERNS = [
  { re: /\bexpect\s*\(\s*(true|1)\s*\)\s*\.\s*(?:to\s*\.\s*be\s*\.\s*true|toBe\s*\(\s*(?:true|1)\s*\)|toBeTruthy\s*\(\s*\))/, label: 'expect(true).toBe(true)' },
  { re: /\bexpect\s*\(\s*(?:(true|false|\d+|"[^"]*"|'[^']*')\s*)\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*\1\s*\)/, label: 'expect(x).toBe(x) on a literal' },
  { re: /\bassert\s*(?:\.\s*ok\s*)?\(\s*(?:true|1)\s*[,)]/, label: 'assert(true)' },
  { re: /^\s*assert\s+(?:True|true|1)\s*(?:$|#|,)/, label: 'assert True' },
  { re: /\bassert(?:_eq)?\s*!\s*\(\s*true\s*[,)]/, label: 'assert!(true)' },
  { re: /\bAssert\s*\.\s*(?:IsTrue|assertTrue)\s*\(\s*true\s*\)/, label: 'Assert.IsTrue(true)' },
  { re: /\bexpect\s*\(\s*([A-Za-z_$][\w$.]*)\s*\)\s*\.\s*(?:toBe|toEqual)\s*\(\s*\1\s*\)/, label: 'expect(x).toBe(x)' },
];

/** A test declaration whose body is opened and closed with nothing inside. */
const EMPTY_TEST_PATTERNS = [
  { re: /\b(?:it|test|specify|bench)\s*\(\s*(?:["'`].*?["'`])\s*,\s*(?:async\s*)?(?:\(\s*\)|function\s*\(\s*\w*\s*\))\s*=?>?\s*\{\s*\}\s*\)/, label: 'empty test body' },
  { re: /\b(?:it|test)\s*\(\s*(?:["'`].*?["'`])\s*\)\s*;?\s*$/, label: 'test declared with no body' },
];

/** Comment prefixes per language family, used for the commented-out rule. */
const COMMENT_PREFIX = /^\s*(?:\/\/|#|--|\/\*|\*(?!\/)|<!--)\s*/;

/** Paths that are understood to hold tests. */
const TEST_PATH_PATTERNS = [
  /(^|\/)(?:tests?|specs?|__tests__|testing)(\/|$)/i,
  /(^|\/)[^/]*[._-](?:test|spec)s?\.[A-Za-z0-9]+$/i,
  /(^|\/)test_[^/]+\.py$/i,
  /(^|\/)[^/]+_test\.(?:go|py|rb|dart|exs?)$/i,
  /(^|\/)[^/]*Tests?\.(?:cs|java|kt|swift)$/i,
];

module.exports = {
  ASSERTION_PATTERNS,
  SKIP_PATTERNS,
  FOCUS_PATTERNS,
  TAUTOLOGY_PATTERNS,
  EMPTY_TEST_PATTERNS,
  COMMENT_PREFIX,
  TEST_PATH_PATTERNS,
};
