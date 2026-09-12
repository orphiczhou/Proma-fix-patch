// patch-main.cjs —— 把 Proma 官方 main.cjs 改造成 Pro 版（跨渠道子会话 + Pro 数据隔离 + 绿图标 + GPT-5.6 1M 上下文）
// 版本无关设计：正则自动探测 esbuild 变量名（import_electronN / import_pathN），不硬编码版本号。
// 8 个锚点基于 0.15.7 / 0.19.53 验证过的结构。
// 若某锚点匹配失败（throw "期望1处匹配，实际0处"），说明新版结构变化 —— 先跑 SKILL.md 的"侦察"阶段，
// 对照 references/patch-anchors.md 适配本脚本（通常是匹配串里的函数签名变了）。
//
// 0.19.53 适配记录（相对 0.15.7 版脚本）：
//   - D 组（跨内核 agentRuntime）整体移除：0.19.53 官方已退役 Claude runtime，全部会话统一 Pi runtime，
//     agentRuntime 已成 legacy 字段（migrateRetiredClaudeRuntime 主动删除），无补丁意义。
//   - B3b/B3c 适配：createAgentSession 回到 4 参（agentRuntime 第5参被移除），局部变量 child → child2。
//   - A2 适配：setPath userData 块新增 PROMA_DEV_INSTANCE 多实例支持（setName + 模板串），electron-pro 同步替换两处。
//   - E 组新增：GPT-5.6 家族（含 -1/-2/-az 等池化尾缀变体）contextWindow 提到 1M（OpenAI 官方规格 1,050,000）。
//
// 关键约束：① 不全局解码文件（破坏正则字面量 \t/\n）；② 中文按需 enc 成 \uXXXX 匹配；③ ?? 与 || 不混用。
// 用法: node patch-main.cjs <main.cjs路径>
const fs = require('fs')
const file = process.argv[2]
if (!file) { console.error('用法: node patch-main.cjs <main.cjs路径>'); process.exit(1) }
let src = fs.readFileSync(file, 'utf8')

const enc = (s) => s.replace(/[^\x00-\x7F]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase())

// ===== 自动探测 esbuild 变量名（setPath 行 + trayIcon 行）=====
// 0.19.53 setPath 形如：
//   import_electronN.app.setPath("userData", (0, import_pathM.join)(import_electronN.app.getPath("appData"), instance ? `@proma/electron-dev-${instance}` : "@proma/electron-dev"));
const setPathRe = /(\bimport_electron\d+)\.app\.setPath\("userData", \(0, (\bimport_path\d+)\.join\)\(\1\.app\.getPath\("appData"\), instance/
const setPathMatch = src.match(setPathRe)
if (!setPathMatch) throw new Error('[探测失败] 未找到 setPath(userData, electron-dev) 行，结构可能已变 —— 请人工核查')
const EL = setPathMatch[1] // import_electron59
const PA = setPathMatch[2] // import_path10
// trayIcon 形如：(0, import_pathK.join)(resourcesDir, "iconTemplate.png")
const trayRe = /\(0, (\bimport_path\d+)\.join\)\(resourcesDir, "iconTemplate\.png"\)/
const trayMatch = src.match(trayRe)
if (!trayMatch) throw new Error('[探测失败] 未找到 getTrayIconPath 的 iconTemplate.png 行，结构可能已变 —— 请人工核查')
const PT = trayMatch[1] // import_path9
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

// ===== A. Pro 数据隔离 =====
all('A1 .proma-dev->.proma-pro', '.proma-dev', '.proma-pro')
once('A2 userData隔离+electron-pro（0.19.53 多实例结构）',
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
    for (const model of channel.models) {
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
      const model = channel.models.find((item) => item.id === modelId && item.enabled);
      if (!model) throw new Error(purpose + "模型不属于指定渠道或未启用: " + modelId);
    }
    return { channelId, modelId };
  }
  if (modelId) {
    const hit = listChannels().find((channel) => channel.enabled && channel.models.some((item) => item.id === modelId && item.enabled));
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

once('B2 getAvailableAgentModels跨渠道',
  `function getAvailableAgentModels(ctx) {
  const currentModelId = ctx.modelId?.trim() || void 0;
  const summary = listEnabledAgentModelsForChannel(ctx.channelId, "读取协作子会话可用模型");
  return {
    channelId: summary.channelId,
    channelName: summary.channelName,
    provider: summary.provider,
    currentModelId,
    currentModelAvailable: currentModelId ? summary.models.some((model) => model.id === currentModelId) : false,
    models: summary.models.map((model) => ({
      ...model,
      current: model.id === currentModelId
    })),
    modelCount: summary.models.length,
    note: summary.models.length > 0 ? "创建协作子会话时，可从 models[].id 中选择 modelId；不传则继承 currentModelId。" : "当前渠道没有启用的 Agent 模型，请先在渠道设置中启用模型。"
  };
}`,
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
}`
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
// 0.19.53 适配：createAgentSession 回到 4 参（0.15.7 的第5参 agentRuntime 已随 Claude runtime 退役移除），局部变量 child -> child2
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
once('B3d runHeadless channelId',
  `      userMessage: prompt,
      channelId: ctx.channelId,
      modelId: effectiveModelId,`,
  `      userMessage: prompt,
      channelId: effectiveChannelId,
      modelId: effectiveModelId,`
)

// ===== C. 托盘图标改绿（resources/proma-logos/proma-emerald.png 需存在于母本）=====
once('C tray icon -> emerald',
  `(0, ${PT}.join)(resourcesDir, "iconTemplate.png")`,
  `(0, ${PT}.join)(resourcesDir, "proma-emerald.png")`
)

// ===== E. GPT-5.6 家族 1M 上下文 =====
// 背景：0.19.53 的 inferCodexAlignedGPT5ContextWindow 只对无尾缀的 "gpt-5.6-sol/terra/luna" 精确匹配，
// 渠道里的池化变体（gpt-5.6-terra-1、gpt-5.6-sol-az 等）不命中 → 落 DEFAULT_CONTEXT_WINDOW=200k；
// 无尾缀版也只给 CODEX 对齐值 372k。OpenAI 官方模型规格为 1,050,000 token（AWS Bedrock 亦确认 1M），
// 故 gpt-5.6 全系（含尾缀变体）统一提到 1e6。gpt-5.4/5.5/5.4-mini 与 gpt-6-astra 维持官方推断值不动。
once('E1 gpt-5.6家族 1M 上下文',
  `  const model = modelId?.toLowerCase().replace(/\\[1m\\]$/i, "");
  switch (model) {`,
  `  const model = modelId?.toLowerCase().replace(/\\[1m\\]$/i, "");
  if (model !== void 0 && /^gpt-5\\.6(?:-[a-z0-9]+)*$/.test(model)) return 1e6;
  switch (model) {`
)

// ===== 验证（符号均为 ASCII，在 \uXXXX 中文环境下可正确计数）=====
function assertCount(label, sym, min) {
  const c = src.split(sym).length - 1
  if (c < min) throw new Error(`[验证失败] ${label}: ${sym} 期望>=${min}，实际${c}`)
}
assertCount('listEnabledAgentModelsAcrossChannels', 'listEnabledAgentModelsAcrossChannels', 2)
assertCount('resolveChannelForAgentModel', 'resolveChannelForAgentModel', 2)
assertCount('effectiveChannelId', 'effectiveChannelId', 3)
assertCount('.proma-pro', '.proma-pro', 3)
assertCount('electron-pro', 'electron-pro', 2)
assertCount('E: gpt-5.6 1M rule', '/^gpt-5\\.6(?:-[a-z0-9]+)*$/.test(model)) return 1e6', 1)
assertCount('proma-emerald.png', 'proma-emerald.png', 1)
if (src.includes('.proma-dev')) throw new Error('[验证失败] 仍残留 .proma-dev')
if (src.includes('electron-dev')) throw new Error('[验证失败] 仍残留 electron-dev')

fs.writeFileSync(file, src, 'utf8')
console.log('PATCH OK. 已应用：')
for (const m of done) console.log('  -', m)
console.log('文件大小:', fs.statSync(file).size, 'bytes')
