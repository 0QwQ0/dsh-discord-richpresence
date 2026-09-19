# Changelog

All notable changes to this project are documented in this file.

## [0.3.1] - 2026-09-19

### Fixed

- **Client registration bug**: `dsh.client.inject` listed
  `@deepseek-ai/dsh-client-ui-slots`, which is not a composed row in the web
  profile (the `slots` service comes from `dsh-client-ui-renderer`). An injected
  package must be a composed row, so the browser half could fail to activate.
  The list now mirrors the officially composed set — connection, locale,
  ui-settings and api-remotes — the same packages
  `dsh-client-ui-settings-general` injects. Added `test/client-inject.mjs` to
  assert every injected package is a composed row.

### Changed

- Verified against the running harness release **0.1.5-rc.2** (the current npm
  `latest`) and the **0.1.6-alpha.2** preview: both expose the same settings API
  (`installSection` / `register`, no `installSettingsSection`) and ship
  `@deepseek-ai/dsh-client-store`, so no further code change was needed.
- `@deepseek-ai/dsh-settings` peer range extended with an explicit branch for
  `0.1.6` (`… || >=0.1.6-alpha.1 <0.2.0-0`); the previous range silently
  excluded every `0.1.6` pre-release.
- README install commands and the marketplace entry now use the **versionless**
  release asset, so they survive future releases.

## [0.3.0] - 2026-08-24

### Added

- Support for the current npm `latest` harness release (`0.1.5-rc.2`), alongside
  the earlier `0.1.1-rc.2` line. No configuration switch is needed.

### Changed

- **Host half**: settings registration now probes the running harness. `0.1.5+`
  exposes `SettingsProvider.installSection(owner, ns, schema, entry, hooks)`,
  while `0.1.1` only has `register(ns, schema, { base })`; the plugin no longer
  imports the module-level `installSettingsSection` / `settingsNamespace`
  helpers that `0.1.5` removed, so the module loads on either generation.
- **Client half**: the snapshot store resolves at runtime —
  `@deepseek-ai/dsh-client-store` (`0.1.5+`) → `@deepseek-ai/dsh-client-runtime/client`
  (`0.1.1`) → an inlined minimal implementation — instead of hard-requiring the
  package that `0.1.5` dropped.
- `dsh.client.inject` no longer lists `@deepseek-ai/dsh-client-runtime`, which
  does not exist in `0.1.5+`.
- `peerDependencies` for `@deepseek-ai/dsh-settings` now uses an explicit
  pre-release branch (`>=0.1.1-rc.1 <0.1.5-0 || >=0.1.5-rc.1 <0.2.0-0`); the
  previous `>=0.1.1-rc.1 <0.2.0-0` silently excluded `0.1.5-rc.2` under
  node-semver's pre-release rules.

### Verified

- Settings registration exercised against real `SettingsProvider`
  implementations on both generations (`test/compat-settings.mjs`).
- Client bundle exercised for all three store-resolution paths
  (`test/client-bundle.mjs`).

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
