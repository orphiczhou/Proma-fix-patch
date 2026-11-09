# 已知坑（必读）

## 1. isPro 误判（最高频）
**现象**：grep `isPro` 会命中 `isProblematic`/`isPromise`/`isPrototype` 等噪声，误以为"新版有 isPro 判定"。
**正解**：用 `isPro\b`（单词边界）精确搜索。0.14.23 / 0.15.7 / 0.19.53 上 `isPro\b` 都是零匹配——没有"激活 isPro 即可隔离"的捷径，Pro 数据隔离必须硬改字符串。
**教训**：不要相信子会话笼统的"isPro 存在"报告，要求它给精确 grep 命令和计数。

## 2. asar unpacked 合并（部署必做）
**现象**：`extract-asar.cjs` 按 offset 切 asar 二进制，对 header 标记 `unpacked: true` 的文件（skia.win32-x64-msvc.node 等原生模块）只写出错误占位数据。
**正解**：解包后必须 `merge-unpacked.cjs` 把 `app.asar.unpacked/` 合并覆盖到 `app/`。验证：对比 `app/node_modules/**/skia*.node` 与 `app.asar.unpacked/**/skia*.node` 字节一致（0.15.7 与 0.19.53 均为 27,294,720 字节；注意 0.19.53 路径变为嵌套 `@napi-rs/canvas/node_modules/@napi-rs/canvas-win32-x64-msvc/`）。
**不做的后果**：跨机器加载原生模块失败，canvas 渲染崩溃。

## 3. 中文转义：注释是明文、字符串才是 \uXXXX（0.19.53 新认知）
**现象**：main.cjs 里**字符串字面量**的中文以 `\uXXXX` 存储，但**注释**里的中文是明文（esbuild asciiOnly 只作用于字符串）。
**坑**：匹配串若包含中文注释行，enc() 会把注释汉字转义成 \uXXXX 导致失配（"期望1处匹配，实际0处"）。
**正解**：patch-main.cjs 的 `enc()` 只用于含中文字符串字面量的匹配串；含注释行的锚点（如 E2）只匹配纯 ASCII 代码行。仍绝不全局 decode。

## 4. esbuild 变量名漂移
**现象**：每次 Proma 重新打包，esbuild 给 `import_electron`/`import_path` 分配的编号会变（0.15.7 是 49/11/10，0.19.53 是 59/10/9）。
**正解**：patch-main.cjs 用正则从 setPath 行和 trayIcon 行自动探测实际变量名。下次升级只要这两行结构不变，脚本自适应。

## 5. 官方安装器不可静默运行（0.19.53 实践）
**现象**：想用 `setup.exe /S /D=<dir>` 静默安装提取母本。
**坑**：electron-builder NSIS 检测到正在运行的 Proma（比如正跑着 Agent 会话的原版）可能弹窗等待或强杀进程——直接杀死当前工作会话。
**正解**：用 7za 直接解包 setup.exe（`7za x -o<dir> setup.exe '-xr!$PLUGINSDIR' '-xr!$*'`），得到完整应用目录（0.19.53 实测 828 文件，含 resources/app.asar）。安装包优先取更新器缓存 `%LOCALAPPDATA%\@promaelectron-updater\pending\`（通常已下载好最新版）。

## 6. 跨大版本锚点漂移（0.15.7 → 0.19.53 实录）
**现象**：0.19.53 里 B3b/B3c/D 组锚点全部失配。
**原因**：官方退役 Claude runtime——`createAgentSession` 第 5 参 agentRuntime 移除（回 4 参）、局部变量 child→child2、`resolveDelegationPermissionMode` 回 2 参、agentRuntime 在 settings/automation/session 全按 legacy 剥离。
**正解**：先 `grep -n "function createAgentSession\|agentRuntime" main-orig.cjs` 看官方架构变化，再决定适配或作废补丁组。跨内核（D 组）因官方统一 Pi runtime 而永久作废——补丁要跟官方架构演进对齐，不要硬打。

## 7. `??` 与 `||` 不可混用
**现象**：JS 语法不允许 `a ?? b || c` 直接混用。
**正解**：注入的新代码统一用 `||` 链。

## 8. rcedit 改副本 exe（不是原件）
**现象**：原 `Proma.exe` 运行时被进程锁住，rcedit 改不了。
**正解**：`cp Proma.exe PromaPro.exe`，对副本 rcedit。start-pro.bat 启动 PromaPro.exe。

## 9. 自动更新会毁掉 patch（0.19.53 新增坑）
**现象**：Electron updater 初始化后"空闲时自动安装"官方新版，整个 resources 目录被替换——app/ 目录、patched main.cjs、app.asar.original 全部没了，Pro 版退化为官方版且数据目录逻辑丢失。
**正解**：部署时把 `resources/app-update.yml` 的 url 改为 `https://127.0.0.1/proma-pro-auto-update-disabled/`。验证：启动 log 出现 `[更新-updater] Error: net::ERR_CONNECTION_REFUSED`。（0.14.23 旧 Pro 没处理过这个，是长期隐患。）

## 10. icon.ico 缺失告警与黑白 logo 陷阱（0.19.53 实踩）
**现象**：启动 log `App icon not found at: ...resources\app\dist\resources\icon.ico`（无害告警）；补齐后任务栏窗口图标变黑。
**根因有两层**：① 0.19.53 `getIconPath2()` 按 `__dirname/resources/icon.ico` 找窗口图标（asar 内不存在，官方版 fallback 到 exe 内嵌图标）；② **旧部署目录（如 0.14.23 的 D:\Proma-Pro\resources\）里的 icon.ico/icon.png 是官方黑白 logo，不是绿色版**——把它当绿图标复制会同时污染窗口 icon 与 rcedit 嵌入的 exe 图标，任务栏变黑。
**正解**：用 `build-ico.cjs` 从官方 `proma-logos/proma-emerald.png` 重新生成多尺寸绿色 ico（256-16 七档，输出 408,142 字节，与仓库 assets/green.ico 同源可互验）；再复制到 `resources/icon.ico` + `resources/app/dist/resources/icon.ico` 两处，并用它 rcedit。复用任何二进制资源前先视觉确认颜色。
**验证**：重启后 log 无 "App icon not found"；任务栏窗口按钮为绿色。若 exe 文件图标仍显示旧色，是 Windows 图标缓存延迟（重启 explorer 或等待刷新），不影响任务栏窗口图标。

## 11. 跨机器部署的 DPAPI/OAuth
**现象**：渠道 apiKey 用 DPAPI 加密绑 Windows 用户；OAuth 登录态在 electron userData。跨机器复制 channels.json 会解密失败。
**正解**：portable 包跨机器首次启动需重新配置渠道 + 重新登录。**同机同用户**升级则直接继承（0.14.23→0.19.53 实测：Cloud Auth 会话恢复成功、渠道自动迁移，无需任何重配）。

## 12. node 不在 PATH
**现象**：git bash 的 PATH 里可能没有 node。
**正解**：所有 node 调用用绝对路径，或先探测（`D:/nodejs/node.exe`、`C:/Program Files/nodejs/node.exe`）。

## 13. robocopy 退出码
**现象**：robocopy 退出码 1 表示"成功复制了文件"，但 bash 当成 error。
**正解**：robocopy 退出码 0-7 都算成功（>=8 才是真错误）。在命令后 `; ec=$?` 捕获。

## 14. GitHub 直连超时（国内网络）
**现象**：git clone / codeload zip 大文件超时，api.github.com 却可达。
**正解**：小文件走 `raw.githubusercontent.com` 逐个下载（<100KB 稳定）；大文件（icon、skill 分发包）从本机旧部署复制或 npm 重建；仓库更新若 push 超时，改用 GitHub Contents API 逐文件 PUT。

## 15. 官方改一句文案就让整函数匹配失效（0.21.92 实踩）

**现象**：0.19.53 用「整个 `function getAvailableAgentModels(ctx) {...}` 逐字匹配」的 B2，在 0.21.92 上 0 命中——官方只改了函数里的 `note` 文案和工具描述，结构完全没变。
**正解**：这类"整函数替换"锚点改用**区间替换**（起点函数声明 + 终点下一个函数声明），只依赖函数边界不依赖内部文案。patch-main.cjs 里 `range()` 就是干这个的；起点/终点必须各自唯一。
**延伸**：同理，`list_available_agent_models` 的工具描述是中文 `\uXXXX` 字符串，改它属于可选增强（B2b）；不改也不影响功能，只影响模型能否发现跨渠道能力。

## 16. 官方停用渠道会整块作废补丁（0.21.92：opencode-go）

**现象**：0.19.53 花大力气做的"GLM-5.3 在 OpenCode Go 上 400 修复"（endpoint-aware zai 字段），在 0.21.92 里毫无意义——官方 `buildModel` 直接 `throw "OpenCode Go 渠道已停用"`，compat 分支全删。
**正解**：重打前先 `grep -n "opencode\|<受影响 provider>" main-orig.cjs`，确认 provider 还在、相关函数还在，再决定是否重打；停用/重构的补丁组直接归档进 patch-anchors 的"已作废"区，不要硬打。
**教训**：补丁是对官方实现细节的寄生，官方删功能比改结构更彻底。

## 17. rcedit v5 不能用绝对路径 require（0.21.92 实踩）

**现象**：`require('C:/Users/<user>/AppData/Roaming/npm/node_modules/rcedit')` 报 MODULE_NOT_FOUND，但目录确实存在。
**根因**：rcedit v5 的 package.json 只有 `exports`、没有 `main`；按目录绝对路径 require 不解析 exports。
**正解**：二选一——① 在项目里 `npm i rcedit` 后按包名 require；② `module.paths.push(<全局 node_modules 绝对路径>)` 再 `require('rcedit')`（走 exports 解析）。仓库脚本 `set-exe-icon.cjs` 用的是后者（指向 `assets/node_modules`）。
**验证**：改完用 PowerShell `Get-Item <exe> | % VersionInfo` 看版本号，再 `[System.Drawing.Icon]::ExtractAssociatedIcon(<exe>)` 存 PNG 肉眼确认颜色。

## 18. 母本可直接复制运行中的安装目录（0.21.92 新路线）

**现象**：不想每次找 7za 解 setup.exe，尤其更新器缓存只剩 `installer.exe` 时。
**做法**：`MSYS_NO_PATHCONV=1 robocopy "D:\Proma" "D:\Proma-Pro-<版本>" /E /R:1 /W:1`。运行中的 Electron 安装目录可读复制（exe/asar/原生模块都能复制），0.21.92 实测 736 文件 0 失败、2 秒完成。
**注意**：① git bash 里 `/E` 会被路径转换吃掉，必须加 `MSYS_NO_PATHCONV=1`；② robocopy 退出码 0-7 都算成功；③ 复制后先 `node read-asar.cjs <asar> package.json` 确认版本，别把旧版当母本；④ 用户数据（`~/.proma`）不在安装目录，不会被复制。
**何时仍用 7za**：需要干净的官方安装树（含卸载器/许可文件）或本机没有已装同版本时。

## 19. 渲染层验证：CDP 比截图可靠（0.21.92 实践）

**做法**：用 `PROMA_DEV=1` + `--remote-debugging-port=<port>` 起 Pro，`curl http://127.0.0.1:<port>/json/list` 拿 `webSocketDebuggerUrl`，Node 内置 `WebSocket` 直接 `Runtime.evaluate`。
**能干什么**：读 `document.body.innerText` 确认版本/会话/模型标签；`window.electronAPI` 有 429 个 IPC 方法（`listChannels` / `listAgentSessions` / `deleteAgentSession` 等），可用来清理测试数据；`Input.insertText` + `Input.dispatchKeyEvent` 能把消息真正发进会话，端到端验证 `delegate_agent` 跨渠道。
**安全**：验证完必须关掉带调试端口的实例再正常重启（否则局域网内可被 CDP 控制）；测试会话用 `deleteAgentSession` 删掉，别污染用户历史。
**注意**：主进程补丁函数不在渲染层作用域，CDP 只能验证"行为/界面/数据落盘"，不能直接调用 `resolveChannelForAgentModel`。

## 20. asar 头偏移（自己写解析时）

**格式**：`[0,4)` pickle 长度=4、`[4,8)` headerSize、`[8,12)` payload、`[12,16)` JSON 字符串长度、`[16, 16+len)` header JSON；数据区 base = `8 + headerSize`。
**坑**：从 `[8, ...)` 开始解析或把 `[12,16)` 当 headerSize 都会得到 `{r2 {` 之类的乱码，报 "Unexpected token"。
**正解**：直接用仓库的 `read-asar.cjs` / `extract-asar.cjs`，别手写。

## 21. “某个模型上下文还是 200k”——先查启动的是哪个实例（2026-11-09 实踩）

**现象**：用户报「Proma Pro 里 glm-5.3 上下文还是 200k」，但 0.21.92 的补丁和 pi 目录都已经是 1M。
**根因**：桌面「Proma Pro」快捷方式仍指向旧的 `D:\Proma-Pro`（0.14.23）。那版 `ONE_MILLION_CONTEXT_RULES` 只有 `glm: ["glm-5.2"]`（且没有 E1/E2），glm-5.3 落默认 200k；新部署在 `D:\Proma-Pro-0.21.92`，从没被启动过。
**诊断顺序**（别先怀疑补丁）：`Get-Process PromaPro | % Path`（实际在跑哪个 exe）→ 快捷方式 `TargetPath` → 该目录 `resources/app/package.json` 的 version → 该版本 main.cjs 的 `glm:` / `deepseek:` 规则。
**为什么容易误判**：Pro 的多个版本目录共用 `~/.proma-pro` 与 `@proma/electron-pro`（同一个单实例锁）。所以数据目录、会话列表、登录态在旧版和新版里看起来完全一样，**只有进程路径能区分**；旧实例还开着时，启动新版会因单实例锁直接退出。
**正解**：把桌面快捷方式指到当前版本；更彻底的是让 `D:\Proma-Pro` 始终是最新版（见 #22），旧版本改成带版本号的目录。

## 22. 目录换位/改名被占用：Device or resource busy（2026-11-09 实踩）

**现象**：应用已退出，`mv D:\Proma-Pro-0.21.92 D:\Proma-Pro` 仍报 `Device or resource busy`。
**根因**：本会话的终端 Tab 以 `D:\Proma-Pro-0.21.92` 作为 cwd（启动验证用），shell 握着目录句柄；Windows 不允许重命名被占用的目录。
**正解**：关应用 → 关掉或切走任何 cwd 在该目录的终端/进程（`TerminalList`/`TerminalClose`，必要时 `Get-Process | ? Path -like '<dir>*'`）→ 再改名。顺序：旧版改成带版本名 → 新版的带版本目录改成规范名 → 最后改快捷方式 Target/WorkDir/Icon。
**换位后校验**：`main.cjs` 的 md5 应等于补丁产物（0.21.92 为 `4c37431d4ce113c640272be680c2e35d`）；`.proma-dev` 残留 0；两处 icon.ico 均 408,142 字节；`app-update.yml` 仍是断源地址。

## 23. 上下文窗口在 UI 里看不到，验证要靠代码链（2026-11-09 核对）

**现象**：想截图证明 glm-5.3 是 1M，界面上找不到分母；模型名旁 tooltip 只有「渠道：GLM」；`window.electronAPI` 有 429 个 IPC，但没有 agent 流事件订阅（无 `onAgentStream*`），`listChannels` / `listAgentSessions` / `listActiveAgentSessionSnapshots` 都不返回 contextWindow——只有流事件 `usage_update` 里带。
**可复现的判定链**：
1. pi 目录 `resources/app/node_modules/@earendil-works/pi-ai/dist/providers/data/zai-coding-cn.json` 的 `chat:glm-5.3` → `contextWindow: 1000000`；
2. 渠道 models 没有 `contextWindow` 字段、会话 meta 没有 `modelContextWindow`（该字段只在官方 Proma 模型时写入）→ `configuredContextWindow` 为空；
3. 因此走 `Math.max(catalog 1e6, inferred 1e6)` = 1M；
4. `scripts/verify-context-window.cjs` 直接跑 patched main.cjs，16 条断言（gpt-5.6 变体 / glm / deepseek / 排除项）全过，orig 对照 6 条失败。
**顺带**：RDP 断开或锁屏时，PowerShell `CopyFromScreen` 会报 `The handle is invalid`；截图改用 CDP `Page.captureScreenshot`（可带 `clip` 与 `scale`），不依赖交互桌面。
