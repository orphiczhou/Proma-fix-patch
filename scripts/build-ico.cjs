// 把 proma-emerald.png 转成多尺寸 green.ico（供 rcedit 替换 exe 图标 + 窗口 icon.ico 补齐）
// 用法: node build-ico.cjs <src.png> <out.ico>
// 依赖 assets/node_modules 的 jimp(1.x) + png-to-ico（npm install jimp png-to-ico）
const fs = require('fs')
const _path = require('path')
module.paths.push(_path.join(__dirname, '..', 'assets', 'node_modules'))
const jimpMod = require('jimp')
const Jimp = jimpMod.Jimp || jimpMod
const pngToIco = require('png-to-ico').default || require('png-to-ico')

const src = process.argv[2]
const out = process.argv[3]
const sizes = [256, 128, 96, 64, 48, 32, 16]
;(async () => {
  const img = await Jimp.read(src)
  const pngs = []
  for (const s of sizes) {
    const cloned = img.clone().resize({ w: s, h: s })
    const buf = typeof cloned.getBufferAsync === 'function'
      ? await cloned.getBufferAsync('image/png')
      : await cloned.getBuffer('image/png')
    pngs.push(buf)
  }
  const ico = await pngToIco(pngs)
  fs.writeFileSync(out, ico)
  console.log('OK', out, ico.length, 'bytes, sizes:', sizes.join(','))
})().catch(e => { console.error('FAIL', e && e.message || e); process.exit(1) })
