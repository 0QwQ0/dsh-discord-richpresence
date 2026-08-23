# dsh-discord-richpresence

> **中文**: [README.md](README.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that mirrors your interaction state with dsh onto the **local Discord client** as Rich Presence — in real time, with **vague, user-configurable status lines only**.

It is a host-side background plugin: no tray icon, no UI, no window. Once installed it is injected into the harness startup flow and keeps running alongside dsh.

## What it does

The plugin watches coarse activity signals from the running harness:

| dsh signal | Example status (default) |
| --- | --- |
| A user message entered the agent's inbox | 正在指挥大肥鱼干活 / 正在给大肥鱼喂 token |
| The agent is running (thinking / streaming) | 正在与大肥鱼一起 Brainstorming / 正在听大肥鱼讲解 Project |
| A model tool is dispatching | 正在提交改动意见 |
| A new session / fork (branch conversation) was created | 正在创建大肥鱼记忆切片 |
| No activity | 大肥鱼待命 |

Every one of these lines is a **plain list you can edit** in the plugin config (`statuses`). The plugin only ever sends those exact strings to Discord.

## Rich mode (optional)

By default the plugin pushes the vague status lines above. In **Settings → General → Rich presence detail** you can switch on **rich mode**. When enabled, the plugin pushes smarter, data-driven status lines instead:

| Live fact | Example status |
| --- | --- |
| You just sent a message | 正在指导大肥鱼 |
| The agent is thinking | 大肥鱼正在思考 6/195 |
| Total input tokens | 大肥鱼正在记笔记 38.7M |
| Elapsed LLM thinking time | 大肥鱼已经思考了 30m46s |

Rich-mode statuses are picked **intelligently and randomly** from the current live facts — they are not bound to a specific moment — and **each status stays on screen for at least 8 seconds**.

**The data is always tied to the conversation you are currently interacting with**: the plugin tracks the session of your last real input (`source.kind === 'user'`) and collects thinking steps, token counts, and elapsed thinking time from that session only — subagents, background sessions, and other workspaces never leak in. When you switch sessions, the pushed data follows automatically. The toggle is persisted at runtime in the `discord-richpresence` settings namespace; there is nothing to configure in the patch for it.

## Privacy

**The plugin never reads your workspace content.** It does not look at session titles, message text, file paths, tool input/output, or any other content. It only reacts to coarse lifecycle signals (`agent/inbox/inserted`, `agent/status`, `agent/pre-step`, `tools/pre-execute`, `session/created`, `workflow/start`) and pushes the configurable status strings (or the rich-mode templates above, filled with scalar facts only — no content). If you keep the default lists, Discord can only ever see lines like "正在指挥大肥鱼干活".

## Requirements

- A **Discord desktop client** running locally on the same machine (Rich Presence goes through the local Discord IPC endpoint — a named pipe on Windows, a unix socket on macOS/Linux, or loopback TCP).

The Discord Application ID is pre-configured in the plugin, so there is nothing to set up — install and restart, and the status lines appear on your Discord profile automatically.

## Install

Repository: <https://github.com/0QwQ0/dsh-discord-richpresence>
Release tarball: <https://github.com/0QwQ0/dsh-discord-richpresence/releases/latest/download/dsh-discord-richpresence-0.2.2.tgz>

From your dsh checkout / profile:

```sh
dsh plugin --profile web add https://github.com/0QwQ0/dsh-discord-richpresence/releases/latest/download/dsh-discord-richpresence-0.2.2.tgz
```

or, if the package is already on disk (e.g. this repository):

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-discord-richpresence
```

## Configure

All configuration lives in the bundle patch (`cordis.patch.yml`) under `config`:

```yaml
config:
  clientId: '1540732930127691807'         # pre-configured; normally unchanged
  details: 'DeepSeek Harness'             # optional second line
  largeImage: ''                          # optional Discord asset key
  statuses:                               # user-editable lists, grouped by phase
    userInput:
      - 正在指挥大肥鱼干活
      - 正在给大肥鱼喂 token
    agentWorking:
      - 正在与大肥鱼一起 Brainstorming
      - 正在听大肥鱼讲解 Project
    tools:
      - 正在提交改动意见
    forking:
      - 正在创建大肥鱼记忆切片
    idle:
      - 大肥鱼待命
  randomize: false                        # random instead of rotating
  minIntervalMs: 5000                     # min gap between pushes
  reconnectMs: 15000                      # Discord reconnect poll interval
```

- `statuses` — each phase is a list; the plugin rotates through it (or picks randomly when `randomize: true`). Add, remove, or reword freely.
- Discord may take a few seconds to reflect a status change; `minIntervalMs` throttles how often the plugin pushes.
- The rich-mode toggle is **not** part of the patch — it lives in Settings → General and is persisted at runtime.

## Uninstall

```sh
dsh plugin --profile web remove dsh-discord-richpresence
```

### Does uninstall restore the pre-install state?

**Almost — with one known leftover:**

| Item | After uninstall |
| --- | --- |
| `dsh.profile.bundles` entry | ✅ Removed automatically |
| `dependencies` (package.json) | ✅ Removed automatically |
| Host plugin (event listeners, Discord RPC) | ✅ Stopped (fully gone after restarting dsh) |
| Browser settings toggle (client bundle) | ✅ Removed (disappears after a page refresh) |
| `node_modules` link | ⚠️ A stale empty junction may remain (pnpm `link:` install physical file; harmless, removable manually) |
| `discord-richpresence:` section in `settings.yaml` | ⚠️ **Left behind** (the settings service only unregisters the namespace; it does not delete the user settings document) |

**The only manual step is `settings.yaml`.** If you want a fully clean pre-install state, edit `$DSH_HOME/settings.yaml` and remove this block:

```yaml
discord-richpresence:
  richMode: true
```

The leftover is harmless (no consumer reads it once the plugin is gone) and is re-read if you reinstall.

## Upgrading (old version → new version)

Same-package-name installs overwrite — **no uninstall needed**:

### Upgrade from a Release tarball install

```sh
dsh plugin --profile web add https://github.com/0QwQ0/dsh-discord-richpresence/releases/latest/download/dsh-discord-richpresence-0.2.2.tgz
```

dsh overwrites the old package with the new tarball and keeps the `dsh.profile.bundles` entry.

### Upgrade from a `link:` (source directory) install

If you installed with a `link:` spec (pointing at the plugin source directory):

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-discord-richpresence
```

After updating the source, **restart dsh** to pick up the new host code.

### After upgrading

1. **Restart dsh** (the host plugin loads at startup).
2. **Refresh the browser page** (the client bundle is cached; `/plugins/dsh-discord-richpresence/client.js` is re-fetched, which is how the new settings toggle appears).
3. **Settings are preserved**: the `discord-richpresence: richMode: <true/false>` value in `settings.yaml` **survives upgrades** — if rich mode was on before, it stays on after, no reconfiguration needed.

### Upgrade problems?

If the toggle misbehaves after an upgrade, do a full uninstall first (including the manual `settings.yaml` cleanup above), then install the latest version fresh.

## How it works

- `lib/discord-rpc.js` — dependency-free Discord Rich Presence client over the local IPC frame protocol (handshake with `client_id`, then `SET_ACTIVITY` frames; ping/pong keepalive; automatic reconnect).
- `lib/index.js` — the Cordis host plugin. It registers global listeners for the coarse harness events, maps them to the configured status lists (or rich-mode templates), and pushes through the RPC client. Rich mode reads the `discord-richpresence` settings namespace; all timers and the socket are torn down when the plugin fiber unloads.
- `lib/client.js` — the browser half. Registers the Settings → General toggle row that writes the `richMode` field of the `discord-richpresence` settings namespace.

## License

MIT
