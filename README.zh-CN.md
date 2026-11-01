<div align="center">

# Antigravity Sidebar Auto Accept

**为 VS Code 官方 Antigravity 侧栏自动接受命令审批。**

适配最新已验证的 Antigravity VS Code 扩展。

[![MIT](https://img.shields.io/badge/license-MIT-2563eb.svg)](LICENSE)
[![Antigravity](https://img.shields.io/badge/Antigravity-1.10.0%20tested-16a34a.svg)](#兼容性)
[![Remote SSH](https://img.shields.io/badge/Remote%20SSH-Linux-0f766e.svg)](#兼容性)

[English](README.md) · **简体中文**

[快速开始](#快速开始) · [主要功能](#主要功能) · [工作原理](#工作原理) · [配置](#配置) · [排错](#排错) · [开发](#开发)

</div>

---

让 Antigravity 持续工作，减少重复点击。插件识别 **VS Code 官方侧栏**中的命令权限卡片，提交 **Allow Once（仅允许一次）**，再核对后端是否记录了授权。

插件运行在 Linux Remote SSH 服务器，Mac、Windows 客户端可以共用同一套部署。不需要调试端口、桌面点击器或全局 Turbo。

## 快速开始

1. 用 **VS Code Remote SSH** 连接 Linux 服务器。
2. 安装 Google 官方 **Antigravity** 扩展，并打开侧栏。
3. 将本插件安装到 **SSH 远程扩展宿主**。使用 VSIX 时，运行 **Extensions: Install from VSIX...** 并选择安装包。
4. 在可信工作区设置中启用 **Antigravity Sidebar Auto Accept**，或添加：

   ```json
   {
     "antigravitySidebarAutoAccept.enabled": true
   }
   ```

5. 底部应显示 **`AG Sidebar: ON (0)`**。后端确认授权后数字增加，点击状态栏可暂停或恢复。

更新后，请等任务结束再执行 **Developer: Reload Window**。可从 [GitHub Releases](https://github.com/PawnDragon/antigravity-sidebar-autoaccept/releases) 下载 VSIX，也可以[从源码构建](#开发)。Marketplace 流程见[发布指南](docs/PUBLISHING.md)。

## 主要功能

- **官方 VS Code 侧栏适配**：处理 Allow、Submit 背后的命令权限请求。
- **Remote SSH**：由 Linux 宿主执行，桌面客户端可用 macOS 或 Windows。
- **限定工作区**：只处理目录与本窗口匹配的运行中会话。
- **单次授权**：发送 Allow Once，不添加永久权限。
- **展示实际结果**：区分已提交和后端已确认的授权。
- **长会话支持**：请求精简响应，跳过已完成历史。
- **保持简单**：一个开关，无额外面板，无运行时依赖。

## 工作原理

```text
当前 VS Code 窗口
        ↓
SSH 主机上属于此窗口的官方 Antigravity 后端
        ↓
当前工作区的命令权限卡片
        ↓
重新检查请求 → Allow Once → 核对后端授权记录
```

一些插件循环调用旧版命令，而已验证的官方 VS Code 扩展没有注册这些审批命令。本插件改用侧栏自身提交审批时使用的结构化请求。

`SUBMITTED` 表示后端接收了提交；`VERIFIED` 表示步骤完成记录中出现了对应单次授权。状态栏统计已核验授权数，不代表命令成功数。

### 仍需手动处理

当前只处理**默认策略触发的命令请求**，以下内容保留手动处理：

- 明确 Ask 规则、Hook 审批、被阻止或未知类型的请求。
- 普通提问、计划审阅、MCP 权限和浏览器权限卡片。
- 当前工作区之外的会话。

符合条件的命令会自动执行，其中可能包括能操作项目外文件的命令。请仅在希望自动执行的工作区启用。

## 兼容性

| 组件 | 支持范围 |
| --- | --- |
| 官方扩展 | `google.google-antigravity` 1.10.0，2026-11-01 验证 |
| VS Code | 1.90 及以上 |
| 扩展宿主 | Linux Remote SSH；本地 Linux 使用同一发现机制 |
| 桌面客户端 | 连接该主机的 macOS、Windows 或 Linux |
| 本地 Windows/macOS 宿主 | 此版本未实现 |
| 独立 Antigravity IDE | 非本插件目标 |

插件使用内部接口，上游更新后可能需要再次适配。上表列出已验证版本，不保证所有未来版本均适用。

## 配置

| 设置 | 默认值 | 用途 |
| --- | --- | --- |
| `antigravitySidebarAutoAccept.enabled` | `false` | 在当前工作区启用。 |
| `antigravitySidebarAutoAccept.intervalMs` | `1000` | 扫描间隔，最低 500 毫秒。 |

### 命令

打开命令面板并搜索：

- **Antigravity Sidebar Auto Accept: Toggle ON/OFF**：开关。
- **Antigravity Sidebar Auto Accept: Show Logs**：查看日志。
- **Antigravity Sidebar Auto Accept: Check Connection**：检查连接。

### 状态

| 状态 | 含义 |
| --- | --- |
| `OFF` | 不再提交新的授权。 |
| `CONNECTING` / `WAITING` | 等待后端启动，或需要在本窗口打开侧栏。 |
| `ON (N)` | 正在扫描，N 为本次实例启动后核验的授权数。 |
| `ERROR` | 连接或协议异常，需要查看日志。 |

## 隐私

请求仅发往 `127.0.0.1` 上已有的 Antigravity 后端。插件不启动网络监听，不收集遥测，不记录命令正文、完整对话或认证 token，也不修改全局权限。

发现 Ezra Auto Accept 时，适配版会尝试停止它在本窗口中的旧轮询。替换使用时请关闭原插件的自动启动设置。

## 排错

| 现象 | 检查方式 |
| --- | --- |
| `WAITING` | 打开本窗口侧栏，确认两个扩展均安装在 SSH 宿主。 |
| `ON` 但仍有卡片 | 问题、非命令权限、明确 Ask 和 Hook 审批仍需手动处理。 |
| `ERROR` | 运行 **Show Logs**，检查最后一条错误。 |
| 旧版 `response too large` | 更新至 0.1.1 或以上，并重载窗口。 |
| 更新后仍像旧版 | 当前任务结束后执行 **Developer: Reload Window**。 |
| 只有 `SUBMITTED` | 手动检查卡片，插件不会盲目重试结果不明的授权。 |

反馈时请提供两个扩展版本、宿主系统及相关日志行。不要附上 token、私有命令或完整对话。

## 开发

使用 Node.js 22 或以上：

```sh
npm ci
npm run check
npm test
npm run package
```

生成 `dist/antigravity-sidebar-autoaccept.vsix`。`vsce` 仅用于开发打包，安装后无运行时依赖。

不使用 npm 时，可用 `python3 package.py` 本地打包。仅检查连接、不审批：

```sh
node probe.js <extension-host-pid> /path/to/workspace
```

```text
.
├── core.js                 # 后端发现和审批流程
├── extension.js            # 生命周期、命令和状态栏
├── test/                   # 协议及回归测试
├── docs/                   # 发布和验证说明
├── .github/workflows/      # CI 和发布流程
├── README.md
└── README.zh-CN.md
```

范围见[验证说明](docs/TESTING.md)，发布步骤见[发布指南](docs/PUBLISHING.md)。

## 许可证与致谢

[MIT](LICENSE)。状态栏交互改编自 [Ezra Auto Accept 1.2.0](https://marketplace.visualstudio.com/items?itemName=Ezra.auto-accept)，保留原始版权。本项目新增侧栏协议适配器和测试。

独立社区扩展，与 Google、Microsoft 无隶属或背书关系。
