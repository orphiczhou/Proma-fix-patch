# 0.15.7 基线对照

新版升级时，对照此基线判断变化幅度。

## 文件级
| 项 | 0.14.23 | 0.15.7 |
|---|---|---|
| main.cjs 字节 | 26,912,114 | 28,338,250 |
| main.cjs 行数 | — | 634,108（orig）/ 634,153（patched，+45） |
| patched 字节 | — | 28,341,619（含跨内核 D 补丁；仅 A/B/C 为 28,340,636） |
| 是否 minify | 否 | 否（esbuild，函数名保留） |
| app.asar 字节 | — | 216,774,360 |
| portable zip | 382MB | 405MB（424,900,324 字节，22928 条目） |

## 9 锚点行号（0.15.7 patched）
> 行号是 patched（注入补丁后）的值。反推 orig 行号需减注入偏移（B1 +37 等），但 esbuild 排版可能导致个位数偏差——**orig 侦察以 grep 函数名/匹配串为准，行号仅辅助**。
- A1 .proma-dev→pro：行 94 / 98 / 103（getConfigDirName）
- A2 setPath：行 633944-633945
- B1 注入函数：行 439347-439383（+37 行）
- B2 getAvailableAgentModels：行 467956-467973
- B3a effectiveModelId：行 468013-468020
- B3b createAgentSession：行 468022
- B3c record.channelId：行 468039
- B3d runHeadless channelId：行 468063
- C trayIcon：行 631997

## 探测到的变量名（0.15.7）
- setPath 行：`import_electron49` / `import_path11`
- trayIcon 行：`import_path10`

## 关键标识符（0.15.7）
- `isPro\b`：**0 匹配**（不存在 isPro；别被 isProblematic 等噪声骗）
- `Proma.exe` ProductVersion：`0.15.7.0`
- package.json name：`@proma/electron`，main：`dist/main.cjs`
- 原生模块：`@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node`（27,294,720 字节）

## 依赖版本（0.15.7 package.json）
- `@anthropic-ai/claude-agent-sdk` 0.3.201
- `@earendil-works/pi-*` 0.80.9
- `@modelcontextprotocol/sdk` ^1.29.0

## 官方 0.15.7 新机制
- `getConfigDirName()` 新增 `process.env.PROMA_DEV === "1"` 分支（行 93）：为 true 时强制走 `.proma-dev`（被补丁 A1 全局改成 `.proma-pro`，兼容不冲突）。
- createAgentSession 定义新增第5参 `agentRuntime = "pi"`（行 439510）：startDelegation 调用处传 `parent?.agentRuntime ?? "claude"`。

## patch 后验证期望
- `listEnabledAgentModelsAcrossChannels` ≥ 2（1 定义 + 1 调用）
- `resolveChannelForAgentModel` ≥ 2（1 定义 + 1 调用）
- `effectiveChannelId` = 4（1 定义 + 3 使用）
- `.proma-pro` = 3，`.proma-dev` 残留 = 0
- `electron-pro` = 1，`electron-dev` 残留 = 0
- `proma-emerald.png` = 1
