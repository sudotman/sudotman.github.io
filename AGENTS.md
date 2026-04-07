# AGENTS.md

Repository-level guide for coding agents.

## Scope
This file applies to the entire repository.

## Working Rules
- Keep the app static (no build system additions unless explicitly requested).
- Prefer small, targeted edits in `js/main.js` and `css/style.css`.
- Preserve current visual identity (CRT/pixel aesthetic) unless the task requests a redesign.
- For interactive behavior changes, prioritize smooth transitions and avoid heavy per-dot DOM effects that can stutter on low-end devices.
- Keep README as the single source of high-level documentation.

## Validation
- After changes, run quick syntax checks and inspect git diff.
- If a browser screenshot tool is unavailable, report that plainly.
