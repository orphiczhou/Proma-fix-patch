// merge-unpacked.cjs —— 解包 asar 后，把 app.asar.unpacked/ 的原生模块合并覆盖到 app/
// 为什么需要：extract-asar.cjs 按 offset 切 asar 二进制，对 unpacked 文件（.node 原生模块，
//   如 skia.win32-x64-msvc.node）只写出错误占位数据。不合并覆盖，跨机器加载原生模块会失败。
// 用法: node merge-unpacked.cjs <resources-dir>
//   <resources-dir> = 含 app/ 和 app.asar.unpacked/ 的目录（Proma 的 resources/）
const fs = require('fs')
const path = require('path')
const [, , resDir] = process.argv
if (!resDir) { console.error('用法: node merge-unpacked.cjs <resources-dir>'); process.exit(1) }
const appDir = path.join(resDir, 'app')
const unpackedDir = path.join(resDir, 'app.asar.unpacked')
if (!fs.existsSync(appDir)) { console.error('app/ 不存在:', appDir); process.exit(1) }
if (!fs.existsSync(unpackedDir)) { console.log('app.asar.unpacked/ 不存在，跳过合并（无原生模块需覆盖）'); process.exit(0) }

let copied = 0, dirs = 0
function copyRecursive(src, dest) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dest, e.name)
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); dirs++; copyRecursive(s, d) }
    else { fs.copyFileSync(s, d); copied++ }
  }
}
copyRecursive(unpackedDir, appDir)
console.log(`merged: ${copied} files (+${dirs} dirs) from app.asar.unpacked/ -> app/`)
