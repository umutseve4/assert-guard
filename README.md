# assert-guard

**A green tick can lie. This one has to earn it.**

`assert-guard` reads the diff of a pull request and fails the build when the change makes the test suite check *less* than it did before: assertions deleted, tests skipped or focused, empty test bodies, and assertions that can never fail.

[![CI](https://img.shields.io/github/actions/workflow/status/umutseve4/assert-guard/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white&style=for-the-badge&color=22c55e)](https://github.com/umutseve4/assert-guard/actions/workflows/ci.yml)
[![Mutation gate](https://img.shields.io/badge/mutation%20gate-25%2F25%20caught-8b5cf6?style=for-the-badge&logo=probot&logoColor=white)](#how-this-repository-proves-itself)
[![Dependencies](https://img.shields.io/badge/runtime%20deps-0-06b6d4?style=for-the-badge&logo=npm&logoColor=white)](package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](package.json)
[![License](https://img.shields.io/badge/license-MIT-f59e0b?style=for-the-badge)](LICENSE)

---

## The thirty second version

A teammate opens a pull request. CI is green. Every reviewer sees a tick.

```diff
--- a/tests/payments.test.js
+++ b/tests/payments.test.js
@@
-  expect(invoice.total).toBe(4200);
-  expect(invoice.currency).toBe('TRY');
+  console.log(invoice);

-it('refunds a cancelled order', () => {
+it.skip('refunds a cancelled order', () => {
```

The suite still passes, because it now checks almost nothing. `assert-guard` posts this instead:

```text
assert-guard
scanned 1 changed file(s), 1 of them test files
assertions added 0, removed 2

[x] tests/payments.test.js:12  assertions-removed
    This file loses 2 assertions (removed 2, added 0). The suite can still go
    green while checking less.
    fix: Restore the assertions, or explain the loss in the pull request body
         and apply the waiver label.

[x] tests/payments.test.js:18  test-skipped
    A test was switched off with it.skip.
    > it.skip('refunds a cancelled order', () => {
    fix: Fix the test or delete it. A skipped test is a green tick that checks
         nothing.

2 error(s), 0 warning(s)
```

Every finding also lands as an inline annotation on the diff and as a table in the job summary, so the reviewer sees it without opening a log.

## Quick start

Add one job. There is nothing to install, no lockfile, no runtime dependency.

```yaml
name: assert-guard
on: pull_request

jobs:
  tests-must-still-assert:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # assert-guard needs the base commit
      - uses: umutseve4/assert-guard@v1
```

That is the whole setup. The job turns red only when the pull request weakens the tests.

Prefer to start in observation mode? Report first, block later:

```yaml
      - uses: umutseve4/assert-guard@v1
        with:
          fail-on: never
```

## Use it locally, before you push

```bash
git diff main...HEAD | npx assert-guard
git diff main...HEAD | npx assert-guard --format json | jq '.stats'
```

```text
Usage:
  assert-guard [--diff <file>] [options]
  git diff main...HEAD | assert-guard [options]

  --format <fmt>             text | markdown | json | github   (default: text)
  --fail-on <level>          error | warning | never           (default: error)
  --ignore <paths>           comma separated path prefixes to skip
  --disable <rules>          comma separated rule ids to switch off
  --include-non-test-files   apply the rules outside test paths too
```

Exit code 0 means clean, 1 means findings at or above the threshold, 2 means the invocation itself was wrong. A misconfigured run never reports "clean".

## The **7** rules

| rule | severity | what it catches |
| --- | --- | --- |
| `assertions-removed` | error | The file ends up with fewer assertions than it started with. |
| `test-file-deleted` | error | A whole test file disappeared from the tree. |
| `test-skipped` | error | `it.skip`, `xit`, `@pytest.mark.skip`, `t.Skip`, `#[ignore]`, `@Disabled` and friends. |
| `test-focused` | error | `.only` or `fdescribe`, which silently stops every sibling test from running. |
| `tautological-assertion` | error | `expect(true).toBe(true)`, `assert True`, `assert!(true)`: assertions that cannot fail. |
| `empty-test` | error | A test declared with an empty body, so it passes without checking anything. |
| `assertion-commented-out` | warning | An assertion was commented out instead of being fixed or removed. |

Languages covered by the pattern tables: JavaScript, TypeScript, Python, Go, Rust, Java, Kotlin, C#, Ruby.

## Configuration

| input | default | meaning |
| --- | --- | --- |
| `fail-on` | `error` | `error`, `warning` or `never`. |
| `ignore` | empty | Path prefixes to skip, comma or newline separated. |
| `disable` | empty | Rule ids to switch off. An unknown id fails the run on purpose. |
| `include-non-test-files` | `false` | Also scan files outside recognised test paths. |
| `waiver-label` | `assert-guard:waived` | Pull request label that turns a blocking run into a report only run. |
| `base` / `head` | resolved from the event | Override the compared commits. |

| output | meaning |
| --- | --- |
| `findings` | JSON array of every finding. |
| `summary` | The markdown report. |
| `error-count`, `warning-count` | Counters, useful for follow up steps. |

### The escape hatch is deliberate, and it is visible

Sometimes removing a test is the right call. Apply the `assert-guard:waived` label: the job goes green, and the full report stays in the log and the job summary. The decision is recorded rather than hidden, which is the entire point.

## What it does not do

Stated plainly, because a tool about honest tests should be honest about itself.

- It does not measure coverage and it does not replace mutation testing. It reads a diff, not a running program.
- It does not know whether an assertion is *good*, only that one exists.
- It is regex based, so a deeply unusual test harness can be missed. Every rule can be disabled per repository.
- It only reports on files inside recognised test paths unless you ask for more with `include-non-test-files`.
- Deleting a test is sometimes correct. The waiver label exists for exactly that case.

## How this repository proves itself

Running a suite is not evidence that the suite works. This repository holds itself to the rule it enforces:

- **74** unit tests covering the diff parser, the rules, the reporters and the action wiring.
- **19** end to end checks that build a throwaway git repository, weaken a test in a real commit, and run the real action entry point against it, including the waiver path and the exit codes.
- **25** mutations applied to the source on purpose, one at a time. Each one must turn the suite red. If a single mutation survives, CI fails, because a test that cannot notice a broken line is not protecting anything.
- Every number in this section is recounted from the code by `scripts/verify-claims.mjs` on every run. If the README drifts, the build breaks.
- `assert-guard` runs on its own pull requests. It has to pass its own rules first.

```bash
npm test           # unit tests
npm run e2e        # end to end, needs git
npm run mutation   # mutation gate
npm run verify     # all three
```

## Why the tick lies in the first place

Test suites decay in a very specific direction. Nobody writes a broken test on purpose. A test starts failing, the release is due, and the fastest honest looking edit is to weaken the assertion or add `.skip`. The suite goes green, the tick appears, and the coverage number barely moves, because the test still runs, it just no longer asks anything.

`assert-guard` does not fix that culture. It just makes the moment visible while the change is still a pull request, when it costs one line to reverse.

## Contributing

Issues and pull requests are welcome. One house rule, enforced by CI: a pull request that removes an assertion has to say why in its body and carry the waiver label. The tool applies to itself.

## License

MIT. See [LICENSE](LICENSE).
