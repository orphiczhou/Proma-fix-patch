# 补丁锚点详解（patch-main.cjs 的 10 个改动点）

每个锚点列出：匹配特征、替换逻辑、0.19.53 验证状态、变化时的应对。对照此文件做侦察（阶段3）和审计（阶段5）。

> **行号说明**：行号基于各版本基线（见 `version-baseline-*.md`）。侦察时以 grep 函数名/匹配串为准，行号仅辅助定位。

## A. Pro 数据隔离

### A1. `.proma-dev` → `.proma-pro`（全替换 3 处）
- **位置**：`getConfigDirName()` 的 3 个分支（PROMA_DEV 分支、isPackaged 三元、mode 标签判定）。
- **替换**：全局 `.proma-dev` → `.proma-pro`。
- **0.19.53**：3 处，结构未变。✅
- **应对变化**：grep `.proma-dev` 计数应 >=3。若官方重构了 getConfigDirName，确认 3 处都改到。

### A2. userData setPath 隔离 + electron-pro（0.19.53 多实例结构）
- **匹配**（0.19.53 起为 5 行块）：
  `if (!EL.app.isPackaged) {` + `const instance = process.env.PROMA_DEV_INSTANCE?.replace(...)` + `if (instance) EL.app.setName(...)` + `EL.app.setPath("userData", join(..., instance ? \`@proma/electron-dev-${instance}\` : "@proma/electron-dev"))` + `}`
- **替换**：条件加 `|| process.env.PROMA_DEV === "1"`，`electron-dev` → `electron-pro`（普通路径与 instance 模板串共 2 处）。
- **变量名**：`import_electronN` / `import_pathN` 由正则自动探测。
- **0.19.53**：✅（0.15.7 为单行旧结构，脚本已适配新结构）。
- **应对变化**：若 setPath 逻辑再重构，确认条件 + 两处路径都改到；最终 `electron-pro` 全文 2 处、`electron-dev` 0 残留。

## B. 跨渠道子会话

### B1. 注入两个新函数
- **插入点**：`var init_agent_model_selection = __esm({` 前。
- **新增**：`listEnabledAgentModelsAcrossChannels()`（遍历所有启用渠道的启用模型）+ `resolveChannelForAgentModel(input)`（按 modelId/channelId 反查渠道）。
- **依赖**：`listChannels()` / `getChannelById()`（bundle 顶层 function 声明，插入点可见——函数提升）。
- **0.19.53**：插入点在；listChannels（行 36684）/getChannelById（行 36709）仍为顶层声明。✅
- **应对变化**：若 `init_agent_model_selection` 改名，找等价 __esm 块；确认 listChannels/getChannelById 仍顶层声明（否则改注入位置）。

### B2. getAvailableAgentModels 改跨渠道
- **匹配**：整个 `function getAvailableAgentModels(ctx) {...}`（用 listEnabledAgentModelsForChannel 的原版）。
- **替换**：改用 `listEnabledAgentModelsAcrossChannels()`，返回 models[] 含 channelId/channelName/provider，加 currentChannelId/channelCount。
- **0.19.53**：函数体与 0.15.7 逐字一致（once 单处匹配通过）。✅
- **应对变化**：若参数名 ctx 变，更新匹配串；字段名对齐 channel/model 结构（id/name/source/enabled）。

### B3a. startDelegation effectiveModelId 解析
- **匹配**（跨多行）：`const effectiveModelId = args.modelId !== void 0 ? assertEnabledModelForChannel({\n    channelId: ctx.channelId, ...}) : ctx.modelId?.trim()`
- **替换**：改用 `resolveChannelForAgentModel`，引入 `effectiveChannelId` + `effectiveModelId`。
- **0.19.53**：结构一致。✅
- **侦察提示**：用单行特征串 `effectiveModelId = args.modelId !== void 0` 定位（唯一），再读后续几行确认完整匹配块。

### B3b. createAgentSession 调用改 effectiveChannelId（0.19.53 适配）
- **匹配**：`const child2 = createAgentSession(title, ctx.channelId, ctx.workspaceId, effectiveModelId);`
- **替换**：`ctx.channelId` → `effectiveChannelId`。
- **0.19.53**：✅ 官方 0.19.53 把 0.15.7 的第 5 参 `agentRuntime` 移除（Claude runtime 退役），delegation 调用回到 4 参，局部变量 child → child2。
- **应对变化**：若 createAgentSession 签名再变（如恢复第 5 参），更新匹配+替换串（只把 channelId 那个参数改 effectiveChannelId，其余参数原样保留）。

### B3c. record2.channelId
- **匹配**：record2 对象的 `childSessionId: child2.id,\n    channelId: ctx.channelId,\n    modelId: effectiveModelId,`。
- **替换**：`ctx.channelId` → `effectiveChannelId`。
- **0.19.53**：✅（child2）

### B3d. runRegisteredHeadlessAgent input.channelId
- **匹配**：input 对象的 `userMessage: prompt,\n      channelId: ctx.channelId,\n      modelId: effectiveModelId,`（6 空格缩进）。
- **替换**：`ctx.channelId` → `effectiveChannelId`。
- **0.19.53**：✅（input 顺序未变，后面新增了 workspaceId/startedAt 字段，不影响三行匹配）

## C. 绿图标

### C. getTrayIconPath 改 proma-emerald.png
- **匹配**：`join(resourcesDir, "iconTemplate.png")`。
- **替换**：`iconTemplate.png` → `proma-emerald.png`。
- **0.19.53**：✅ import_path9；母本 `resources/proma-logos/proma-emerald.png` 自带。
- **资源确认**：若新版母本缺该 png，从 assets/ 复制过去。

## E. GPT-5.6 家族 1M 上下文（0.19.53 新增）

### E1. inferCodexAlignedGPT5ContextWindow 前缀匹配 + 1e6
- **背景**：官方 switch 只精确匹配 `gpt-5.6-sol/terra/luna`（无尾缀）→ 372k；渠道里的池化变体（gpt-5.6-terra-1、gpt-5.6-sol-az 等）不命中 → 落 DEFAULT 200k。OpenAI 官方规格 1,050,000 token（AWS Bedrock 亦确认 1M）。
- **匹配**：`const model = modelId?.toLowerCase().replace(/\[1m\]$/i, "");\n  switch (model) {`
- **替换**：两行之间插入 `if (model !== void 0 && /^gpt-5\.6(?:-[a-z0-9]+)*$/.test(model)) return 1e6;`
- **0.19.53**：✅
- **优先级链**：`configuredContextWindow（官方渠道后端下发） ?? codexAligned（本补丁） ?? Math.max(catalog, 规则表推断)` —— E1 在 codexAligned 层生效，优先于 catalog 的 272k；后端下发仍最高（官方如果下发更大值不冲突）。
- **不动的模型**：gpt-5.4/5.5（272k）、gpt-5.4-mini（400k）、gpt-6-astra（372k）维持官方推断；MiniMax-M2.7 真实即 200k；gemini-2.5-pro 官方 catalog 已 1M；glm-5.2/5.3、claude、deepseek、kimi-k3、minimax-m3、qwen、gemini-3.x 官方已原生 1M。
- **验证期望**：`return 1e6` 注入行 = 1。

## D. 跨内核子会话（已作废，仅存档）

0.15.7 曾加 D1-D7（delegate_agent 的 agentRuntime 参数、pi runtime 分支）。**0.19.53 官方已退役 Claude runtime**（migrateRetiredClaudeRuntime 删除 agentRuntime 字段，settings/automation 全部剥离），全部会话统一 Pi runtime，跨内核无补丁意义。若未来官方恢复多 runtime，参考 git 历史找回 D 组匹配串。

## 部署阶段新增（0.19.53，非 main.cjs 补丁）

- **icon.ico 补齐**：0.19.53 运行时会找 `<resources>/app/dist/resources/icon.ico`（getIconPath，__dirname 相对）与 `<resources>/icon.ico`（主窗口），母本均无（官方 asar 版同样缺失，无害告警）。部署时复制 green.ico 到两个位置，消除告警并统一绿图标。
- **禁用自动更新**：`resources/app-update.yml` 的 `url` 改为 `https://127.0.0.1/proma-pro-auto-update-disabled/`。否则更新器空闲时自动安装官方新版，整个 patch 会被覆盖。验证：启动 log 出现 `[更新-updater] Error: net::ERR_CONNECTION_REFUSED`。

## 副作用检查清单（审计阶段）

- [ ] diff orig vs patched，改动集合恰好 10 锚点（无多余无遗漏）。
- [ ] `effectiveChannelId` 全文计数 = 1 定义 + 3 使用（B3b/c/d）= 4。
- [ ] `createAgentSession` 其他调用点（`createAgentSession(title, channelId` 形式约 3 处 + 无 title 形式若干）**保持原语义**——只 startDelegation 这处跨渠道。
- [ ] `getAvailableAgentModels` 被注册为 MCP 工具 `list_available_agent_models`（renderer/agent 可达）。
- [ ] 注入函数无重名（listEnabledAgentModelsAcrossChannels / resolveChannelForAgentModel 各 1 处定义）。
- [ ] `\uXXXX` 转义无损（node --check 通过，注入中文抽样解码正确）。
- [ ] 原有 `assertEnabledModelForChannel` 仍被其他流程调用（未破坏）；`listEnabledAgentModelsForChannel` 沦为死代码（无害）。
- [ ] E1 正则只匹配 gpt-5.6 家族（不误伤 gpt-5.4/5.5/gpt-6-astra）。
