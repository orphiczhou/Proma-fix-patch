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

## 10. icon.ico 缺失告警（0.19.53 新增）
**现象**：启动 log `App icon not found at: ...resources\app\dist\resources\icon.ico`。
**原因**：0.19.53 `getIconPath()` 按 `__dirname/resources/icon.ico` 找（asar 内该路径不存在，官方版同样告警，无害）；另有主窗口按 `<resources>/icon.ico` 找。
**正解**：部署时把 green.ico 复制到 `resources/app/dist/resources/icon.ico` 和 `resources/icon.ico` 两处，消除告警并统一绿图标。

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
