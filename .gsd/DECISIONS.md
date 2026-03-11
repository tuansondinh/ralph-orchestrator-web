# Decisions

<!-- Append-only register of architectural and pattern decisions -->

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| D001 | Replace custom ANSI parser (TerminalOutput.tsx) with xterm.js for loop output | Custom parser cannot handle cursor movement, bold, underline, OSC sequences, or 256-color codes. xterm.js is a full terminal emulator already used by TerminalView.tsx — no new dependency. | 2026-03-11 |
| D002 | Raw chunk passthrough — OutputBuffer stores raw PTY bytes without line-splitting | Raw PTY bytes are preserved through the entire pipeline (OutputBuffer → websocket replay → loopStore → xterm.js). xterm.js handles all ANSI/VT100/OSC rendering natively. | 2026-03-11 |
| D003 | Disk replay returns entire file as a single chunk instead of line-split array | xterm.js can handle a large single write and replays it as the original terminal session would have seen it. | 2026-03-11 |
| D004 | TerminalOutput.tsx retained as @deprecated (not deleted) | Not deleted to avoid breaking potential external uses. Added @deprecated JSDoc comment pointing to LoopTerminalOutput. | 2026-03-11 |
| D005 | Auto-push + PR on loop completion | Users should not need to manually push/PR after every loop. | 2026-03-11 |
| D006 | Per-user API keys (not shared) | Cloud mode has multiple users; shared keys are a security and billing issue. | 2026-03-11 |
| D007 | Chat as first/default tab | Chat is the primary use case of the app. | 2026-03-11 |
