# dsh-discord-richpresence

> **English**: [README.en.md](README.en.md)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，将你与 dsh 的交互状态**实时**镜像到**本地 Discord 客户端**的 Rich Presence 上——而且只会推送**模糊的、可自定义的状态文案**。

这是一个宿主侧后台插件：无托盘图标、无界面、无窗口。安装后即注入到 dsh 的启动流程中，随 dsh 一起常驻运行。

## 它能做什么

插件监听运行中 dsh 的粗粒度活动信号：

| dsh 信号 | 状态示例（默认） |
| --- | --- |
| 用户消息进入 agent 收件箱 | 正在指挥大肥鱼干活 / 正在给大肥鱼喂 token |
| agent 正在运行（思考 / 流式输出） | 正在与大肥鱼一起 Brainstorming / 正在听大肥鱼讲解 Project |
| 模型工具正在执行 | 正在提交改动意见 |
| 创建了新会话 / 分支（分支对话） | 正在创建大肥鱼记忆切片 |
| 无活动 | 大肥鱼待命 |

上面每一行都是插件配置（`statuses`）中**可直接编辑的列表**。插件只会把这些字符串原样发给 Discord。

## 丰富模式（可选）

默认情况下，插件只推送上面的模糊状态。在**设置 → 通用设置 → Rich Presence 丰富状态**里可以打开**丰富模式**。开启后，插件改为推送更智能、带实时数据的状态行：

| 实时数据 | 状态示例 |
| --- | --- |
| 你刚发送了消息 | 正在指导大肥鱼 |
| agent 正在思考 | 大肥鱼正在思考 6/195 |
| 总输入 tokens | 大肥鱼正在记笔记 38.7M |
| LLM 已思考时长 | 大肥鱼已经思考了 30m46s |

丰富模式的状态是**智能随机**地从当前实时数据中挑选的——并不绑定某个特定时刻——并且**每个状态在 Discord 上至少展示 8 秒**。该开关运行时持久化在 `discord-richpresence` 设置命名空间中，无需在 patch 里配置。

## 隐私

**插件绝不读取你的工作区内容。** 它不会查看会话标题、消息正文、文件路径、工具输入输出或任何其他内容，只响应粗粒度的生命周期信号（`agent/inbox/inserted`、`agent/status`、`agent/pre-step`、`tools/pre-execute`、`session/created`、`workflow/start`），然后推送配置好的状态字符串（或上面那些只填入标量数据的丰富模板——不含任何内容）。即使保持默认列表，Discord 上也只会出现"正在指挥大肥鱼干活"这样的模糊状态。

## 环境要求

- 本机运行着 **Discord 桌面客户端**（Rich Presence 走本地 Discord IPC 端点——Windows 上是命名管道，macOS/Linux 上是 unix socket，或回环 TCP）。

Discord Application ID 已预置在插件中，无需任何配置——安装并重启后，状态就会自动出现在你的 Discord 个人资料上。

## 安装

仓库：<https://github.com/0QwQ0/dsh-discord-richpresence>
发布包：<https://github.com/0QwQ0/dsh-discord-richpresence/releases/latest/download/dsh-discord-richpresence-0.2.1.tgz>

在 dsh 检出目录 / profile 下执行：

```sh
dsh plugin --profile web add https://github.com/0QwQ0/dsh-discord-richpresence/releases/latest/download/dsh-discord-richpresence-0.2.1.tgz
```

如果包已在本地磁盘上（例如本仓库）：

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-discord-richpresence
```

## 配置

所有配置都位于 bundle patch（`cordis.patch.yml`）的 `config` 下：

```yaml
config:
  clientId: '1540732930127691807'         # 已预置，通常无需修改
  details: 'DeepSeek Harness'             # 可选：第二行文字
  largeImage: ''                          # 可选：Discord 大图资产 key
  statuses:                               # 可编辑的状态列表，按阶段分组
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
  randomize: false                        # true 时随机选取，否则轮流
  minIntervalMs: 5000                     # 两次推送之间的最小间隔
  reconnectMs: 15000                      # Discord 断线重连的轮询间隔
```

- `statuses` — 每个阶段都是一个列表；插件按顺序轮流选取（`randomize: true` 时随机）。可以自由增删、改写。
- Discord 反映状态变化可能有几秒延迟；`minIntervalMs` 用于限制推送频率。
- 丰富模式开关**不属于 patch**——它在设置 → 通用设置中，运行时持久化。

## 卸载

```sh
dsh plugin --profile web remove dsh-discord-richpresence
```

### 卸载能恢复到安装前的状态吗？

**基本可以，但有一处已知残留**：

| 项目 | 卸载后的状态 |
| --- | --- |
| `dsh.profile.bundles` 条目 | ✅ 自动移除 |
| `dependencies`（package.json） | ✅ 自动移除 |
| 宿主插件（事件监听、Discord RPC） | ✅ 停止（重启 dsh 后完全退出） |
| 浏览器设置开关（client bundle） | ✅ 移除（刷新页面后消失） |
| `node_modules` 中的链接 | ⚠️ 可能残留一个空 junction（pnpm link 安装时的物理文件，不影响运行，可手动删除） |
| `settings.yaml` 中的 `discord-richpresence:` 段 | ⚠️ **残留**（settings 服务只注销命名空间注册，不删除用户设置文档） |

**唯一需要手动处理的是 `settings.yaml`**。如果希望彻底恢复安装前的状态，编辑 `$DSH_HOME/settings.yaml`，删除这段：

```yaml
discord-richpresence:
  richMode: true
```

删除后该设置不会再影响任何东西（插件已卸载，没有消费者读取它）；留着也无害——重装插件时会重新读取。

## 升级（老版本 → 新版本）

插件同包名覆盖安装即可升级，**不需要先卸载**：

### 从 Release tarball 安装的升级

```sh
dsh plugin --profile web add https://github.com/0QwQ0/dsh-discord-richpresence/releases/latest/download/dsh-discord-richpresence-0.2.1.tgz
```

dsh 会用新 tarball 覆盖旧包并保持 `dsh.profile.bundles` 条目不变。

### 从 link（源码目录）安装的升级

你本机是 `link:` 方式安装（指向插件源码目录）：

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-discord-richpresence
```

升级源码后**重启 dsh** 即可生效（link 指向同一目录，代码即最新版）。

### 升级后需要做什么

1. **重启 dsh**（host 插件在启动时加载）。
2. **刷新浏览器页面**（client bundle 缓存在浏览器，`/plugins/dsh-discord-richpresence/client.js` 会重新拉取，新版设置开关才会出现）。
3. **设置保留**：`settings.yaml` 中的 `discord-richpresence: richMode: <true/false>` 会**跨版本保留**——升级前开启的丰富模式，升级后依然是开启的，无需重新配置。

### 升级遇到问题？

如果升级后开关不回弹但状态异常，或想回到干净状态，可先完整卸载（含手动清理 settings.yaml 残留），再重新安装最新版。

## 工作原理

- `lib/discord-rpc.js` — 零依赖的 Discord Rich Presence 客户端，基于本地 IPC 帧协议（用 `client_id` 握手，然后发送 `SET_ACTIVITY` 帧；含 ping/pong 保活与自动重连）。
- `lib/index.js` — Cordis 宿主插件。注册粗粒度宿主事件的全局监听器，映射到配置好的状态列表（或丰富模式模板），再通过 RPC 客户端推送。丰富模式读取 `discord-richpresence` 设置命名空间；插件纤维卸载时会清理所有定时器并关闭 socket。
- `lib/client.js` — 浏览器半部。注册设置 → 通用设置里的切换行，写入 `discord-richpresence` 设置命名空间的 `richMode` 字段。

## 许可证

MIT
