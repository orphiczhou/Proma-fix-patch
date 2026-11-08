---
name: proma-pro-repatch
description: 把 Proma 桌面应用（官方安装版）改造成 Pro 定制版——注入跨渠道协作子会话（开子会话时可选任意已启用渠道的模型）+ 1M 上下文（GPT-5.6 家族含池化变体，官方默认 200k/372k；智谱 GLM 与 DeepSeek 渠道全模型）+ Pro 数据隔离（~/.proma-pro，可与原版共存）+ 绿色图标 + 禁用自动更新（防 patch 被官方升级覆盖）。当用户要把 Proma 升级到新主线版本并重新打补丁、或提到"改造 Pro 版 / 跨渠道子会话 / 1M 上下文 / 重新打包 Proma-Pro / Proma 版本升级补丁 / Pro 副本 / proma-pro"时，务必使用本 skill。打包了完整补丁脚本、asar 工具、rcedit 图标工具链和 node_modules，独立自洽，按 6 阶段 SOP 执行：确认源版本 → 提取 main.cjs → 侦察锚点 → 应用补丁 → 审计 → 部署打包。当前基线 0.21.92（2026-11-09 重打并实测）。
---

# Proma-Pro 重新打补丁

把 Proma 官方安装版改造成 Pro 定制版。改造逻辑以 **bundle 补丁**形式注入打包后的 `main.cjs`（非源码 build——Proma 闭源，源码改动也曾被用户回退，改进只存在于 bundle）。

## 四块改造

1. **跨渠道子会话**：开协作子会话时可指定任意已启用渠道的模型（默认只能用父会话当前渠道）。注入 `listEnabledAgentModelsAcrossChannels` + `resolveChannelForAgentModel`，改 `getAvailableAgentModels` 列所有渠道模型、`startDelegation` 经 `effectiveChannelId` 把子会话挂到目标渠道。
2. **1M 上下文（E 组）**：① GPT-5.6 家族及池化变体（gpt-5.6-terra-1、sol-az 等）：官方只精确匹配无尾缀 ID/给 372k，补丁改前缀匹配统一 1e6（OpenAI 官方规格 1,050,000）。② 智谱 GLM 与 DeepSeek 渠道全模型 1M（用户渠道实际开放；官方规则表只列部分型号，补丁改为 "glm-"/"deepseek-" 前缀匹配）。claude、kimi-k3、minimax-m3、qwen、gemini-3.x 官方已原生 1M。
3. **Pro 数据隔离**：业务数据 `~/.proma-pro`、electron userData `@proma/electron-pro`，与原版（`~/.proma`）完全隔离，单实例锁独立，可与原版同时运行。
4. **绿色图标 + 禁用自动更新**：托盘用 `proma-emerald.png`、exe 嵌 `green.ico`（改副本 `PromaPro.exe`——原 `Proma.exe` 运行时被锁改不了）；`app-update.yml` 断源防止官方升级覆盖 patch。

> 历史：0.15.7 曾有"跨内核子会话"（agentRuntime=pi）补丁组，0.19.53 官方退役 Claude runtime 后永久作废；0.19.53 曾有"opencode-go 的 GLM-5.3 zai 字段修复"，0.21.92 官方停用 `opencode-go-openai` 渠道后作废。两块都只存档，不要重打。

## 前置条件

- **Windows x64**（rcedit、skia 原生模块都绑 win32-x64-msvc）。
- **node 运行时**：skill 自带 `assets/node_modules`（rcedit/png-to-ico 等，git 不含、部署机需 `npm install`），但需 node 解释器 v22+。
- **Proma 官方母本**（三选一）：
  - **已安装目录**（最省事，0.21.92 实测）：`MSYS_NO_PATHCONV=1 robocopy "D:\Proma" "D:\Proma-Pro-<版本>" /E /R:1 /W:1`，运行中的 Electron 目录可直接读复制，736 文件 0 失败。
  - 更新器缓存安装包：`%LOCALAPPDATA%\@promaelectron-updater\pending\Proma-<版本>-setup.exe`，7za 直接解出完整应用目录（**不要运行安装器**——可能关闭正在运行的 Proma）。0.21.92 起缓存可能只剩 `%LOCALAPPDATA%\@promaelectron-updater\installer.exe`（同版本，版本号看 `VersionInfo`）。
  - 已安装目录的 `resources/app.asar` + `read-asar.cjs` 单独提取 main.cjs。
- **版本来源**：`https://api.proma.cool/api/v1/updates/latest.yml`（官方更新器通道，当前 0.21.92，2026-11-04）。**GitHub releases 只更新到 0.19.58，别拿它判断最新版。**

## 关键约束（违反会损坏 main.cjs）

- main.cjs 是 esbuild bundle，**中文以 `\uXXXX` 转义存储**。匹配前用 `enc()` 转义，**绝不全局 decode**（会破坏正则字面量里的 `\t`/`\n`，导致 `node --check` 报 invalid regex）。注释里的中文是明文，含注释行的锚点只匹配纯 ASCII 代码行。
- `??` 与 `||` 不可混用（JS 语法），注入新代码统一用 `||` 链。
- 解包 asar 后**必须合并 `app.asar.unpacked/`** 到 `app/`（原生模块占位是坏的），否则加载 skia 失败。
- **安装器不可静默运行**：electron-builder NSIS 检测到运行中的 Proma 可能强杀进程（正在跑 Agent 会话的宿主）。一律 7za 解包或直接复制安装目录。
- **整函数逐字匹配脆**：官方改一句 `note` 文案就 0 命中（0.21.92 的 B2 就是这么崩的）。结构没变时改用区间替换（`range()`）。
- **rcedit v5 只导出 exports**：绝对路径 require 会 MODULE_NOT_FOUND，要么本地 `npm i rcedit`，要么 `module.paths.push(<global node_modules>)` 后按包名 require。

## 完整流程（6 阶段，勿跳步）

侦察（阶段3）和审计（阶段5）是跨版本收敛的关键。

### 阶段 1：确认源版本

```bash
# 查最新版本（官方更新器通道）
curl -s https://api.proma.cool/api/v1/updates/latest.yml
# 版本号确认：读 asar 内 package.json（不要靠 exe 文件名）
"$NODE" "$SKILL/scripts/read-asar.cjs" "D:/Proma/resources/app.asar" package.json | head -3
# 更新器缓存
ls -la "$LOCALAPPDATA/@promaelectron-updater/" "$LOCALAPPDATA/@promaelectron-updater/pending/" 2>/dev/null
```

记下 `<版本>`。母本优先 robocopy 已安装目录（阶段 6 步骤 0 会直接得到部署目录）；否则 7za 解安装包。

### 阶段 2：提取 main.cjs

```bash
NODE="D:/nodejs/node.exe"   # 按机器实际
SKILL="<skill目录>"
WORK="<临时工作目录>"

"$NODE" "$SKILL/scripts/read-asar.cjs" "<母本>/resources/app.asar" dist/main.cjs > "$WORK/main-orig.cjs"
"$NODE" --check "$WORK/main-orig.cjs"
```

确认未 minify（grep `getChannelsPath`、`startDelegation`、`getTrayIconPath` 应命中）。若 minify 了，锚点匹配失效——停下告知用户。

### 阶段 3：侦察锚点（关键，勿跳）

对照 `references/patch-anchors.md`，逐项 grep 确认锚点在新版的状态。**历史教训**：

- **`isPro` 精确搜索**：用 `isPro\b`（单词边界）搜，不要裸搜 `isPro`（命中 isProblematic/isPromise 噪声）。
- **跨行匹配块别用整段单行 grep**（0 匹配 ≠ 锚点消失，先用单行特征串定位再读上下文）。
- **先扫官方架构变化**：`grep -n "function createAgentSession\|function launchDelegation\|opencode\|getEnabledAgentModelSource\|function inferCodexAlignedGPT5ContextWindow"`，再决定每个补丁组是"照打 / 改锚点 / 作废"。
- 对照 `references/version-baseline-<版本>.md`（现有 0.15.7 / 0.19.53 / 0.21.92）看差异。

**产出**：每锚点状态（存在不变 / 签名变化 / 消失 / 新增）。若有变化，先适配 `scripts/patch-main.cjs` 对应匹配串（esbuild 变量名漂移已自动处理，通常只需改函数签名相关串）。

### 阶段 4：应用补丁

```bash
cp "$WORK/main-orig.cjs" "$WORK/main-patched.cjs"
"$NODE" "$SKILL/scripts/patch-main.cjs" "$WORK/main-patched.cjs"
```

脚本自动探测 esbuild 变量名，应用 0.21.92 的 11 个改动点（A1/A2/B1/B2/B2b/B3a/B3b/B3c/C/E1/E2a/E2b）。**若 throw "期望1处匹配，实际0处"**：该锚点变了，回阶段3按 `references/patch-anchors.md` 适配后重跑。0.19.53 版脚本在 `scripts/archive/patch-main-0.19.53.cjs`。

### 阶段 5：审计

```bash
"$NODE" --check "$WORK/main-patched.cjs"   # 语法
# 计数验证（0.21.92 期望：across=2, resolve=2, eff=3, promapro=3, elepro=2, emerald=1, e1=1, e2a=1, e2b=1）
"$NODE" -e "const s=require('fs').readFileSync(process.argv[1],'utf8');const c=x=>s.split(x).length-1;console.log({across:c('listEnabledAgentModelsAcrossChannels'),resolve:c('resolveChannelForAgentModel'),eff:c('effectiveChannelId'),promapro:c('.proma-pro'),promadev:c('.proma-dev'),elepro:c('electron-pro'),eledev:c('electron-dev'),emerald:c('proma-emerald.png'),e2a:c('deepseek: [\"deepseek-\"]'),e2b:c('glm: [\"glm-\"]'),e1:c('/^gpt-5\\\\.6(?:-[a-z0-9]+)*$/.test(model)) return 1e6')});" "$WORK/main-patched.cjs"
# diff 审计：hunks 数应与锚点组数一致（0.21.92 = 10 hunks）
diff -u "$WORK/main-orig.cjs" "$WORK/main-patched.cjs" > "$WORK/patch.diff"; grep -c '^@@' "$WORK/patch.diff"
```

对抗性检查（清单见 `references/patch-anchors.md`）：diff 确认改动恰好预期锚点；`createAgentSession` 其他调用点不应被改；注入函数作用域内 `listChannels`/`getChannelById`/`getEnabledAgentModelSource` 可见。

### 阶段 6：部署打包

目标：`D:/Proma-Pro-<版本>/`（旧 Pro 目录保留作回滚）+ `D:/PromaPro-portable-<版本>.zip`。

```bash
DEST="D:/Proma-Pro-<版本>"
# 0. 母本 → DEST
#    已安装目录：MSYS_NO_PATHCONV=1 robocopy "D:\Proma" "D:\Proma-Pro-<版本>" /E /R:1 /W:1（退出码 0-7 都成功）
#    安装包解出的目录：mv 成 DEST
# 1. 解包 app.asar -> app/（0.21.92：12,670 文件，约 25 秒）
"$NODE" "$SKILL/scripts/extract-asar.cjs" "$DEST/resources/app.asar" "$DEST/resources/app"
# 2. 合并 app.asar.unpacked -> app/（覆盖原生模块占位，必做！0.21.92：382 文件）
"$NODE" "$SKILL/scripts/merge-unpacked.cjs" "$DEST/resources"
# 3. 注入 patched main.cjs
cp "$WORK/main-patched.cjs" "$DEST/resources/app/dist/main.cjs"
# 4. 禁用 asar（让 electron 加载 app/）
mv "$DEST/resources/app.asar" "$DEST/resources/app.asar.original"
# 5. rcedit 嵌绿图标到 PromaPro.exe（需 assets/node_modules 或本地 npm i rcedit）
cp "$DEST/Proma.exe" "$DEST/PromaPro.exe"
"$NODE" "$SKILL/scripts/set-exe-icon.cjs" "$DEST/PromaPro.exe" "$SKILL/assets/green.ico"
# 6. icon.ico 补齐（消除 "App icon not found" 告警，统一绿图标）
mkdir -p "$DEST/resources/app/dist/resources"
# assets/green.ico 应为 408142 字节（绿色多尺寸）；缺失或不确定时从 proma-emerald.png 重建：
# node "$SKILL/scripts/build-ico.cjs" "$DEST/resources/proma-logos/proma-emerald.png" "$SKILL/assets/green.ico"
# 警告：不要从旧部署目录复制 icon.ico——那是官方黑白 logo（见 known-pitfalls #10）
cp "$SKILL/assets/green.ico" "$DEST/resources/app/dist/resources/icon.ico"
cp "$SKILL/assets/green.ico" "$DEST/resources/icon.ico"
# 7. 禁用自动更新（防官方升级覆盖 patch！）
printf 'provider: generic\nurl: https://127.0.0.1/proma-pro-auto-update-disabled/\nupdaterCacheDirName: '"'"'@promaelectron-updater'"'"'\n' > "$DEST/resources/app-update.yml"
# 8. 生成 start-pro.bat + README.txt（模板替换 {{VERSION}}）
sed 's/{{VERSION}}/<版本>/g' "$SKILL/assets/start-pro.bat.tmpl" > "$DEST/start-pro.bat"
sed 's/{{VERSION}}/<版本>/g' "$SKILL/assets/README.txt.tmpl" > "$DEST/README.txt"
# 9. 打包 portable zip（排除原 Proma.exe + app.asar.original）
/c/Windows/System32/tar.exe -a -cf "D:/PromaPro-portable-<版本>.zip" \
  --exclude "Proma.exe" --exclude "app.asar.original" -C "D:/" "Proma-Pro-<版本>"
```

验证 zip：关键文件在（PromaPro.exe/start-pro.bat/resources/app/dist/main.cjs/resources/icon.ico/resources/app/dist/resources/icon.ico）、排除项不在（Proma.exe/app.asar.original）。

## 首次启动验证（部署后）

同机升级：`~/.proma-pro` 数据与登录态直接继承（DPAPI 同用户可解密），首次启动自动迁移 → **升级前先备份**：整目录复制 `~/.proma-pro`，并把关键 json 备份到 `~/.proma-pro/.bak-pre-<版本>/`。跨机器：需 UI 重配渠道 + 重登录。

启动 `start-pro.bat`（内部 `PROMA_DEV=1` + `PromaPro.exe`），逐项验证：

1. **进程与数据目录**：`Get-Process PromaPro` 有主窗口；`%APPDATA%\@proma\electron-pro` 与 `~/.proma-pro` 在启动后被写入 → 隔离生效。
2. **版本与图标**：`(Get-Item PromaPro.exe).VersionInfo.ProductVersion` = 新版本；`[System.Drawing.Icon]::ExtractAssociatedIcon()` 存 PNG 看是否绿色（408,142 字节 ico）。
3. **跨渠道子会话（核心）**：起 App 后 `--remote-debugging-port=<port>` + CDP（或手动）在会话里跑：
   - `mcp__collaboration__list_available_agent_models` → 返回多渠道模型，每项带 `channelId`/`channelName`/`provider`，且有 `channelCount`
   - `delegate_agent(modelId=<其他渠道模型>)` → 子会话 metadata `channelId`/`modelId` 落在目标渠道；子会话 JSONL 的 `result._channelProvider` 是目标 provider
   - 0.21.92 实测：父 GLM(glm-5.3/zhipu-coding) → 子 deepseek-flash/deepseek，回复「跨渠道 OK」
4. **1M 上下文**：GLM 渠道任意模型（含 glm-3.x/4.x/5/5-turbo/5.1/4.6v）、DeepSeek 渠道任意模型、gpt-5.6 全系（含尾缀变体）在 UI 用量条分母为 1M；gpt-5.4/5.5 维持 272k、gpt-6 系 372k、MiniMax-M2.7 维持 200k。
5. **更新器断源**：log 出现 `[更新-updater] Error: net::ERR_CONNECTION_REFUSED`（或启动后无升级提示）。

验证完清理：删掉调试实例（`Stop-Process`）再正常 `start-pro.bat` 重启，别把 `--remote-debugging-port` 留在用户机器上；测试会话用 `electronAPI.deleteAgentSession` 删除。

## 何时改 patch-main.cjs

新版若：
- esbuild 变量名漂移 → **已自动处理**，无需改。
- `createAgentSession` 签名变 → 改 B3b 匹配串（保留新参数，只把 channelId 参数改 effectiveChannelId）。
- `startDelegation`/`getAvailableAgentModels`/`getTrayIconPath`/`inferCodexAlignedGPT5ContextWindow` 重构 → 对照 `references/patch-anchors.md` 重设该锚点；纯文案变动优先改区间替换，别死磕逐字匹配。
- 官方扩了 1M 规则表（如新 glm/qwen/claude 型号）→ E1/E2 范围可收窄（只补官方未覆盖的家族）。
- 官方恢复多 runtime → 参考 git 历史找回 D 组（跨内核）补丁。
- 官方停用/恢复某个 provider（如 opencode-go）→ 按 patch-anchors 的作废/复现说明处理。

改完回阶段 3-5 重跑侦察+审计，并把新基线写进 `references/version-baseline-<版本>.md`。

## 资源清单

| 路径 | 用途 |
|---|---|
| `scripts/patch-main.cjs` | 核心补丁（0.21.92 基线，变量名自动探测，11 个改动点） |
| `scripts/archive/patch-main-0.19.53.cjs` | 0.19.53 版补丁脚本（历史） |
| `scripts/extract-asar.cjs` | 纯 node 解包 asar（无依赖） |
| `scripts/read-asar.cjs` | 读 asar 单文件 / `@list` 顶层（也可读 package.json 确认版本） |
| `scripts/merge-unpacked.cjs` | 合并 app.asar.unpacked → app/（原生模块） |
| `scripts/set-exe-icon.cjs` | rcedit 嵌 ico 到 exe |
| `scripts/build-ico.cjs` | png → ico（重新生成 green.ico 用） |
| `assets/green.ico` | 绿图标（多尺寸 408,142 字节，可复用，md5 b46e2eef4397c1fa04d7c995ebdb3b5a） |
| `assets/proma-emerald.png` | 绿图标 png 源 |
| `assets/node_modules/` | rcedit / png-to-ico（**git 不含，部署机 npm install**） |
| `assets/start-pro.bat.tmpl` · `README.txt.tmpl` | 启动脚本 / 部署说明模板（{{VERSION}} 占位） |
| `references/patch-anchors.md` | 锚点详解 + 已作废补丁组 + 副作用检查清单 |
| `references/known-pitfalls.md` | 历史踩坑（20 条） |
| `references/version-baseline-0.15.7.md` · `0.19.53` · `0.21.92` | 版本基线对照 |
