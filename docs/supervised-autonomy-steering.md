# Supervised Autonomy: Steering Ralph From Outside the Loop

## The Problem

GSD feels direct, fluid, smooth — because you're *in* the conversation. You talk to the agent, ask questions, redirect mid-task. The feedback loop is milliseconds.

Ralph runs autonomously. You're mission control, not the driver. The `human.guidance` event exists but feels like leaving a post-it note on someone's desk vs. tapping them on the shoulder. The mechanism exists, the feeling doesn't.

```
GSD mode:      agent runs → you talk → it adjusts → you talk → ...
Ralph today:   agent runs → you watch → it finishes
What we want:  agent runs → you glance → nudge if needed → it adjusts instantly
```

That third mode is **supervised autonomy**. The agent does the work, but you have a throttle and steering wheel that respond immediately.

---

## Design: Five Pillars

### 1. Live Stream With Injection Points

The TUI today is a **viewer**. Flip it into a **cockpit**:

```
┌─────────────────────────────────────────────┐
│ Ralph · M001/S02/T03 · builder hat · iter 7 │
├─────────────────────────────────────────────┤
│ [live agent output streaming here]          │
│ > Reading src/auth/middleware.ts...          │
│ > Writing new session validator...          │
│ > Running tests... 3 passed, 1 failed       │
│                                             │
├─────────────────────────────────────────────┤
│ ⌨ steer: _                                  │
└─────────────────────────────────────────────┘
```

That bottom input line is everything. You're watching the agent work, and at any moment you type:

```
steer: don't fix that test, it's flakey — skip it and move on
```

Ralph injects this as a `human.guidance` event **and interrupts the current iteration** to start a fresh one with your guidance loaded. Not "next iteration" — *now*.

Key mechanic: **interrupt + restart with guidance**, not "queue for later."

### 2. Iteration Checkpoints With Approve/Redirect

Add a mode between full-auto and full-manual:

```yaml
# ralph.yml
supervision:
  mode: checkpoint    # auto | checkpoint | manual
  checkpoint_on:
    - hat_transition  # pause between planner → builder
    - gate_failure    # pause when backpressure rejects
    - task_boundary   # pause between tasks
```

At each checkpoint, Ralph pauses and shows a summary:

```
── checkpoint: builder → reviewer ──────────
 3 files changed, tests passing
 Wrote auth middleware + session validator

 [a]pprove  [r]edirect  [s]kip review  [v]iew diff
 > _
```

You glance, hit `a`, it continues. Takes 2 seconds. But if something's off, hit `r` and type a correction.

This gives the **feeling** of steering without being in the loop for every tool call.

### 3. Hot Objectives

GSD lets you change direction mid-conversation because you're *in* the conversation. Ralph needs the same from outside:

```bash
ralph steer "actually, use JWT instead of session cookies for auth"
```

This doesn't just add guidance — it **rewrites the objective** for the current loop. Next iteration, Ralph sees the updated objective and replans. Feels instant because iterations are short (30-90 seconds), so you see the pivot within a minute.

### 4. The "Why Is It Doing That" Button

Half of GSD's fluidity is that you can *ask* the agent what it's thinking. From outside Ralph:

```bash
ralph why
```

Reads current scratchpad + last event + current hat state, gives a one-liner:

```
Builder is retrying T03 because clippy gate rejected
unused import in session.rs (iter 7, 2nd attempt)
```

Now you know whether to intervene or let it cook. Without this, you're watching output scroll and guessing.

### 5. Gesture Vocabulary

GSD's steering is freeform text. Ralph should have a **small vocabulary of physical-feeling gestures**:

```bash
ralph pause              # freeze after current iteration
ralph resume             # continue
ralph steer "..."        # inject guidance, restart iteration
ralph skip               # mark current task done, move on
ralph replan             # trigger planner hat immediately
ralph focus src/auth/    # narrow scope for current task
ralph why                # explain current state
ralph undo               # revert last iteration's changes
```

Like a game controller — small set of buttons, each does one clear thing. The feeling comes from the response being immediate and visible.

---

## Implementation: What Exists vs. What's Needed

### Already In Ralph

| Capability | Where |
|-----------|-------|
| `human.guidance` events | Event bus, hatless_ralph prompt injection |
| TUI with live output | ralph-tui crate (ratatui) |
| Hat transitions | Event loop, hat_registry |
| Scratchpad state | Per-iteration disk writes |
| Hooks lifecycle | `on_start`, `on_error`, `on_complete` |
| Telegram human-in-loop | ralph-telegram crate |

### What Needs Building

| Component | Effort | Description |
|-----------|--------|-------------|
| **Iteration interruption** | Hard | Graceful cancel of running backend CLI process + restart with guidance. This is the critical piece. |
| **TUI input line** | Medium | Add text input to ratatui dashboard, wire to event injection |
| **Checkpoint mode** | Medium | Pause/resume at configurable points, summary generation |
| **`ralph why` command** | Easy | Read scratchpad + last event + hat state, format one-liner |
| **Gesture CLI commands** | Easy | Thin wrappers around event injection + loop control |
| **Hot objective rewrite** | Easy | Write new objective to disk, signal loop to re-read |

### The Hard Part: Iteration Interruption

Today, once an iteration starts, it runs to completion. For fluid steering:

```rust
// In the event loop
if human_interrupt_pending() {
    cancel_current_backend_call();  // kill the CLI process
    inject_guidance_event();
    start_fresh_iteration();        // with guidance loaded
}
```

Graceful cancellation of a running agent CLI is the hardest technical piece — but it's what turns post-it-note steering into shoulder-tap steering.

Options:
- **Signal-based:** Send SIGTERM to backend process, catch in adapter, clean up
- **Timeout-based:** Set short iteration timeout when interrupt pending, let it finish naturally
- **Checkpoint-based:** Only interrupt at natural pauses (tool call boundaries)

The checkpoint approach is safest — interrupt between tool calls, not mid-execution. Most backends emit streaming events, so you can detect "tool call completed" boundaries.

---

## UX Flow: What It Feels Like

### Scenario: Building auth middleware

```
You: ralph start "add JWT auth middleware to the API"

[Ralph TUI opens, planner hat active]

 Planning · iter 1
 > Breaking into 4 tasks: middleware, token validation,
 > route protection, tests

── checkpoint: planner → builder ──
 [a]pprove  [r]edirect
 > a

 Building · T01 middleware · iter 2
 > Creating src/middleware/auth.ts
 > Writing token extraction logic...
 > Using session cookies for state...

 ⌨ steer: use JWT not session cookies, we're stateless

 [interrupted — restarting with guidance]

 Building · T01 middleware · iter 3
 > Reading your guidance: use JWT not session cookies
 > Rewriting to use JWT bearer tokens...
 > Running tests... 4 passed
 > clippy gate... passed

── checkpoint: T01 → T02 ──
 [a]pprove  [r]edirect  [v]iew diff
 > v

 [diff view: 3 files, +89 -0, JWT middleware]
 > a

 Building · T02 token validation · iter 4
 > ...
```

Time from seeing the wrong approach to correcting it: **< 5 seconds**.

That's the GSD feeling, from outside the loop.

---

## Comparison: Steering Modes

| Mode | Who decides | Latency | Effort |
|------|------------|---------|--------|
| **GSD (in-loop)** | You + agent in conversation | Instant | High (you're always engaged) |
| **Ralph auto** | Agent alone | N/A | Zero (you walk away) |
| **Ralph checkpoint** | Agent works, you approve | ~2 sec at boundaries | Low (glance + keystroke) |
| **Ralph supervised** | Agent works, you steer when needed | ~5 sec (interrupt + restart) | Minimal (intervene only on drift) |

The sweet spot is **supervised with checkpoints at hat transitions**. You're not in the loop, but you have a hand on the wheel.

---

## Relationship to GSD Methodology

This steering model is orthogonal to — and compatible with — adopting GSD's planning methodology (see: separate analysis). The 3-level hierarchy (Milestone → Slice → Task) would make checkpoints even more meaningful:

- Checkpoint at **task boundaries** for tactical steering
- Checkpoint at **slice completion** for strategic review
- Checkpoint at **milestone gates** for scope decisions

Combined with GSD's surgical context injection, each checkpoint summary could show exactly what was planned vs. what was built, making the approve/redirect decision trivial.
