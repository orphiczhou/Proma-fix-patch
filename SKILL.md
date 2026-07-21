---
name: proma-pro-repatch
description: 把 Proma 桌面应用（官方安装版）改造成 Pro 定制版——注入跨渠道协作子会话（开子会话时可选任意已启用渠道的模型）+ 跨内核子会话（delegate_agent 可选 claude/pi runtime）+ Pro 数据隔离（~/.proma-pro，可与原版共存）+ 绿色图标。当用户要把 Proma 升级到新主线版本并重新打补丁、或提到“改造 Pro 版 / 跨渠道子会话 / 跨内核子会话 / agentRuntime=pi / 重新打包 Proma-Pro / Proma 版本升级补丁 / Pro 副本 / proma-pro”时，务必使用本 skill。打包了完整补丁脚本、asar 工具、rcedit 图标工具链和 node_modules，独立自洽，按 6 阶段 SOP 执行：确认源版本 → 提取 main.cjs → 侦察锚点 → 应用补丁 → 审计 → 部署打包。
---

# Proma-Pro 重新打补丁

把 Proma 官方安装版改造成 Pro 定制版。改造逻辑以 **bundle 补丁**形式注入打包后的 `main.cjs`（非源码 build——Proma 闭源，源码改动也曾被用户回退，改进只存在于 bundle）。

## 四块改造

1. **跨渠道子会话**：开协作子会话时可指定任意已启用渠道的模型（默认只能用父会话当前渠道）。注入 `listEnabledAgentModelsAcrossChannels` + `resolveChannelForAgentModel`，改 `getAvailableAgentModels` 列所有渠道模型、`startDelegation` 经 `effectiveChannelId` 把子会话挂到目标渠道。
2. **跨内核子会话**：delegate_agent/delegate_agents 加 `agentRuntime` 参数（claude/pi，默认继承父会话）。pi runner 在 delegation 路径已可达，改 zod+typebox 两套 schema 加字段 + startDelegation 读 `args.agentRuntime` 即通——子会话可跑 pi 内核（适合 OpenAI Responses 等非 Anthropic 协议模型）。
2. **Pro 数据隔离**：业务数据 `~/.proma-pro`、electron userData `@proma/electron-pro`，与原版（`~/.proma`）完全隔离，单实例锁独立，可与原版同时运行。
3. **绿色图标**：托盘用 `proma-emerald.png`、exe 嵌 `green.ico`（改副本 `PromaPro.exe`——原 `Proma.exe` 运行时被锁改不了）。

## 前置条件

- **Windows x64**（rcedit、skia 原生模块都绑 win32-x64-msvc）。
- **node 运行时**：skill 自带 `assets/node_modules`（rcedit/jimp/png-to-ico），但需 node 解释器。优先 `C:/Program Files/nodejs/node.exe`（v22+），不在 PATH 用绝对路径。
- **Proma 官方安装版**：默认从 `C:/Users/<user>/AppData/Local/Programs/Proma` 取。也接受用户指定的 app.asar 路径。

## 关键约束（违反会损坏 main.cjs）

- main.cjs 是 esbuild bundle，**中文以 `\uXXXX` 转义存储**。匹配前用 `enc()` 转义，**绝不全局 decode**（会破坏正则字面量里的 `\t`/`\n`，导致 `node --check` 报 invalid regex）。详见 `references/known-pitfalls.md`。
- `??` 与 `||` 不可混用（JS 语法），注入新代码统一用 `||` 链。
- 解包 asar 后**必须合并 `app.asar.unpacked/`** 到 `app/`（原生模块占位是坏的），否则跨机器加载 skia 失败。

## 完整流程（6 阶段，勿跳步）

侦察（阶段3）和审计（阶段5）是跨版本收敛的关键。

### 阶段 1：确认源版本

```bash
# 查 Proma.exe 版本（powershell 不在 git bash PATH，用绝对路径）
/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command \
  "(Get-Item 'C:\Users\<user>\AppData\Local\Programs\Proma\Proma.exe').VersionInfo.ProductVersion"
```

记下 `<版本>`（如 `0.15.7`）。确认源目录 `<SRC>`（默认 `C:/Users/<user>/AppData/Local/Programs/Proma`）和 app.asar 修改时间（判断是否刚自动更新到最新）。

### 阶段 2：提取 main.cjs

只提取需要的文件（不要全解包 node_modules）：

```bash
NODE="C:/Program Files/nodejs/node.exe"
SKILL="<skill目录>"        # 通常 .../skills/proma-pro-repatch
WORK="<临时工作目录>"
# 提取 main.cjs 单文件（最省空间）：
"$NODE" "$SKILL/scripts/read-asar.cjs" "$SRC/resources/app.asar" dist/main.cjs > "$WORK/main-orig.cjs"
# 顺带读 package.json 确认版本：
"$NODE" "$SKILL/scripts/read-asar.cjs" "$SRC/resources/app.asar" package.json > "$WORK/package.json"
# 验证字节级完整：
"$NODE" --check "$WORK/main-orig.cjs"
```

确认未 minify（grep `getChannelsPath`、`startDelegation`、`getTrayIconPath` 应命中）。若 minify 了，锚点匹配失效——停下告知用户。

### 阶段 3：侦察锚点（关键，勿跳）

对照 `references/patch-anchors.md`，逐项 grep 确认 9 锚点在新版的状态。**历史教训**：

- **`isPro` 精确搜索**：好奇新版有无 Pro 判定逻辑时，用 `isPro\b`（单词边界）搜，**不要**用 `isPro`——后者命中 `isProblematic`/`isPromise`/`isPrototype` 等噪声，造成误判。0.15.7 上 `isPro\b` 实际零匹配，没有"激活 isPro"捷径。
- 对照 `references/version-baseline-0.15.7.md` 看新版与 0.15.7 差异（main.cjs 大小、行数、锚点行号）。

**产出**：每锚点状态（存在不变 / 签名变化 / 消失 / 新增）。若有变化，先适配 `scripts/patch-main.cjs` 对应匹配串（变量名漂移已自动处理，通常只需改函数签名相关串）。

### 阶段 4：应用补丁

```bash
cp "$WORK/main-orig.cjs" "$WORK/main-patched.cjs"
"$NODE" "$SKILL/scripts/patch-main.cjs" "$WORK/main-patched.cjs"
```

脚本自动探测 esbuild 变量名、应用 9 补丁点、跑内置验证。**若 throw "期望1处匹配，实际0处"**：该锚点变了，回阶段3按 `references/patch-anchors.md` 适配后重跑。

### 阶段 5：审计

```bash
"$NODE" --check "$WORK/main-patched.cjs"   # 语法
# 逐项验证补丁标记（期望 across>=2, resolve>=2, eff>=4, promapro=3, promadev=0, elepro=1, eledev=0, emerald=1）：
"$NODE" -e "const s=require('fs').readFileSync(process.argv[1],'utf8');const c=x=>s.split(x).length-1;console.log({across:c('listEnabledAgentModelsAcrossChannels'),resolve:c('resolveChannelForAgentModel'),eff:c('effectiveChannelId'),promapro:c('.proma-pro'),promadev:c('.proma-dev'),elepro:c('electron-pro'),eledev:c('electron-dev'),emerald:c('proma-emerald.png')});" "$WORK/main-patched.cjs"
```

对抗性检查（清单见 `references/patch-anchors.md`）：diff orig vs patched 确认改动恰好 9 锚点；`createAgentSession` 其他调用点不应被改；注入函数作用域内 `listChannels`/`getChannelById` 可见。派子会话独立审计效果更好。

### 阶段 6：部署打包

目标：`E:/Proma-Pro-<版本>/`（母本，保留旧母本不动）+ `E:/PromaPro-portable-<版本>.zip`。

```bash
DEST="E:/Proma-Pro-<版本>"
# 1. robocopy 复制母本（退出码 0-7 都成功，1=有复制 bash 会当 error，忽略）
MSYS_NO_PATHCONV=1 /c/Windows/System32/robocopy.exe "$SRC" "$DEST" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP
# 2. 解包 app.asar -> app/
"$NODE" "$SKILL/scripts/extract-asar.cjs" "$DEST/resources/app.asar" "$DEST/resources/app"
# 3. 合并 app.asar.unpacked -> app/（覆盖原生模块占位，必做！）
"$NODE" "$SKILL/scripts/merge-unpacked.cjs" "$DEST/resources"
# 4. 注入 patched main.cjs
cp "$WORK/main-patched.cjs" "$DEST/resources/app/dist/main.cjs"
# 5. 禁用 asar（让 electron 加载 app/）
mv "$DEST/resources/app.asar" "$DEST/resources/app.asar.original"
# 6. rcedit 嵌绿图标到 PromaPro.exe
cp "$DEST/Proma.exe" "$DEST/PromaPro.exe"
"$NODE" "$SKILL/scripts/set-exe-icon.cjs" "$DEST/PromaPro.exe" "$SKILL/assets/green.ico"
# 7. 生成 start-pro.bat + README.txt（模板替换 {{VERSION}}）
sed 's/{{VERSION}}/<版本>/g' "$SKILL/assets/start-pro.bat.tmpl" > "$DEST/start-pro.bat"
sed 's/{{VERSION}}/<版本>/g' "$SKILL/assets/README.txt.tmpl" > "$DEST/README.txt"
# 8. 打包 portable zip（排除原 Proma.exe + app.asar.original）
/c/Windows/System32/tar.exe -a -cf "E:/PromaPro-portable-<版本>.zip" \
  --exclude "Proma.exe" --exclude "app.asar.original" -C "E:/" "Proma-Pro-<版本>"
```

验证 zip：关键文件在（PromaPro.exe/start-pro.bat/dist/main.cjs/skia*.node）、排除项不在（Proma.exe/app.asar.original）。

## 资源清单

| 路径 | 用途 |
|---|---|
| `scripts/patch-main.cjs` | 核心补丁（变量名自动探测，9 锚点） |
| `scripts/extract-asar.cjs` | 纯 node 解包 asar（无依赖） |
| `scripts/read-asar.cjs` | 读 asar 单文件 / @list 顶层 |
| `scripts/merge-unpacked.cjs` | 合并 app.asar.unpacked → app/（原生模块） |
| `scripts/set-exe-icon.cjs` | rcedit 嵌 ico 到 exe |
| `scripts/build-ico.cjs` | png → ico（重新生成 green.ico 用） |
| `assets/green.ico` | 绿图标（多尺寸，可复用） |
| `assets/proma-emerald.png` | 绿图标 png 源（build-ico.cjs 输入 / 备用复制） |
| `assets/node_modules/` | rcedit / jimp / png-to-ico（自洽关键） |
| `assets/start-pro.bat.tmpl` · `README.txt.tmpl` | 启动脚本 / 部署说明模板（{{VERSION}} 占位） |
| `references/patch-anchors.md` | 9 锚点详解 + 副作用检查清单 |
| `references/known-pitfalls.md` | 历史踩坑（isPro 误判 / unpacked / 中文转义 / 变量名） |
| `references/version-baseline-0.15.7.md` | 0.15.7 基线对照 |

## 首次启动验证（部署后）

目标机器双击 `start-pro.bat`，在 Agent 会话：
- `list_available_agent_models` → 看到所有渠道模型（每个带 channelId）
- `delegate_agent(modelId=<其他渠道模型id>)` → 子会话跑在该渠道
- 数据在 `~/.proma-pro`（与原版 `~/.proma` 隔离）

首次需 UI 重配渠道（apiKey 是 DPAPI 绑机器）+ 重登录（OAuth 在 userData）。

## 何时改 patch-main.cjs

新版若：
- esbuild 变量名漂移 → **已自动处理**，无需改。
- `createAgentSession` 签名变（增减参数）→ 改 B3b 匹配串。
- `startDelegation`/`getAvailableAgentModels`/`getTrayIconPath` 重构 → 对照 `references/patch-anchors.md` 重设该锚点。
- 新增绕过 startDelegation 的子会话路径 → 加新补丁点。

改完回阶段 3-5 重跑侦察+审计。
