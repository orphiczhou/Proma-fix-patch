# 已知坑（必读）

## 1. isPro 误判（最高频）
**现象**：grep `isPro` 会命中 `isProblematic`/`isPromise`/`isPrototype`/`isPromaOfficialOpenAIReasoningModel` 等噪声，误以为"新版有 isPro 判定"。
**正解**：用 `isPro\b`（单词边界）精确搜索。0.14.23 和 0.15.7 上 `isPro\b` 都是零匹配——没有"激活 isPro 即可隔离"的捷径，Pro 数据隔离必须硬改字符串。
**教训**：不要相信子会话笼统的"isPro 存在"报告，要求它给精确 grep 命令和计数。

## 2. asar unpacked 合并（部署必做）
**现象**：`extract-asar.cjs` 按 offset 切 asar 二进制，对 header 标记 `unpacked: true` 的文件（skia.win32-x64-msvc.node 等原生模块）只写出 asar 开头的错误占位数据（大小对、内容错）。
**正解**：解包后必须 `merge-unpacked.cjs` 把 `app.asar.unpacked/` 合并覆盖到 `app/`。验证：对比 `app/node_modules/.../skia*.node` 与 `app.asar.unpacked/node_modules/.../skia*.node` 大小一致（0.15.7 都是 27,294,720）。
**不做的后果**：跨机器加载原生模块失败，canvas 渲染崩溃。

## 3. 中文 \uXXXX 转义
**现象**：main.cjs 里中文以 `\uXXXX` 存储（如"读取协作子会话可用模型"存为 `读取...`）。
**坑**：全局 decode 让中文变明文后，正则字面量里的 `\t`/`\n` 也会被解释成真实 tab/换行，`node --check` 报 invalid regex。
**正解**：patch-main.cjs 的 `enc()` 把匹配串里的真实中文转义成 `\uXXXX` 再匹配，写回保持 ASCII + \uXXXX。绝不全局 decode。

## 4. esbuild 变量名漂移
**现象**：每次 Proma 重新打包，esbuild 给 `import_electron`/`import_path` 分配的编号（48/49/10/11...）会变。硬编码数字的匹配串下次升级就失配。
**正解**：patch-main.cjs 用正则 `(\bimport_electron\d+)` / `(\bimport_path\d+)` 从 setPath 行和 trayIcon 行自动探测实际变量名。下次升级只要这两行结构不变，脚本自适应。

## 5. createAgentSession 第5参（0.15.7 新增）
**现象**：0.14.23 的 createAgentSession 调用是 4 参；0.15.7 多了第5参 `parent?.agentRuntime ?? "claude"`。
**坑**：若匹配串不含第5参，作为子串仍唯一匹配（替换后第5参自动保留），但有歧义风险。
**正解**：patch-main.cjs 的 B3b 匹配串显式含第5参。未来若签名再变，同步更新。

## 6. `??` 与 `||` 不可混用
**现象**：JS 语法不允许 `a ?? b || c` 直接混用（需括号）。
**正解**：注入的新代码统一用 `||` 链，避免和原有 `??` 冲突。

## 7. rcedit 改副本 exe（不是原件）
**现象**：原 `Proma.exe` 运行时被进程锁住，rcedit 改不了。
**正解**：`cp Proma.exe PromaPro.exe`，对副本 rcedit。start-pro.bat 启动 PromaPro.exe。

## 8. 跨机器部署的 DPAPI/OAuth
**现象**：渠道 apiKey 用 DPAPI 加密绑 Windows 用户；OAuth 登录态在 electron userData。跨机器复制 channels.json 会解密失败。
**正解**：portable 包首次启动需在 UI 重新配置渠道 + 重新登录。同用户同机器内复制 channels.json 到 ~/.proma-pro 可直接解密。

## 9. node 不在 PATH
**现象**：Proma 机器上 node 装在 `C:/Program Files/nodejs`，不在 git bash 的 PATH。
**正解**：所有 node 调用用绝对路径 `"C:/Program Files/nodejs/node.exe"`。

## 10. robocopy 退出码
**现象**：robocopy 退出码 1 表示"成功复制了文件"，但 bash 当成 error（非 0）中断。
**正解**：robocopy 退出码 0-7 都算成功（>=8 才是真错误）。在命令后 `; ec=$?` 捕获，不要让 `set -e` 或 `&&` 链误判。
