# 0.19.53 基线对照

新版升级时，对照此基线判断变化幅度。

## 文件级
| 项 | 0.15.7 | 0.19.53 |
|---|---|---|
| main.cjs 字节（orig） | 28,338,250 | 31,247,272 |
| main.cjs 行数（orig） | 634,108 | 686,915 |
| patched 字节 | 28,341,619 | 31,249,737（10 补丁点：A1-A2 / B1-B3d / C / E1） |
| 是否 minify | 否 | 否（esbuild，函数名保留） |
| app.asar 字节 | 216,774,360 | 175,490,324（更紧凑） |
| portable zip | 405MB | 323MB（323,147,647 字节） |
| 安装包来源 | 官网 setup.exe | `%LOCALAPPDATA%\@promaelectron-updater\pending\Proma-0.19.53-setup.exe`（更新器已下载，7za 可直接解出完整应用目录，无需运行安装器） |

## 0.19.53 官方架构变化（影响补丁面）

- **Claude runtime 整体退役**：`migrateRetiredClaudeRuntime` 把历史 claude 会话标记为 legacyTranscript 并删除 agentRuntime；settings/automation 的 agentRuntime 全部按 legacy 剥离。全部会话统一 Pi runtime → **D 组（跨内核）补丁永久作废**。
- `createAgentSession(title, channelId, workspaceId, modelId, agentCwdMode, sessionWorkbenchLayout, isDraft)`：第 5 参从 agentRuntime（0.15.7）改为 agentCwdMode，delegation 调用处只传 4 参，局部变量 `child` → `child2`。
- `resolveDelegationPermissionMode` 回到 2 参（0.15.7 的第 3 参 agentRuntime 移除）。
- setPath userData 块新增 `PROMA_DEV_INSTANCE` 多实例支持（setName + `@proma/electron-dev-${instance}` 模板串）。
- 官方 1M 上下文规则表扩容：glm-5.3/glm-5.3-flash/glm-5.2、claude-opus-5、deepseek-v4 全系、kimi-k3、minimax-m3、qwen 全系已原生 1M（0.14.23 的表里 glm 只有 5.2）。
- pi catalog 数据在 asar 内 `node_modules/@earendil-works/pi-ai/dist/providers/data/*.json`；gemini-2.5-pro cw=1048576、glm-5.3 cw=1000000、MiniMax-M2.7 cw=204800（真实规格）。

## 补丁锚点行号（0.19.53 patched）
> 行号仅辅助，侦察以 grep 匹配串为准。
- A1 .proma-dev→pro：getConfigDirName 内 3 处（约行 94/98/103 区段）
- A2 setPath：约行 686310-686315（含 PROMA_DEV_INSTANCE 三行块）
- B1 注入函数：`var init_agent_model_selection = __esm({` 前（约行 439,000 区段）
- B2 getAvailableAgentModels：约行 593,790-593,811
- B3a effectiveModelId：约行 593,848-593,853
- B3b createAgentSession：约行 593,854（child2，4 参）
- B3c record2.channelId：约行 593,868-593,870
- B3d runHeadless channelId：约行 593,894-593,896
- C trayIcon：import_path9
- E1 gpt-5.6 1M：inferCodexAlignedGPT5ContextWindow 内（约行 2,750 区段）

## 探测到的变量名（0.19.53）
- setPath 行：`import_electron59` / `import_path10`
- trayIcon 行：`import_path9`

## patch 后验证期望（0.19.53）
- `listEnabledAgentModelsAcrossChannels` = 2（1 定义 + 1 调用）
- `resolveChannelForAgentModel` = 2（1 定义 + 1 调用）
- `effectiveChannelId` = 4（1 定义 + 3 使用）
- `.proma-pro` = 3，`.proma-dev` 残留 = 0
- `electron-pro` = 2（普通路径 + instance 模板串），`electron-dev` 残留 = 0
- `proma-emerald.png` = 1
- `/^gpt-5\.6(?:-[a-z0-9]+)*$/.test(model)) return 1e6` = 1
- `deepseek: ["deepseek-"]` = 1、`glm: ["glm-"]` = 1（E2 全模型 1M）

## 部署后验证（0.19.53 实测）
- 启动 log：`[配置] 配置目录: ~/.proma-pro/（开发模式）`
- Cloud Auth 同机继承（无需重登录），渠道配置自动迁移
- 托盘图标 emerald；无 "App icon not found" 告警（需补 icon.ico，见 SKILL.md 阶段 6）
- 更新器断源后 log：`[更新-updater] Error: net::ERR_CONNECTION_REFUSED`
