# 0.21.92 基线对照（2026-11-09 重打）

新版升级时，对照此基线判断变化幅度。0.21.92 是**官方更新器当前最新版**（`latest.yml` releaseDate 2026-11-04）；GitHub releases 只更新到 0.19.58，不要用 GitHub 判断最新版。

## 文件级

| 项 | 0.19.53 | 0.21.92 |
|---|---|---|
| main.cjs 字节（orig） | 31,247,272 | 19,281,536 |
| main.cjs 行数（orig） | 686,915 | 423,262 |
| patched 字节 | 31,249,737 | 19,283,911 |
| patched 行数 | — | 423,308（+46 行） |
| 是否 minify | 否 | 否（esbuild，函数名保留） |
| app.asar 字节 | 175,490,324 | 171,109,794 |
| 安装后目录 | ~800MB | 726MB（as 副本，含 app.asar + unpacked） |
| portable zip | 323,147,647 | 312,290,375（~298MB） |
| 母本来源 | 更新器 pending/setup.exe（7za 解包） | **已安装的 `D:\Proma`（0.21.92）robocopy 复制**；更新器缓存 `%LOCALAPPDATA%\@promaelectron-updater\installer.exe` 同为 0.21.92，可作 7za 备用 |

## 0.21.92 官方架构变化（影响补丁面）

- **`getAvailableAgentModels` 只是文案变化**：返回值结构不变，但 `note` 与工具描述改成"当前父会话渠道 / 仅在用户明确要求不同模型时"。整函数逐字匹配会失配 → B2 改用区间替换（从 `function getAvailableAgentModels(ctx) {` 到 `function stopDelegation(`）。
- **`launchDelegation` 不再在 `runRegisteredHeadlessAgent` 调用处重复传 channelId**：改为读 `record3.channelId / record3.modelId`。因此 0.19.53 的 **B3d 锚点消失**，只要保证 B3c 把 `record3.channelId` 写成 `effectiveChannelId` 即可（少 1 个改动点）。
- **`inferCodexAlignedGPT5ContextWindow` 前置分支变多**：新增 `isGpt61SolFamily`（返回 void 0）、`isGpt6AstraFamily` / `isGpt6SolFamily` / `gpt-6-luna`（372k）。E1 锚点从 `const model = …` + `switch (model)` 改为 `function inferCodexAlignedGPT5ContextWindow(modelId) {` + `const model = …` 两行，在 `isGpt61SolFamily` 之前插入 gpt-5.6 前缀判定。
- **1M 规则表扩容**：`glm: ["glm-5.3", "glm-5.3-flash", "glm-5.3-flashx", "glm-5.2"]`（新增 flashx）；deepseek 仍是 `["deepseek-v4", "deepseek-flash"]`。E2b 匹配串要同步成新的 glm 列表。
- **新增 `getEnabledAgentModelSource(channel)`**：官方渠道（`PROMA_OFFICIAL_CHANNEL_ID`）走 `channel.agentModels ?? channel.models`，其他渠道走 `channel.models`。注入的跨渠道函数改用该 helper，避免官方渠道模型集合取错。
- **`opencode-go-openai` 渠道被官方停用**：`buildModel` 直接 `throw "OpenCode Go 渠道已停用，请选择其他渠道"`，全文件再无 opencode 相关 compat 分支。**第五块改造（GLM-5.3 在 opencode-go 上的 zai 字段 400 修复）因此永久作废**，不需要重打；用户本机渠道列表也已无该 provider。
- `createAgentSession(title, channelId, workspaceId, modelId, agentCwdMode, sessionWorkbenchLayout, isDraft)` 7 参不变；delegation 调用处仍是 4 参、局部变量仍叫 `child2`。
- `getConfigDirName()` 结构与 0.19.53 一致（`PROMA_DEV === "1"` 分支 + isPackaged 三元 + mode 标签），A1 仍是 3 处全替换。
- setPath userData 块与 0.19.53 完全一致（`PROMA_DEV_INSTANCE` 三行块），A2 原样可用。

## 探测到的变量名（0.21.92）

- setPath 行：`import_electron55` / `import_path9`
- trayIcon 行：`import_path8`

## 补丁锚点行号（0.21.92 orig / patched）
> 行号仅辅助，侦察以 grep 匹配串为准。

- A1 `.proma-dev` 3 处：`getConfigDirName()` 内（orig 约 4083/4087/4092）
- A2 setPath：orig 约 422689（patched 422730 区段）
- B1 注入函数：`var init_agent_model_selection = __esm({` 前（orig 17158 / patched 17196）
- B2 getAvailableAgentModels：orig 194762，到 `function stopDelegation(` 结束
- B3a effectiveModelId：orig 约 194818
- B3b createAgentSession：orig 194823（4 参，child2）
- B3c record.channelId：orig 约 194843
- C trayIcon：orig 420667（`import_path8`）
- E1 gpt-5.6 1M：orig 2430（`inferCodexAlignedGPT5ContextWindow`）
- E2a/E2b 规则表：orig 2505 / 2507

## patch 后验证期望（0.21.92，实测）

- `listEnabledAgentModelsAcrossChannels` = 2（1 定义 + 1 调用）
- `resolveChannelForAgentModel` = 2（1 定义 + 1 调用）
- `effectiveChannelId` = **3**（1 定义 + 2 使用：createAgentSession / record.channelId；B3d 已移除）
- `.proma-pro` = 3，`.proma-dev` 残留 = 0
- `electron-pro` = 2，`electron-dev` 残留 = 0
- `proma-emerald.png` = 1
- `/^gpt-5\.6(?:-[a-z0-9]+)*$/.test(model)) return 1e6` = 1
- `deepseek: ["deepseek-"]` = 1、`glm: ["glm-"]` = 1
- `node --check` 通过；diff orig vs patched 恰好 10 hunks（A1/A2/B1/B2/B2b/B3a/B3b/B3c/C/E1/E2a+E2b 合并为同一 hunk）

## 部署后验证（0.21.92 实测，2026-11-09）

- 部署目录：`D:\Proma-Pro`（0.21.92；桌面「Proma Pro」快捷方式指此；便携包 `D:\PromaPro-portable-0.21.92.zip`）。换位记录：原 `D:\Proma-Pro` 的 0.14.23 已改名 `D:\Proma-Pro-0.14.23`，原 `D:\Proma-Pro-0.21.92` 顶替为 `D:\Proma-Pro`（改名前的约束：先关应用，并关掉 cwd 在该目录的终端，否则报 Device or resource busy）
- 升级前数据备份：`D:\proma-pro-data-backup-0.21.92`（329MB 全量）+ `~/.proma-pro/.bak-pre-0.21.92/`（关键 json）
- 启动后 `%APPDATA%\@proma\electron-pro` 与 `~/.proma-pro` 均在 10 分钟内被写入 → PROMA_DEV=1 隔离生效，181 条历史会话与渠道/登录态同机继承
- exe 内嵌图标为绿色（408,142 字节 green.ico，7 档尺寸），版本号 0.21.92
- **跨渠道子会话实测**：父会话 GLM（`zhipu-coding`, glm-5.3）；`delegate_agent(modelId="deepseek-flash")` 派出的子会话 metadata 为 `channelId=deepseek 渠道, modelId=deepseek-flash`，子会话落盘 `_channelProvider: "deepseek"` 并回复「跨渠道 OK」，UI 显示 `DeepSeek · deepseek-flash`
- `list_available_agent_models` 实测返回 7 个模型 / 3 个渠道（GLM、DeepSeek、小米 MiMo），含补丁后的 note 文案与 `channelCount`
- 该次验证用的两个测试会话已用 `electronAPI.deleteAgentSession` 清理，未污染用户历史

## 复现要点（与 0.19.53 不同的地方）

1. 母本可直接 robocopy 已安装的 `D:\Proma`（运行中的 Electron 目录可读复制，736 文件 0 失败），比 7za 解 setup 更省事；官方版本号用 `node read-asar.cjs <asar> package.json` 确认。
2. `extract-asar.cjs` 解 12,670 个文件约 25 秒；`merge-unpacked.cjs` 合并 382 文件，skia 仍为 27,294,720 字节。
3. rcedit v5 只导出 `exports`，用绝对路径 `require('…/node_modules/rcedit')` 会 MODULE_NOT_FOUND；要么在本地 `npm i rcedit`，要么 `module.paths.push(globalNodeModules)` 后按包名 require。
4. 部署后可用 `--remote-debugging-port=<port>` 起 App 做渲染层验证（`window.electronAPI` 有 429 个 IPC 方法，含 `listChannels` / `deleteAgentSession`）；验证完要关掉该实例再正常重启，避免留下调试端口。

## 常见误判与排障（2026-11-09）

- **“glm-5.3 还是 200k”**：九成是启动的实例不对。0.14.23 的规则表只有 `glm: ["glm-5.2"]`；先看 `Get-Process PromaPro | % Path` 与快捷方式 `TargetPath`，再看该目录 `package.json` 版本与 main.cjs 的 `glm:` 规则。多个 Pro 目录共用 `~/.proma-pro` 与 `@proma/electron-pro`（同一个单实例锁），数据目录无法区分版本。
- **1M 判定链（可复现）**：pi catalog `zai-coding-cn.json` 的 `chat:glm-5.3` → `contextWindow: 1000000`；渠道 models 无 `contextWindow`、会话 meta 无 `modelContextWindow`（只对官方模型写入）→ `configuredContextWindow` 为空 → `Math.max(catalog 1e6, inferred 1e6)` = 1M。`scripts/verify-context-window.cjs` 实测 16/16 PASS（orig 对照 6 FAIL）。
- **UI 看不到分母**：0.21.92 没有常驻上下文显示，模型 chip tooltip 只有「渠道：X」；`window.electronAPI` 的 429 个 IPC 里也没有暴露 contextWindow（只有流事件 `usage_update` 携带）。别把“界面上没写 1M”当成补丁没生效。
- **目录换位**：改名/换位前先关应用，并关掉 cwd 在该目录的终端（否则 `Device or resource busy`）。换位后校验 main.cjs md5、`.proma-dev` 残留、两处 icon.ico 408,142 字节、`app-update.yml` 断源。
- **RDP 断开/锁屏**：PowerShell `CopyFromScreen` 报 `The handle is invalid`，截图改用 CDP `Page.captureScreenshot`。
