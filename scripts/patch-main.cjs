// patch-main.cjs —— Proma-Pro 补丁（当前基线 0.21.92；0.19.53 版见 scripts/archive/patch-main-0.19.53.cjs）
// 相对 0.19.53 版 patch-main.cjs 的适配：
//   - B2 getAvailableAgentModels 改为区间替换（官方改了 note 文案，整函数文本匹配失效）
//   - B3d 移除（0.21.92 的 launchDelegation 直接用 record3.channelId，不再有 userMessage: prompt 处传参）
//   - E1 锚点改为 inferCodexAlignedGPT5ContextWindow 新前缀（新增 isGpt61SolFamily 前置分支）
//   - E2b GLM 规则表新增 glm-5.3-flashx，改用当前字符串
//   - 注入函数改用 getEnabledAgentModelSource（0.21.92 新增，官方渠道走 agentModels）
//   - 跨渠道说明同步改 list_available_agent_models 工具描述
//   - zai/opencode-go 修复不再需要：0.21.92 已停用 opencode-go-openai 渠道（buildModel 直接抛错）
// 用法: node patch-main.cjs <main.cjs路径>
const fs = require('fs')
const file = process.argv[2]
if (!file) { console.error('用法: node patch-main.cjs <main.cjs路径>'); process.exit(1) }
let src = fs.readFileSync(file, 'utf8')

const enc = (s) => s.replace(/[^\x00-\x7F]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase())

// ===== 自动探测 esbuild 变量名 =====
const setPathRe = /(\bimport_electron\d+)\.app\.setPath\("userData", \(0, (\bimport_path\d+)\.join\)\(\1\.app\.getPath\("appData"\), instance/
const setPathMatch = src.match(setPathRe)
if (!setPathMatch) throw new Error('[探测失败] 未找到 setPath(userData, electron-dev) 行')
const EL = setPathMatch[1]
const PA = setPathMatch[2]
const trayRe = /\(0, (\bimport_path\d+)\.join\)\(resourcesDir, "iconTemplate\.png"\)/
const trayMatch = src.match(trayRe)
if (!trayMatch) throw new Error('[探测失败] 未找到 getTrayIconPath 的 iconTemplate.png 行')
const PT = trayMatch[1]
console.log(`[探测] setPath: ${EL} / ${PA}；trayIcon: ${PT}`)

const done = []
function once(label, oldS, newS) {
  const o = enc(oldS), n = enc(newS)
  const c = src.split(o).length - 1
  if (c !== 1) throw new Error(`[${label}] 期望1处匹配，实际${c}处`)
  src = src.replace(o, n)
  done.push(label)
}
function all(label, oldS, newS) {
  const o = enc(oldS), n = enc(newS)
  const c = src.split(o).length - 1
  if (c < 1) throw new Error(`[${label}] 期望>=1处匹配，实际0处`)
  src = src.split(o).join(n)
  done.push(`${label} x${c}`)
}
function range(label, startMarker, endMarker, newText) {
  const s = enc(startMarker), e = enc(endMarker)
  const i = src.indexOf(s)
  if (i < 0) throw new Error(`[${label}] 起始锚点未找到: ${startMarker.slice(0, 60)}`)
  if (src.indexOf(s, i + 1) >= 0) throw new Error(`[${label}] 起始锚点出现多次`)
  const j = src.indexOf(e, i)
  if (j < 0) throw new Error(`[${label}] 结束锚点未找到`)
  src = src.slice(0, i) + enc(newText) + src.slice(j)
  done.push(label)
}

// ===== A. Pro 数据隔离 =====
all('A1 .proma-dev->.proma-pro', '.proma-dev', '.proma-pro')
once('A2 userData隔离+electron-pro',
  `    if (!${EL}.app.isPackaged) {
      const instance = process.env.PROMA_DEV_INSTANCE?.replace(/[^a-zA-Z0-9_-]/g, "");
      if (instance) ${EL}.app.setName(\`Proma-\${instance}\`);
      ${EL}.app.setPath("userData", (0, ${PA}.join)(${EL}.app.getPath("appData"), instance ? \`@proma/electron-dev-\${instance}\` : "@proma/electron-dev"));
    }`,
  `    if (!${EL}.app.isPackaged || process.env.PROMA_DEV === "1") {
      const instance = process.env.PROMA_DEV_INSTANCE?.replace(/[^a-zA-Z0-9_-]/g, "");
      if (instance) ${EL}.app.setName(\`Proma-\${instance}\`);
      ${EL}.app.setPath("userData", (0, ${PA}.join)(${EL}.app.getPath("appData"), instance ? \`@proma/electron-pro-\${instance}\` : "@proma/electron-pro"));
    }`
)

// ===== B. 跨渠道子会话 =====
const newFns = `
function listEnabledAgentModelsAcrossChannels() {
  const entries = [];
  for (const channel of listChannels()) {
    if (!channel.enabled) continue;
    for (const model of getEnabledAgentModelSource(channel)) {
      if (!model.enabled) continue;
      entries.push({ id: model.id, name: model.name, source: model.source, channelId: channel.id, channelName: channel.name, provider: channel.provider });
    }
  }
  return entries;
}
function resolveChannelForAgentModel(input) {
  const purpose = input.purpose;
  const modelId = input.modelId?.trim() || void 0;
  const channelId = input.channelId?.trim() || void 0;
  if (channelId) {
    const channel = getChannelById(channelId);
    if (!channel || !channel.enabled) throw new Error(purpose + "引用的渠道不存在或未启用: " + channelId);
    if (modelId) {
      const model = getEnabledAgentModelSource(channel).find((item) => item.id === modelId && item.enabled);
      if (!model) throw new Error(purpose + "模型不属于指定渠道或未启用: " + modelId);
    }
    return { channelId, modelId };
  }
  if (modelId) {
    const hit = listChannels().find((channel) => channel.enabled && getEnabledAgentModelSource(channel).some((item) => item.id === modelId && item.enabled));
    if (!hit) throw new Error(purpose + "未在任何已启用渠道中找到已启用模型: " + modelId);
    return { channelId: hit.id, modelId };
  }
  if (input.fallbackChannelId) {
    const channel = getChannelById(input.fallbackChannelId);
    if (!channel || !channel.enabled) throw new Error(purpose + "引用的渠道不存在或未启用: " + input.fallbackChannelId);
    return { channelId: input.fallbackChannelId };
  }
  return {};
}
`
once('B1 插入跨渠道函数', `var init_agent_model_selection = __esm({`, newFns + `var init_agent_model_selection = __esm({`)

range('B2 getAvailableAgentModels跨渠道',
  `function getAvailableAgentModels(ctx) {`,
  `function stopDelegation(parentSessionId, delegationId) {`,
  `function getAvailableAgentModels(ctx) {
  const currentModelId = ctx.modelId?.trim() || void 0;
  const entries = listEnabledAgentModelsAcrossChannels();
  const channelIds = Array.from(new Set(entries.map((item) => item.channelId)));
  return {
    currentChannelId: ctx.channelId,
    currentModelId,
    currentModelAvailable: currentModelId ? entries.some((item) => item.id === currentModelId) : false,
    models: entries.map((item) => ({
      id: item.id,
      name: item.name,
      source: item.source,
      channelId: item.channelId,
      channelName: item.channelName,
      provider: item.provider,
      current: item.id === currentModelId
    })),
    modelCount: entries.length,
    channelCount: channelIds.length,
    note: entries.length > 0 ? "创建协作子会话时可跨渠道选择模型：从 models[].id 选 modelId（系统自动定位其所属渠道）；不传则继承父会话当前渠道与模型。" : "没有任何已启用渠道包含已启用模型，请先在渠道设置中启用渠道与模型。"
  };
}
`
)

once('B2b 工具描述跨渠道',
  `列出当前父会话渠道下已启用、可用于协作子 Agent 的模型。`,
  `列出所有已启用渠道中可用于协作子 Agent 的模型（可跨渠道选择 modelId）。`
)

once('B3a effectiveModelId解析',
  `  const effectiveModelId = args.modelId !== void 0 ? assertEnabledModelForChannel({
    channelId: ctx.channelId,
    modelId: args.modelId,
    purpose: "创建协作子会话"
  }) : ctx.modelId?.trim() || void 0;`,
  `  const resolved = (args.modelId !== void 0 || args.channelId !== void 0) ? resolveChannelForAgentModel({
    channelId: args.channelId,
    modelId: args.modelId,
    fallbackChannelId: ctx.channelId,
    purpose: "创建协作子会话"
  }) : { channelId: ctx.channelId, modelId: ctx.modelId?.trim() || void 0 };
  const effectiveChannelId = resolved.channelId || ctx.channelId;
  const effectiveModelId = resolved.modelId || ctx.modelId?.trim() || void 0;`
)
once('B3b createAgentSession改effectiveChannelId',
  `  const child2 = createAgentSession(title, ctx.channelId, ctx.workspaceId, effectiveModelId);`,
  `  const child2 = createAgentSession(title, effectiveChannelId, ctx.workspaceId, effectiveModelId);`
)
once('B3c record.channelId',
  `    childSessionId: child2.id,
    channelId: ctx.channelId,
    modelId: effectiveModelId,`,
  `    childSessionId: child2.id,
    channelId: effectiveChannelId,
    modelId: effectiveModelId,`
)

// ===== C. 托盘图标改绿 =====
once('C tray icon -> emerald',
  `(0, ${PT}.join)(resourcesDir, "iconTemplate.png")`,
  `(0, ${PT}.join)(resourcesDir, "proma-emerald.png")`
)

// ===== E1. GPT-5.6 家族（含池化变体）1M 上下文 =====
once('E1 gpt-5.6家族 1M 上下文',
  `function inferCodexAlignedGPT5ContextWindow(modelId) {
  const model = modelId?.toLowerCase().replace(/\\[1m\\]$/i, "");`,
  `function inferCodexAlignedGPT5ContextWindow(modelId) {
  const model = modelId?.toLowerCase().replace(/\\[1m\\]$/i, "");
  if (model !== void 0 && /^gpt-5\\.6(?:-[a-z0-9]+)*$/.test(model)) return 1e6;`
)

// ===== E2. GLM / DeepSeek 渠道全模型 1M =====
once('E2a DeepSeek 全模型 1M',
  `      deepseek: ["deepseek-v4", "deepseek-flash"],`,
  `      deepseek: ["deepseek-"],`
)
once('E2b GLM 全模型 1M',
  `      glm: ["glm-5.3", "glm-5.3-flash", "glm-5.3-flashx", "glm-5.2"],`,
  `      glm: ["glm-"],`
)

// ===== 验证 =====
function assertCount(label, sym, min) {
  const c = src.split(sym).length - 1
  if (c < min) throw new Error(`[验证失败] ${label}: ${sym} 期望>=${min}，实际${c}`)
  return c
}
const counts = {
  across: assertCount('listEnabledAgentModelsAcrossChannels', 'listEnabledAgentModelsAcrossChannels', 2),
  resolve: assertCount('resolveChannelForAgentModel', 'resolveChannelForAgentModel', 2),
  eff: assertCount('effectiveChannelId', 'effectiveChannelId', 3),
  promapro: assertCount('.proma-pro', '.proma-pro', 3),
  elepro: assertCount('electron-pro', 'electron-pro', 2),
  emerald: assertCount('proma-emerald.png', 'proma-emerald.png', 1),
  e1: assertCount('E1 rule', '/^gpt-5\\.6(?:-[a-z0-9]+)*$/.test(model)) return 1e6', 1),
  e2a: assertCount('E2a', 'deepseek: ["deepseek-"]', 1),
  e2b: assertCount('E2b', 'glm: ["glm-"]', 1)
}
if (src.includes('.proma-dev')) throw new Error('[验证失败] 仍残留 .proma-dev')
if (src.includes('electron-dev')) throw new Error('[验证失败] 仍残留 electron-dev')
if (src.includes('listEnabledAgentModelsForChannel(ctx.channelId, "')) throw new Error('[验证失败] getAvailableAgentModels 未替换')

fs.writeFileSync(file, src, 'utf8')
console.log('PATCH OK. 已应用：')
for (const m of done) console.log('  -', m)
console.log('计数:', counts)
console.log('文件大小:', fs.statSync(file).size, 'bytes')
