import { describe, expect, it } from 'vitest'
import { parseDiff } from '../src/lib/parseDiff.js'

const sampleDiff = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
-const value = 1
+const value = 2
+const extra = true
 console.log(value)
diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,2 @@
+export const created = true
+export const id = 1
diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-const removed = true
-export default removed
diff --git a/src/old name.ts b/src/new name.ts
similarity index 95%
rename from src/old name.ts
rename to src/new name.ts
index aaaaaaa..bbbbbbb 100644
--- a/src/old name.ts
+++ b/src/new name.ts
@@ -1 +1 @@
-export const label = "old"
+export const label = "new"
diff --git a/src/multi.ts b/src/multi.ts
index ccccccc..ddddddd 100644
--- a/src/multi.ts
+++ b/src/multi.ts
@@ -1,2 +1,2 @@
-const one = 1
+const one = 10
 const two = 2
@@ -10,2 +10,3 @@
 const ten = 10
-const eleven = 11
+const eleven = 110
+const twelve = 12
`

describe('parseDiff', () => {
  it('extracts per-file metadata and line counts across diff statuses', () => {
    const files = parseDiff(sampleDiff)

    expect(files).toHaveLength(5)
    expect(files).toEqual([
      expect.objectContaining({
        path: 'src/app.ts',
        status: 'M',
        additions: 2,
        deletions: 1
      }),
      expect.objectContaining({
        path: 'src/new-file.ts',
        status: 'A',
        additions: 2,
        deletions: 0
      }),
      expect.objectContaining({
        path: 'src/old-file.ts',
        status: 'D',
        additions: 0,
        deletions: 2
      }),
      expect.objectContaining({
        path: 'src/new name.ts',
        status: 'R',
        additions: 1,
        deletions: 1
      }),
      expect.objectContaining({
        path: 'src/multi.ts',
        status: 'M',
        additions: 3,
        deletions: 2
      })
    ])
    expect(files[0]?.diff).toContain('@@ -1,2 +1,3 @@')
  })

  it('returns an empty array for empty or malformed inputs', () => {
    expect(parseDiff('')).toEqual([])
    expect(parseDiff('diff --git missing-path-header')).toEqual([])
  })
})
