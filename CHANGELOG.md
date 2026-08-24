# Changelog

All notable changes to this project are documented in this file.

## [0.2.2] - 2026-08-23

### Fixed

- Rich-mode data is now tied to the **active session**: the plugin tracks the
  session of the user's last real input (`source.kind === 'user'`) and collects
  thinking turn/step, total input tokens, and LLM elapsed time from that session
  only. Subagent and background-session events no longer overwrite the values
  shown on Discord. Switching sessions follows the user automatically.
- `agent/status` before any session is active now only adopts top-level agents.

## [0.2.1] - 2026-08-23

### Fixed

- Settings toggle no longer snaps back to off after clicking: the browser half
  reads `richMode` through the real describe-mirror shape
  (`view.namespaces[]`), writes via `settings.mutate` with `expectedRevision`,
  and folds the accepted view through `acceptView`.

### Changed

- Repository root README is now Chinese (`README.md`); the English doc moved to
  `README.en.md` as a secondary reference.

## [0.2.0] - 2026-08-23

### Added

- Rich mode toggle in Settings → General ("Rich presence detail").
- Rich-mode status lines driven by live data: thinking turn/step, total input
  tokens (via `tokenMeter`), elapsed LLM thinking time, and typing hints.
  Statuses are picked intelligently and randomly, each staying on screen for at
  least 8 seconds.
- Browser half (`lib/client.js`) registers the settings row.

## [0.1.0] - 2026-08-22

### Added

- Initial release: vague, user-configurable Rich Presence status lines on the
  local Discord client.
- Dependency-free Discord RPC client over the local IPC frame protocol
  (named pipe / TCP fallback, handshake, `SET_ACTIVITY`, ping/pong, reconnect).
- Coarse, content-free event mapping: userInput / agentWorking / tools /
  forking / idle status groups, each a user-editable list.
