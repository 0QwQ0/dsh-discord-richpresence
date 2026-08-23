# dsh-discord-richpresence

> **涓枃**: [README.md](README.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that mirrors your interaction state with dsh onto the **local Discord client** as Rich Presence 鈥?in real time, with **vague, user-configurable status lines only**.

It is a host-side background plugin: no tray icon, no UI, no window. Once installed it is injected into the harness startup flow and keeps running alongside dsh.

## What it does

The plugin watches coarse activity signals from the running harness:

| dsh signal | Example status (default) |
| --- | --- |
| A user message entered the agent's inbox | 姝ｅ湪鎸囨尌澶ц偉楸煎共娲?/ 姝ｅ湪缁欏ぇ鑲ラ奔鍠?token |
| The agent is running (thinking / streaming) | 姝ｅ湪涓庡ぇ鑲ラ奔涓€璧?Brainstorming / 姝ｅ湪鍚ぇ鑲ラ奔璁茶В Project |
| A model tool is dispatching | 姝ｅ湪鎻愪氦鏀瑰姩鎰忚 |
| A new session / fork (branch conversation) was created | 姝ｅ湪鍒涘缓澶ц偉楸艰蹇嗗垏鐗?|
| No activity | 澶ц偉楸煎緟鍛?|

Every one of these lines is a **plain list you can edit** in the plugin config (`statuses`). The plugin only ever sends those exact strings to Discord.

## Rich mode (optional)

By default the plugin pushes the vague status lines above. In **Settings 鈫?General 鈫?Rich presence detail** you can switch on **rich mode**. When enabled, the plugin pushes smarter, data-driven status lines instead:

| Live fact | Example status |
| --- | --- |
| You just sent a message | 姝ｅ湪鎸囧澶ц偉楸?|
| The agent is thinking | 澶ц偉楸兼鍦ㄦ€濊€?6/195 |
| Total input tokens | 澶ц偉楸兼鍦ㄨ绗旇 38.7M |
| Elapsed LLM thinking time | 澶ц偉楸煎凡缁忔€濊€冧簡 30m46s |

Rich-mode statuses are picked **intelligently and randomly** from the current live facts 鈥?they are not bound to a specific moment 鈥?and **each status stays on screen for at least 8 seconds**. The toggle is persisted at runtime in the `discord-richpresence` settings namespace; there is nothing to configure in the patch for it.

## Privacy

**The plugin never reads your workspace content.** It does not look at session titles, message text, file paths, tool input/output, or any other content. It only reacts to coarse lifecycle signals (`agent/inbox/inserted`, `agent/status`, `agent/pre-step`, `tools/pre-execute`, `session/created`, `workflow/start`) and pushes the configurable status strings (or the rich-mode templates above, filled with scalar facts only 鈥?no content). If you keep the default lists, Discord can only ever see lines like "姝ｅ湪鎸囨尌澶ц偉楸煎共娲?.

## Requirements

- A **Discord desktop client** running locally on the same machine (Rich Presence goes through the local Discord IPC endpoint 鈥?a named pipe on Windows, a unix socket on macOS/Linux, or loopback TCP).

The Discord Application ID is pre-configured in the plugin, so there is nothing to set up 鈥?install and restart, and the status lines appear on your Discord profile automatically.

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
      - 姝ｅ湪鎸囨尌澶ц偉楸煎共娲?      - 姝ｅ湪缁欏ぇ鑲ラ奔鍠?token
    agentWorking:
      - 姝ｅ湪涓庡ぇ鑲ラ奔涓€璧?Brainstorming
      - 姝ｅ湪鍚ぇ鑲ラ奔璁茶В Project
    tools:
      - 姝ｅ湪鎻愪氦鏀瑰姩鎰忚
    forking:
      - 姝ｅ湪鍒涘缓澶ц偉楸艰蹇嗗垏鐗?    idle:
      - 澶ц偉楸煎緟鍛?  randomize: false                        # random instead of rotating
  minIntervalMs: 5000                     # min gap between pushes
  reconnectMs: 15000                      # Discord reconnect poll interval
```

- `statuses` 鈥?each phase is a list; the plugin rotates through it (or picks randomly when `randomize: true`). Add, remove, or reword freely.
- Discord may take a few seconds to reflect a status change; `minIntervalMs` throttles how often the plugin pushes.
- The rich-mode toggle is **not** part of the patch 鈥?it lives in Settings 鈫?General and is persisted at runtime.

## Uninstall

```sh
dsh plugin --profile web remove dsh-discord-richpresence
```

## How it works

- `lib/discord-rpc.js` 鈥?dependency-free Discord Rich Presence client over the local IPC frame protocol (handshake with `client_id`, then `SET_ACTIVITY` frames; ping/pong keepalive; automatic reconnect).
- `lib/index.js` 鈥?the Cordis host plugin. It registers global listeners for the coarse harness events, maps them to the configured status lists (or rich-mode templates), and pushes through the RPC client. Rich mode reads the `discord-richpresence` settings namespace; all timers and the socket are torn down when the plugin fiber unloads.
- `lib/client.js` 鈥?the browser half. Registers the Settings 鈫?General toggle row that writes the `richMode` field of the `discord-richpresence` settings namespace.

## License

MIT
