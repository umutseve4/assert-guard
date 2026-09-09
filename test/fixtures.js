'use strict';

/** Small hand written unified diffs used across the test suite. */

const REMOVED_ASSERTIONS = `diff --git a/test/user.test.js b/test/user.test.js
index 1111111..2222222 100644
--- a/test/user.test.js
+++ b/test/user.test.js
@@ -10,3 +10,1 @@ describe('user', () => {
-  expect(user.name).toBe('ada');
-  expect(user.age).toBe(36);
+  console.log(user);
`;

const SKIPPED_TEST = `diff --git a/test/user.test.js b/test/user.test.js
index 1111111..2222222 100644
--- a/test/user.test.js
+++ b/test/user.test.js
@@ -4,1 +4,1 @@
-it('keeps the balance positive', () => {
+it.skip('keeps the balance positive', () => {
`;

const FOCUSED_TEST = `diff --git a/spec/cart_spec.rb b/spec/cart_spec.rb
index 1111111..2222222 100644
--- a/spec/cart_spec.rb
+++ b/spec/cart_spec.rb
@@ -2,0 +3,1 @@
+describe.only('cart', () => {
`;

const TAUTOLOGY = `diff --git a/src/__tests__/math.test.ts b/src/__tests__/math.test.ts
index 1111111..2222222 100644
--- a/src/__tests__/math.test.ts
+++ b/src/__tests__/math.test.ts
@@ -7,0 +8,1 @@
+  expect(true).toBe(true);
`;

const EMPTY_TEST = `diff --git a/tests/api.test.js b/tests/api.test.js
index 1111111..2222222 100644
--- a/tests/api.test.js
+++ b/tests/api.test.js
@@ -1,0 +2,1 @@
+it('returns 200 for a healthy service', () => {})
`;

const COMMENTED_ASSERTION = `diff --git a/tests/api.test.js b/tests/api.test.js
index 1111111..2222222 100644
--- a/tests/api.test.js
+++ b/tests/api.test.js
@@ -5,0 +6,1 @@
+  // expect(res.status).toBe(200);
`;

const DELETED_TEST_FILE = `diff --git a/tests/legacy.test.js b/tests/legacy.test.js
deleted file mode 100644
index 1111111..0000000
--- a/tests/legacy.test.js
+++ /dev/null
@@ -1,3 +0,0 @@
-it('still matters', () => {
-  expect(sum(1, 2)).toBe(3);
-});
`;

const HEALTHY = `diff --git a/tests/api.test.js b/tests/api.test.js
index 1111111..2222222 100644
--- a/tests/api.test.js
+++ b/tests/api.test.js
@@ -5,0 +6,2 @@
+  expect(res.status).toBe(200);
+  expect(res.body.id).toBe('42');
`;

const PRODUCTION_ONLY = `diff --git a/src/server.js b/src/server.js
index 1111111..2222222 100644
--- a/src/server.js
+++ b/src/server.js
@@ -20,2 +20,1 @@
-  assert(port > 0);
+  // port assumed valid
`;

const PYTHON_SKIP = `diff --git a/tests/test_payments.py b/tests/test_payments.py
index 1111111..2222222 100644
--- a/tests/test_payments.py
+++ b/tests/test_payments.py
@@ -12,1 +12,2 @@
-def test_refund_is_recorded():
+@pytest.mark.skip(reason="flaky")
+def test_refund_is_recorded():
`;

const GO_SKIP = `diff --git a/internal/ledger/ledger_test.go b/internal/ledger/ledger_test.go
index 1111111..2222222 100644
--- a/internal/ledger/ledger_test.go
+++ b/internal/ledger/ledger_test.go
@@ -30,0 +31,1 @@
+	t.Skip("revisit after the migration")
`;

const BINARY = `diff --git a/tests/fixture.png b/tests/fixture.png
index 1111111..2222222 100644
Binary files a/tests/fixture.png and b/tests/fixture.png differ
`;

const RENAMED_WITH_LOSS = `diff --git a/tests/old.test.js b/tests/new.test.js
similarity index 60%
rename from tests/old.test.js
rename to tests/new.test.js
index 1111111..2222222 100644
--- a/tests/old.test.js
+++ b/tests/new.test.js
@@ -3,2 +3,1 @@
-  expect(a).toBe(1);
-  expect(b).toBe(2);
+  expect(a).toBe(1);
`;

/**
 * Git omits the ---/+++ header when a binary file is deleted, so the status has
 * to come from the "deleted file mode" line alone.
 */
const DELETED_BINARY_TEST_FIXTURE = `diff --git a/tests/golden.png b/tests/golden.png
deleted file mode 100644
index 1111111..0000000
Binary files a/tests/golden.png and /dev/null differ
`;

const DELETED_TEST_FILE_NO_HEADER = `diff --git a/tests/legacy.test.js b/tests/legacy.test.js
deleted file mode 100644
index 1111111..0000000
@@ -1,1 +0,0 @@
-expect(sum(1, 2)).toBe(3);
`;

module.exports = {
  DELETED_BINARY_TEST_FIXTURE,
  DELETED_TEST_FILE_NO_HEADER,
  REMOVED_ASSERTIONS,
  SKIPPED_TEST,
  FOCUSED_TEST,
  TAUTOLOGY,
  EMPTY_TEST,
  COMMENTED_ASSERTION,
  DELETED_TEST_FILE,
  HEALTHY,
  PRODUCTION_ONLY,
  PYTHON_SKIP,
  GO_SKIP,
  BINARY,
  RENAMED_WITH_LOSS,
};
