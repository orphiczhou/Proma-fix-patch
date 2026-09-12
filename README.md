# Proma Pro Fix Patch

把 Proma 桌面应用（官方安装版）改造成 Pro 定制版的 bundle 补丁工具集。

## 改造能力（4 块）

1. **跨渠道子会话**：协作子会话（delegate_agent）可指定任意已启用渠道的模型，突破父会话当前渠道限制
2. **GPT-5.6 家族 1M 上下文**：gpt-5.6-sol/terra/luna 及其池化变体（terra-1、sol-az 等）contextWindow 从 200k/372k 提到 1M（OpenAI 官方规格 1,050,000）；glm-5.2/5.3、claude、deepseek、kimi-k3、minimax-m3、gemini 等官方已原生 1M
3. **Pro 数据隔离**：业务数据 `~/.proma-pro`、electron userData `@proma/electron-pro`，与原版完全隔离，可同时运行
4. **绿色图标 + 禁用自动更新**：托盘 + exe 绿图标；app-update.yml 断源，防止官方自动升级覆盖 patch

> 0.15.7 曾有"跨内核子会话"（agentRuntime=pi）补丁组；0.19.53 官方已退役 Claude runtime 统一 Pi，该组作废。

## 前置条件

- **Windows x64**（rcedit、skia 原生模块均绑定 win32-x64-msvc）
- **Node.js v22+**
- **Proma 官方安装包或安装版**：优先复用更新器缓存 `%LOCALAPPDATA%\@promaelectron-updater\pending\`（7za 直接解包，勿运行安装器——可能强杀运行中的 Proma）

## 快速开始

参见 [SKILL.md](./SKILL.md) 的完整 6 阶段 SOP：

1. 确认源版本
2. 提取 main.cjs
3. 侦察锚点
4. 应用补丁
5. 审计
6. 部署打包

## 项目结构

```
Proma-fix-patch/
├── SKILL.md                          # 完整 SOP 文档
├── README.md                         # 本文件
├── proma-pro-repatch.skill           # Proma Skill 分发包
├── scripts/
│   ├── patch-main.cjs                # 核心补丁脚本（跨渠道 + 1M 上下文 + 数据隔离 + 图标）
│   ├── extract-asar.cjs              # asar 解包工具
│   ├── merge-unpacked.cjs            # 合并 @electron 原生模块
│   ├── read-asar.cjs                 # asar 读取工具
│   ├── build-ico.cjs                 # 绿色图标生成
│   └── set-exe-icon.cjs              # exe 图标替换
├── references/
│   ├── patch-anchors.md              # 各补丁锚点详解
│   ├── version-baseline-0.15.7.md    # 0.15.7 版本基线
│   ├── version-baseline-0.19.53.md   # 0.19.53 版本基线
│   └── known-pitfalls.md             # 已知坑点和注意事项
└── assets/
    ├── green.ico                     # 绿色图标
    ├── proma-emerald.png             # 托盘图标
    ├── start-pro.bat.tmpl            # 启动脚本模板
    └── README.txt.tmpl               # 说明文件模板
```

## 支持的版本

| Proma 版本 | 补丁状态 |
|-----------|---------|
| 0.19.53 | ✅ 已验证（当前基线） |
| 0.15.7 | ✅ 已验证（历史基线，D 组跨内核补丁仅存于此期） |

## 关键约束

- main.cjs 是 esbuild bundle，中文以 `\uXXXX` 转义存储，匹配前需转义
- `??` 与 `||` 不可混用，注入新代码统一用 `||`
- 解包 asar 后必须合并 `app.asar.unpacked/` 到 `app/`
- 不要运行官方安装器做母本提取（可能强杀运行中的 Proma），用 7za 解包

详见 [references/known-pitfalls.md](./references/known-pitfalls.md)
