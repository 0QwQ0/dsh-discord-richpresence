# dsh-discord-richpresence

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
| No activity | 正在等待大肥鱼待命 |

Every one of these lines is a **plain list you can edit** in the plugin config (`statuses`). The plugin only ever sends those exact strings to Discord.

## Privacy

**The plugin never reads your workspace content.** It does not look at session titles, message text, file paths, tool input/output, or any other content. It only reacts to coarse lifecycle signals (`agent/inbox/inserted`, `agent/status`, `tools/pre-execute`, `session/created`, `workflow/start`) and pushes the configurable status strings. If you keep the default lists, Discord can only ever see lines like "正在指挥大肥鱼干活".

## Requirements

- A **Discord desktop client** running locally on the same machine (Rich Presence goes through the local Discord IPC endpoint — a named pipe on Windows, a unix socket on macOS/Linux, or loopback TCP).
- A **Discord Application ID** (client_id). Create a throwaway application at <https://discord.com/developers/applications> → *New Application*. You do **not** need a bot, an OAuth flow, or any token for local Rich Presence — the client_id is enough.

## Install

From your dsh checkout / profile:

```sh
dsh plugin --profile web add <path-to-this-package>
```

or, if the package is already on disk (e.g. this repository):

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-discord-richpresence
```

Then edit the installed bundle's `cordis.patch.yml` (the same file that ships in this package under `cordis.patch.yml`) and set `config.clientId` to your Discord Application ID. Restart dsh.

## Configure

All configuration lives in the bundle patch (`cordis.patch.yml`) under `config`:

```yaml
config:
  clientId: '123456789012345678'          # your Discord Application ID
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
      - 正在等待大肥鱼待命
  randomize: false                        # random instead of rotating
  minIntervalMs: 5000                     # min gap between pushes
  reconnectMs: 15000                      # Discord reconnect poll interval
```

- `clientId` — **required**. Without it the plugin logs a warning and disables itself.
- `statuses` — each phase is a list; the plugin rotates through it (or picks randomly when `randomize: true`). Add, remove, or reword freely.
- Discord may take a few seconds to reflect a status change; `minIntervalMs` throttles how often the plugin pushes.

## Uninstall

```sh
dsh plugin --profile web remove dsh-discord-richpresence
```

## How it works

- `lib/discord-rpc.js` — dependency-free Discord Rich Presence client over the local IPC frame protocol (handshake with `client_id`, then `SET_ACTIVITY` frames; ping/pong keepalive; automatic reconnect).
- `lib/index.js` — the Cordis host plugin. It registers global listeners for the coarse harness events, maps them to the configured status lists, and pushes through the RPC client. All timers and the socket are torn down when the plugin fiber unloads.

## License

MIT
