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

Rich-mode statuses are picked **intelligently and randomly** from the current live facts — they are not bound to a specific moment — and **each status stays on screen for at least 8 seconds**. The toggle is persisted at runtime in the `discord-richpresence` settings namespace; there is nothing to configure in the patch for it.

## Privacy

**The plugin never reads your workspace content.** It does not look at session titles, message text, file paths, tool input/output, or any other content. It only reacts to coarse lifecycle signals (`agent/inbox/inserted`, `agent/status`, `agent/pre-step`, `tools/pre-execute`, `session/created`, `workflow/start`) and pushes the configurable status strings (or the rich-mode templates above, filled with scalar facts only — no content). If you keep the default lists, Discord can only ever see lines like "正在指挥大肥鱼干活".

## Requirements

- A **Discord desktop client** running locally on the same machine (Rich Presence goes through the local Discord IPC endpoint — a named pipe on Windows, a unix socket on macOS/Linux, or loopback TCP).

The Discord Application ID is pre-configured in the plugin, so there is nothing to set up — install and restart, and the status lines appear on your Discord profile automatically.

## Install

Repository: <https://github.com/0QwQ0/dsh-discord-richpresence>
Release tarball: <https://github.com/0QwQ0/dsh-discord-richpresence/releases/latest/download/dsh-discord-richpresence-0.2.1.tgz>

From your dsh checkout / profile:

```sh
dsh plugin --profile web add https://github.com/0QwQ0/dsh-discord-richpresence/releases/latest/download/dsh-discord-richpresence-0.2.1.tgz
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

## How it works

- `lib/discord-rpc.js` — dependency-free Discord Rich Presence client over the local IPC frame protocol (handshake with `client_id`, then `SET_ACTIVITY` frames; ping/pong keepalive; automatic reconnect).
- `lib/index.js` — the Cordis host plugin. It registers global listeners for the coarse harness events, maps them to the configured status lists (or rich-mode templates), and pushes through the RPC client. Rich mode reads the `discord-richpresence` settings namespace; all timers and the socket are torn down when the plugin fiber unloads.
- `lib/client.js` — the browser half. Registers the Settings → General toggle row that writes the `richMode` field of the `discord-richpresence` settings namespace.

## License

MIT
