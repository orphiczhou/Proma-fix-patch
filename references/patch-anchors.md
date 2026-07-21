# 补丁锚点详解（patch-main.cjs 的 9 个改动点）

每个锚点列出：匹配特征、替换逻辑、0.15.7 验证状态、变化时的应对。对照此文件做侦察（阶段3）和审计（阶段5）。

> **行号说明**：下文行号基于 **0.15.7 patched**（注入补丁后）；orig 对应位置 = patched 行号 − 注入偏移（详见 `version-baseline-0.15.7.md`）。侦察时以 grep 函数名/匹配串为准，行号仅辅助定位。

## A. Pro 数据隔离

### A1. `.proma-dev` → `.proma-pro`（全替换 3 处）
- **位置**：`getConfigDirName()` 的 3 个分支（PROMA_DEV 分支、isPackaged 三元、mode 标签判定）。
- **替换**：全局 `.proma-dev` → `.proma-pro`。
- **0.15.7**：行 94/98/103，3 处。✅
- **应对变化**：grep `.proma-dev` 计数应 >=3。若官方重构了 getConfigDirName，确认 3 处都改到。

### A2. userData setPath 隔离 + electron-pro
- **匹配**：`setPath("userData", join(appData, "@proma/electron-dev"))` 所在的 `if (!isPackaged)` 块。
- **替换**：条件加 `|| process.env.PROMA_DEV === "1"`，路径 `electron-dev` → `electron-pro`。
- **变量名**：`import_electronN` / `import_pathN` 由正则自动探测，无需硬编码。
- **0.15.7**：行 633944-633945。✅
- **应对变化**：若 setPath 逻辑重构，确认条件 + 路径都改到；最终 `electron-pro` 全文 1 处、`electron-dev` 0 残留。

## B. 跨渠道子会话

### B1. 注入两个新函数
- **插入点**：`var init_agent_model_selection = __esm({` 前。
- **新增**：`listEnabledAgentModelsAcrossChannels()`（遍历所有启用渠道的启用模型）+ `resolveChannelForAgentModel(input)`（按 modelId/channelId 反查渠道）。
- **依赖**：`listChannels()` / `getChannelById()`（bundle 顶层 function 声明，插入点可见——函数提升）。
- **0.15.7**：插入点行 439347。✅
- **应对变化**：若 `init_agent_model_selection` 改名，找等价 __esm 块；确认 listChannels/getChannelById 仍顶层声明（否则改注入位置）。

### B2. getAvailableAgentModels 改跨渠道
- **匹配**：整个 `function getAvailableAgentModels(ctx) {...}`（用 listEnabledAgentModelsForChannel 的原版）。
- **替换**：改用 `listEnabledAgentModelsAcrossChannels()`，返回 models[] 含 channelId/channelName/provider，加 currentChannelId/channelCount。
- **0.15.7**：行 467956-467973。✅ 函数体与 0.14.23 逐字一致。
- **应对变化**：若参数名 ctx 变，更新匹配串；字段名对齐 channel/model 结构（id/name/source/enabled）。

### B3a. startDelegation effectiveModelId 解析
- **匹配**（patch-main.cjs 里是**跨多行**字符串，不是单行）：`const effectiveModelId = args.modelId !== void 0 ? assertEnabledModelForChannel({\n    channelId: ctx.channelId, ...}) : ctx.modelId?.trim()`
- **替换**：改用 `resolveChannelForAgentModel`，引入 `effectiveChannelId` + `effectiveModelId`。
- **0.15.7**：行 468013-468020（patched）。✅
- **侦察提示**：用单行特征串 `effectiveModelId = args.modelId !== void 0` 定位（唯一），再读后续几行确认完整匹配块——别用整段单行 grep（跨行会 0 匹配，误判锚点消失）。
- **应对变化**：若 purpose 中文文案变，更新匹配串（enc 转义后匹配）。

### B3b. createAgentSession 调用改 effectiveChannelId
- **匹配**：`createAgentSession(title, ctx.channelId, ctx.workspaceId, effectiveModelId, parent?.agentRuntime ?? "claude")`。
- **替换**：`ctx.channelId` → `effectiveChannelId`（保留第5参 agentRuntime）。
- **0.15.7**：行 468022。⚠️ 0.15.7 vs 0.14.23 多了第5参 `parent?.agentRuntime ?? "claude"`——匹配串已含。
- **应对变化**：若 createAgentSession 签名再变，更新匹配+替换串（保留新参数，只把 channelId 那个改 effectiveChannelId）。

### B3c. record.channelId
- **匹配**：record2 对象的 `channelId: ctx.channelId`（childSessionId/modelId 之间）。
- **替换**：`ctx.channelId` → `effectiveChannelId`。
- **0.15.7**：行 468039。✅

### B3d. runRegisteredHeadlessAgent input.channelId
- **匹配**：input 对象的 `channelId: ctx.channelId`（userMessage/modelId 之间，6 空格缩进）。
- **替换**：`ctx.channelId` → `effectiveChannelId`。
- **0.15.7**：行 468063。✅ runRegisteredHeadlessAgent 透传 input，channelId 不丢。

## C. 绿图标

### C. getTrayIconPath 改 proma-emerald.png
- **匹配**：`join(resourcesDir, "iconTemplate.png")`。
- **替换**：`iconTemplate.png` → `proma-emerald.png`。
- **变量名**：`import_pathN` 由正则自动探测。
- **0.15.7**：行 631997。✅ resourcesDir 已含 proma-logos 段。
- **资源确认**：目标母本的 `resources/proma-logos/proma-emerald.png` 必须存在（0.15.7 自带 41KB）。skill 自带 `assets/proma-emerald.png` 源备用——若新版母本缺该 png，从 assets/ 复制过去；要重新生成 green.ico 用 `node scripts/build-ico.cjs assets/proma-emerald.png <out.ico>`。

## D. 跨内核子会话（delegate_agent / delegate_agents 加 agentRuntime，子会话可跑 pi）

让协作子会话能选 agentRuntime（claude/pi），突破"子会话强制继承父会话 runtime"。pi runner 在 delegation 路径**已完全可达**（orchestrator.sendMessage 按 sessionMeta.agentRuntime 分发，pi 分支完整实现，automation 已用同链路跑 pi），唯一阻塞是 startDelegation 把 runtime 钉死——改 schema 加字段 + startDelegation 读 args 即通。

### D1 / D2. zod schema 加 agentRuntime（delegate + delegateItem）
- **匹配**：zod delegate（6空格）+ delegateItem（4空格）的 modelId 行 + 闭合后缀。
- **替换**：modelId 后加 `agentRuntime: z2.enum(["claude","pi"]).optional().describe(...)`。
- **坑**：delegate/delegateItem 的 modelId describe 相同，4空格串是6空格的子串 → 用闭合区分（delegateItem `});` vs delegate `},`）。
- **0.15.7**：delegate 行 468111、delegateItem 行 468101。

### D3 / D4. typebox schema 加 agentRuntime（Pi SDK 路径 delegate_agent + delegateItemType）
- **匹配**：typebox 的 expectedOutput + modelId + 闭合后缀。
- **替换**：modelId 后加 `agentRuntime: Type2.Optional(Type2.Union([Type2.Literal("claude"), Type2.Literal("pi")], { description: ... }))`。
- **0.15.7**：delegate_agent 行 468436、delegateItemType 行 468409。
- **注意**：pi 路径用 typebox（非 zod），必须两套 schema 都改，否则 pi 父会话调 delegate 传不了 agentRuntime。

### D5. startDelegation createAgentSession 第5参读 args.agentRuntime（跨内核核心）
- **匹配**：`createAgentSession(title, effectiveChannelId, ctx.workspaceId, effectiveModelId, parent?.agentRuntime ?? "claude")`。
- **替换**：第5参 → `args.agentRuntime ?? parent?.agentRuntime ?? "claude"`。
- **0.15.7**：行 468022。这让 args.agentRuntime 写入子会话 meta，orchestrator 据此走 pi 分支。

### D6. resolveDelegationPermissionMode 第3参读 args.agentRuntime
- **0.15.7**：行 468011。让 pi 子会话自动 bypassPermissions（resolveDelegationPermissionMode 的 pi 分支强制 bypass，与 automation 一致）。

### D7. runRegisteredHeadlessAgent input 传 agentRuntime（双保险）
- **0.15.7**：行 468059-069。input 加 agentRuntime，对齐 automation（606516）。即使 sessionMeta 异常也能覆盖。

**D 变化应对**：schema 字段顺序变 → 调匹配串（用 modelId 或 expectedOutput+闭合定位）；startDelegation 重构 → 确认 createAgentSession 第5参仍是 agentRuntime；新增绕过 startDelegation 的子会话路径 → 加新补丁点。

**D 验证期望**：`z2.enum(["claude","pi"])` = 2、`Type2.Literal("claude")` = 2、`args.agentRuntime ?? parent?.agentRuntime` = 3。

## 副作用检查清单（审计阶段）

- [ ] diff orig vs patched，改动集合恰好 9 锚点（无多余无遗漏）。
- [ ] `effectiveChannelId` 全文计数 = 1 定义 + 3 使用（B3b/c/d）= 4。
- [ ] `createAgentSession` 其他调用点（fork/automation/普通创建/UI actions 等约 10 处）**保持原语义**——只 startDelegation 这处跨渠道。
- [ ] `getAvailableAgentModels` 被注册为 MCP 工具 `list_available_agent_models`（renderer/agent 可达）。
- [ ] `startDelegation` 是唯一 delegation 入口（delegate_agent/delegate_agents 的调用点都在其 handler 内）。
- [ ] 注入函数无重名（listEnabledAgentModelsAcrossChannels / resolveChannelForAgentModel 各 1 处定义）。
- [ ] `\uXXXX` 转义无损（node --check 通过，注入中文抽样解码正确）。
- [ ] 原有 `assertEnabledModelForChannel` 仍被其他流程调用（未破坏）；`listEnabledAgentModelsForChannel` 沦为死代码（无害）。
