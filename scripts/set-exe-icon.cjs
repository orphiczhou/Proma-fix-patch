// 用 rcedit 把 exe 图标替换为指定 ico。用法: node set-exe-icon.cjs <exe> <ico>
// node_modules 在 assets/（与脚本分离）；rcedit v5 用 exports 不用 main，
// 故注入 module.paths 后用包名 require（走 exports 解析），保证 skill 自洽可移植
const _path = require('path')
module.paths.push(_path.join(__dirname, '..', 'assets', 'node_modules'))
const rcedit = require('rcedit').rcedit
const exe = process.argv[2]
const ico = process.argv[3]
rcedit(exe, { icon: ico })
  .then(() => console.log('OK icon set on', exe))
  .catch((e) => { console.error('FAIL', e && e.message || e); process.exit(1) })
