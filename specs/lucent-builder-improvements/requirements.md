# Requirements Q&A

**Q1: Where should the diff viewer be accessible from in the UI?**
A: Loop detail view — a "Review Changes" tab or button appears when a loop completes or reaches `needs-review` status.

**Q2: What git diff should be shown — what's the 'base' being compared against?**
A: Worktree branch vs main/base branch — shows all changes Ralph made on the loop's worktree branch compared to where it branched from.

**Q3: What diff display style?**
A: Unified diff (single column) — cleaner, works well for typical Ralph change sizes, matches GitHub/GitLab defaults.

**Q4: Should files be collapsed or open?**
A: All files open by default but with a limited number of visible lines. Each file is individually expandable (show all lines) and collapsible.

**Q5: Should there be a file navigation sidebar?**
A: Yes — a left sidebar listing all changed files with +/- line counts; clicking a file jumps to its diff.

**Q6: What additional features beyond diff display?**
A: Summary stats header (total files changed, lines added/removed). Also recommend: syntax highlighting for readability.

**Q7: How should the Stop button kill a loop?**
A: Use the `ralph loops stop` CLI command instead of sending OS signals directly to the child process. This ensures Ralph performs a clean shutdown via its own lifecycle management.

