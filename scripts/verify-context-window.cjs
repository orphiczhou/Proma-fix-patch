// verify-context-window.cjs —— 从 patched main.cjs 抽取上下文窗口逻辑做行为断言（阶段5 审计用，只读源码）
const fs = require('fs')
const vm = require('vm')
const src = fs.readFileSync(process.argv[2], 'utf8')

function slice(startMarker, endMarker) {
  const i = src.indexOf(startMarker)
  if (i < 0) throw new Error('start not found: ' + startMarker)
  const j = src.indexOf(endMarker, i)
  if (j < 0) throw new Error('end not found: ' + endMarker)
  return src.slice(i, j)
}

const inferFn = slice('function inferCodexAlignedGPT5ContextWindow(modelId) {', 'function isMimoV26Model(')
const ruleFns = slice('function matchesContextRule(model, pattern) {', 'function inferContextWindow(model) {')

const rulesM = src.match(/ONE_MILLION_CONTEXT_RULES = \{([\s\S]*?)\n    \};\n    ONE_MILLION_CONTEXT_DISPLAY_RULES/)
if (!rulesM) throw new Error('ONE_MILLION_CONTEXT_RULES 未找到')
const rulesObj = 'var ONE_MILLION_CONTEXT_RULES = {' + rulesM[1] + '\n};'

const exactM = src.match(/EXACT_CONTEXT_RULES = \/\* @__PURE__ \*\/ new Set\((\[[\s\S]*?\])\);/)
if (!exactM) throw new Error('EXACT_CONTEXT_RULES 未找到')
const exactSet = 'var EXACT_CONTEXT_RULES = new Set(' + exactM[1] + ');'

const constM = src.match(/DEFAULT_CONTEXT_WINDOW = ([\de.]+);[\s\S]*?ONE_MILLION_CONTEXT_WINDOW = ([\de.]+);[\s\S]*?CODEX_GPT_54_55_CONTEXT_WINDOW = ([\de.]+);[\s\S]*?CODEX_GPT_54_MINI_CONTEXT_WINDOW = ([\de.]+);[\s\S]*?CODEX_GPT_56_CONTEXT_WINDOW = ([\de.]+);[\s\S]*?CODEX_GPT_6_CONTEXT_WINDOW = ([\de.]+);/)
if (!constM) throw new Error('上下文窗口常量未找到')
const [, DEFAULT_W, ONE_M, C5455, C54MINI, C56, C6] = constM
console.log('常量：', { DEFAULT_W, ONE_M, C5455, C54MINI, C56, C6 })

const prelude = `
var DEFAULT_CONTEXT_WINDOW = ${DEFAULT_W}, ONE_MILLION_CONTEXT_WINDOW = ${ONE_M}, CODEX_GPT_54_55_CONTEXT_WINDOW = ${C5455}, CODEX_GPT_54_MINI_CONTEXT_WINDOW = ${C54MINI}, CODEX_GPT_56_CONTEXT_WINDOW = ${C56}, CODEX_GPT_6_CONTEXT_WINDOW = ${C6};
var GPT_6_ASTRA_FAMILY_PATTERN = /^gpt-6-astra(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/,
    GPT_6_SOL_FAMILY_PATTERN = /^gpt-6(?:\.1)?-sol(?:-\d+)?$/,
    GPT_6_61_SOL_FAMILY_PATTERN = /^gpt-6\.1-sol(?:-\d+)?$/;
function normalizeModelId(modelId) { return typeof modelId === "string" && modelId.trim() ? modelId.trim().toLowerCase() : void 0 }
function isGpt6AstraFamily(modelId) { const n = normalizeModelId(modelId); return n !== void 0 && GPT_6_ASTRA_FAMILY_PATTERN.test(n) }
function isGpt6SolFamily(modelId) { const n = normalizeModelId(modelId); return n !== void 0 && GPT_6_SOL_FAMILY_PATTERN.test(n) }
function isGpt61SolFamily(modelId) { const n = normalizeModelId(modelId); return n !== void 0 && GPT_6_61_SOL_FAMILY_PATTERN.test(n) }
function getKimiContextWindow() { return void 0 }
function getGeminiModelCapability() { return void 0 }
`
const config = `
var _rules = Object.values(ONE_MILLION_CONTEXT_RULES).flat();
var CONTEXT_WINDOW_CONFIG = { exclude: ["haiku"], rules: [..._rules, "kimi-k3", "mimo-v2-pro"] };
`
const ctx = vm.createContext({})
vm.runInContext(prelude + '\n' + rulesObj + '\n' + exactSet + '\n' + config + '\n' + inferFn + '\n' + ruleFns, ctx)
const { inferCodexAlignedGPT5ContextWindow, supports1MContext } = ctx

const cases = []
function eq(label, got, want) { cases.push({ label, got, want, ok: got === want }) }
eq('gpt-5.6', inferCodexAlignedGPT5ContextWindow('gpt-5.6'), 1e6)
eq('gpt-5.6-terra-1', inferCodexAlignedGPT5ContextWindow('gpt-5.6-terra-1'), 1e6)
eq('gpt-5.6-sol-az', inferCodexAlignedGPT5ContextWindow('gpt-5.6-sol-az'), 1e6)
eq('gpt-5.6-sol', inferCodexAlignedGPT5ContextWindow('gpt-5.6-sol'), 1e6)
eq('gpt-5.4', inferCodexAlignedGPT5ContextWindow('gpt-5.4'), 272000)
eq('gpt-5.5', inferCodexAlignedGPT5ContextWindow('gpt-5.5'), 272000)
eq('gpt-5.4-mini', inferCodexAlignedGPT5ContextWindow('gpt-5.4-mini'), 400000)
eq('gpt-6-astra', inferCodexAlignedGPT5ContextWindow('gpt-6-astra'), 372000)
eq('gpt-6.1-sol', inferCodexAlignedGPT5ContextWindow('gpt-6.1-sol'), undefined)
eq('glm-4.6v → 1M', supports1MContext('glm-4.6v'), true)
eq('glm-5.1 → 1M', supports1MContext('glm-5.1'), true)
eq('GLM-5.3（大小写）→ 1M', supports1MContext('GLM-5.3'), true)
eq('glm-5.3-flashx → 1M', supports1MContext('glm-5.3-flashx'), true)
eq('deepseek-v4.1-flash-x → 1M', supports1MContext('deepseek-v4.1-flash-x'), true)
eq('deepgeminipro 不误伤', supports1MContext('deepgeminipro'), false)
eq('haiku 仍排除', supports1MContext('claude-haiku-5-5'), false)

const failed = cases.filter((c) => !c.ok)
for (const c of cases) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}: ${c.got}`)
console.log(failed.length === 0 ? `\nALL ${cases.length} PASS` : `\n${failed.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
