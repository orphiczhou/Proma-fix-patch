# 补丁锚点详解（patch-main.cjs 的改动点）

每个锚点列出：匹配特征、替换逻辑、验证状态（0.21.92 当前基线 / 0.19.53 历史基线）、变化时的应对。对照此文件做侦察（阶段3）和审计（阶段5）。

**改动点数量随官方架构变化**：0.19.53 为 12 个（A1/A2/B1/B2/B3a-d/C/E1/E2a/E2b）；0.21.92 为 **11 个**——B3d 因官方改结构而消失（见下文 B3d 说明）。

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
- **模型集合取值（0.21.92 起）**：必须用 `getEnabledAgentModelSource(channel)`，不要直接 `channel.models`。官方 0.21.92 新增该 helper：官方渠道（`PROMA_OFFICIAL_CHANNEL_ID`）返回 `channel.agentModels ?? channel.models`，其余渠道返回 `channel.models`。
- **0.19.53**：插入点在；listChannels（行 36684）/getChannelById（行 36709）仍为顶层声明。✅
- **0.21.92**：插入点在（orig 17158）；`getEnabledAgentModelSource` 定义在同一模块上方。✅
- **应对变化**：若 `init_agent_model_selection` 改名，找等价 __esm 块；确认 listChannels/getChannelById 仍顶层声明（否则改注入位置）。

### B2. getAvailableAgentModels 改跨渠道
- **匹配**：整个 `function getAvailableAgentModels(ctx) {...}`。
- **替换**：改用 `listEnabledAgentModelsAcrossChannels()`，返回 models[] 含 channelId/channelName/provider，加 currentChannelId/channelCount。
- **0.19.53**：函数体与 0.15.7 逐字一致（once 单处匹配通过）。✅
- **0.21.92**：官方只改了 `note` 文案，整函数文本匹配会 0 命中 → **改为区间替换**：起点 `function getAvailableAgentModels(ctx) {`，终点 `function stopDelegation(parentSessionId, delegationId) {`，把区间整体换成本补丁版本。起点/终点各需唯一。✅
- **B2b（0.21.92 新增）**：同步改 MCP 工具描述 `列出当前父会话渠道下已启用、可用于协作子 Agent 的模型。` → `列出所有已启用渠道中可用于协作子 Agent 的模型（可跨渠道选择 modelId）。`，否则模型看不到跨渠道能力。
- **应对变化**：若区间终点函数改名，换一个紧随其后的唯一函数声明作终点；字段名对齐 channel/model 结构（id/name/source/enabled）。

### B3a. startDelegation effectiveModelId 解析
- **匹配**（跨多行）：`const effectiveModelId = args.modelId !== void 0 ? assertEnabledModelForChannel({\n    channelId: ctx.channelId, ...}) : ctx.modelId?.trim()`
- **替换**：改用 `resolveChannelForAgentModel`，引入 `effectiveChannelId` + `effectiveModelId`。
- **0.19.53**：结构一致。✅
- **0.21.92**：逐字一致，未改。✅
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

### B3d. runRegisteredHeadlessAgent input.channelId（0.21.92 已作废）
- **匹配**：input 对象的 `userMessage: prompt,\n      channelId: ctx.channelId,\n      modelId: effectiveModelId,`（6 空格缩进）。
- **替换**：`ctx.channelId` → `effectiveChannelId`。
- **0.19.53**：✅（input 顺序未变，后面新增了 workspaceId/startedAt 字段，不影响三行匹配）
- **0.21.92**：❌ 官方重构 `launchDelegation(ctx, record3, message)`——`runRegisteredHeadlessAgent` 直接读 `record3.channelId / record3.modelId`，源文件里不再有 `userMessage: prompt,`（改成 `userMessage: message`），该锚点**永久移除**。跨渠道仍生效的关键是 B3c 把 `record3.channelId` 写入 `effectiveChannelId`。若未来官方又回到内联传参，按当前源码重设匹配串。

## C. 绿图标

### C. getTrayIconPath 改 proma-emerald.png
- **匹配**：`join(resourcesDir, "iconTemplate.png")`。
- **替换**：`iconTemplate.png` → `proma-emerald.png`。
- **0.19.53**：✅ import_path9；母本 `resources/proma-logos/proma-emerald.png` 自带。
- **0.21.92**：✅ import_path8；母本仍有 16 种配色 png（proma-emerald.png 41,113 字节）。
- **官方原版同步**：官方安装目录的 `resources/proma-logos/iconTemplate.png` 也会被官方更新覆盖（原版自定义托盘要重做），Pro 版不受影响（走 emerald）。
- **资源确认**：若新版母本缺该 png，从 assets/ 复制过去。

## E. 上下文窗口补丁（0.19.53：E1 GPT-5.6；E2 GLM/DeepSeek 全模型）

### E1. inferCodexAlignedGPT5ContextWindow 前缀匹配 + 1e6
- **背景**：官方 switch 只精确匹配 `gpt-5.6-sol/terra/luna`（无尾缀）→ 372k；渠道里的池化变体（gpt-5.6-terra-1、gpt-5.6-sol-az 等）不命中 → 落 DEFAULT 200k。OpenAI 官方规格 1,050,000 token（AWS Bedrock 亦确认 1M）。
- **匹配**：`const model = modelId?.toLowerCase().replace(/\[1m\]$/i, "");\n  switch (model) {`
- **替换**：两行之间插入 `if (model !== void 0 && /^gpt-5\.6(?:-[a-z0-9]+)*$/.test(model)) return 1e6;`
- **0.19.53**：✅
- **0.21.92**：官方在该函数里新增 `isGpt61SolFamily`（void 0）与 gpt-6 三个家族（372k）前置分支，`switch (model)` 不再紧跟 `const model` → 锚点换成 `function inferCodexAlignedGPT5ContextWindow(modelId) {` + `const model = …` 两行，把判定行插在这两行之后（仍早于所有前置分支，gpt-6 不受影响）。✅
- **优先级链**：`configuredContextWindow（官方渠道后端下发） ?? codexAligned（本补丁） ?? Math.max(catalog, 规则表推断)` —— E1 在 codexAligned 层生效，优先于 catalog 的 272k；后端下发仍最高（官方如果下发更大值不冲突）。
- **不动的模型**：gpt-5.4/5.5（272k）、gpt-5.4-mini（400k）、gpt-6-astra（372k）维持官方推断；MiniMax-M2.7 真实即 200k；gemini-2.5-pro 官方 catalog 已 1M；glm-5.2/5.3、claude、deepseek、kimi-k3、minimax-m3、qwen、gemini-3.x 官方已原生 1M。
- **验证期望**：`return 1e6` 注入行 = 1。

### E2. GLM / DeepSeek 渠道全模型 1M（E2a + E2b）
- **背景**：官方规则表 `ONE_MILLION_CONTEXT_RULES` 只列 glm-5.2/5.3 系与 deepseek-v4/flash；用户渠道（智谱编码套餐 / DeepSeek 开放平台）实际全模型开放 1M（渠道方行为，公开文档未逐一标注；glm-4.7/5-turbo/5.1/4.6v 的 catalog 还是 204800/200000/128000）。
- **匹配**（两个独立 once，纯 ASCII 代码行）：
  - E2a：`      deepseek: ["deepseek-v4", "deepseek-flash"],` → `      deepseek: ["deepseek-"],`
  - E2b：`      glm: ["glm-5.3", "glm-5.3-flash", "glm-5.2"],` → `      glm: ["glm-"],`
  - E2b（0.21.92 串）：官方把 glm 列表扩成 `["glm-5.3", "glm-5.3-flash", "glm-5.3-flashx", "glm-5.2"]`，匹配串要带上 flashx，否则 0 命中。
- **匹配串避开中文注释行的原因**：esbuild bundle 里**注释是明文中文、字符串字面量才是 \uXXXX**；once() 的 enc() 会把注释汉字转义导致失配。只匹配纯 ASCII 代码行则无此问题。
- **生效链**：`supports1MContext` 先 toLowerCase 再 `model.includes(pattern)` —— "glm-"/"deepseek-" 前缀覆盖全系列（含 glm-4.6v、deepseek-v4.1-* 变体与未来新型号）；最终窗口 = `Math.max(catalog, 1e6)` = 1M。`deepgeminipro` 等不含前缀的 ID 不受影响。
- **0.19.53**：✅
- **0.21.92**：✅（glm 列表新增 flashx 后仍被 `glm-` 前缀覆盖，补丁是超集）。
- **验证期望**：`deepseek: ["deepseek-"]` = 1、`glm: ["glm-"]` = 1。

## D. 跨内核子会话（已作废，仅存档）

0.15.7 曾加 D1-D7（delegate_agent 的 agentRuntime 参数、pi runtime 分支）。**0.19.53 官方已退役 Claude runtime**（migrateRetiredClaudeRuntime 删除 agentRuntime 字段，settings/automation 全部剥离），全部会话统一 Pi runtime，跨内核无补丁意义。若未来官方恢复多 runtime，参考 git 历史找回 D 组匹配串。

## F. opencode-go 的 zai 字段修复（0.21.92 起作废）

0.19.53 期为修复 OpenCode Go 渠道（provider `opencode-go-openai`）上 GLM-5.3 首轮 400（`thinking.clear_thinking` / `tool_stream` 被网关严格 schema 拒绝）而加的 endpoint-aware 兼容补丁：新增 `isZaiNativeEndpoint`、给 `compilePiReasoningCapabilities` 加 endpoint 参数、`resolvePiModelDefaults` 传 `{provider, baseUrl}`。

**0.21.92 官方直接停用该 provider**：`buildModel` 里 `if (input.provider === "opencode-go-openai") throw new Error("OpenCode Go 渠道已停用，请选择其他渠道")`，全套 opencode compat 分支被删。因此该补丁不再需要重打；仅当官方恢复该渠道且仍按模型 ID 注入 zai 字段时才需要复现（实现见 git 历史与本机 `workspace-files/proma-glm53-opencode-fix/`）。

## 部署阶段新增（0.19.53，非 main.cjs 补丁）

- **icon.ico 补齐**：0.19.53 运行时会找 `<resources>/app/dist/resources/icon.ico`（getIconPath，__dirname 相对）与 `<resources>/icon.ico`（主窗口），母本均无（官方 asar 版同样缺失，无害告警）。部署时复制 green.ico 到两个位置，消除告警并统一绿图标。
- **禁用自动更新**：`resources/app-update.yml` 的 `url` 改为 `https://127.0.0.1/proma-pro-auto-update-disabled/`。否则更新器空闲时自动安装官方新版，整个 patch 会被覆盖。验证：启动 log 出现 `[更新-updater] Error: net::ERR_CONNECTION_REFUSED`。

## 副作用检查清单（审计阶段）

- [ ] diff orig vs patched，改动集合恰好预期锚点（0.19.53：10 hunks / 12 改动点；0.21.92：10 hunks / 11 改动点），无多余无遗漏。
- [ ] `effectiveChannelId` 全文计数：0.19.53 = 4（1 定义 + B3b/c/d 三处使用）；0.21.92 = 3（1 定义 + B3b/c 两处使用）。
- [ ] `createAgentSession` 其他调用点（`createAgentSession(title, channelId` 形式约 3 处 + 无 title 形式若干）**保持原语义**——只 startDelegation 这处跨渠道。
- [ ] `getAvailableAgentModels` 被注册为 MCP 工具 `list_available_agent_models`（renderer/agent 可达）。
- [ ] 注入函数无重名（listEnabledAgentModelsAcrossChannels / resolveChannelForAgentModel 各 1 处定义）。
- [ ] `\uXXXX` 转义无损（node --check 通过，注入中文抽样解码正确）。
- [ ] 原有 `assertEnabledModelForChannel` 仍被其他流程调用（未破坏）；`listEnabledAgentModelsForChannel` 沦为死代码（无害）。
- [ ] E1 正则只匹配 gpt-5.6 家族（不误伤 gpt-5.4/5.5/gpt-6-astra）；E2 前缀只命中 glm-*/deepseek-* 系（deepgeminipro 等不含前缀的 ID 不受影响）。
