# Autonomous GSD Phase Runner

You are autonomously executing the GSD roadmap for this project. Do NOT ask the user for input — make all decisions yourself using the roadmap and success criteria.

## Workflow (follow every iteration)

1. Run /gsd:progress to check current state
2. If current phase has no PLAN.md → run /gsd:plan-phase to create it
3. If current phase has a PLAN.md and is not executed → run /gsd:execute-phase
4. After execution → run /gsd:verify-work to validate against success criteria
5. Repeat until all phases 6-9 are complete

## Rules

- Make autonomous decisions using .planning/ROADMAP.md success criteria
- Fix test failures before moving to the next phase
- Commit after each plan completes
- Do not skip verification steps

## Completion

When all phases 6 through 9 are verified complete, output exactly:

<promise>ALL PHASES COMPLETE</promise>
