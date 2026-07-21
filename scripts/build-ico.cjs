// 把 proma-emerald.png 转成多尺寸 green.ico（供 rcedit 替换 exe 图标）
// 用法: node build-ico.cjs <src.png> <out.ico>
const fs = require('fs')
const _path = require('path')
module.paths.push(_path.join(__dirname, '..', 'assets', 'node_modules'))
const jimp = require('jimp')
const pngToIco = require('png-to-ico').default

const src = process.argv[2]
const out = process.argv[3]
const sizes = [256, 128, 96, 64, 48, 32, 16]
;(async () => {
  const img = await jimp.read(src)
  const pngs = []
  for (const s of sizes) {
    const buf = await img.clone().resize(s, s).getBufferAsync(jimp.MIME_PNG)
    pngs.push(buf)
  }
  const ico = await pngToIco(pngs)
  fs.writeFileSync(out, ico)
  console.log('OK', out, ico.length, 'bytes, sizes:', sizes.join(','))
})().catch(e => { console.error('FAIL', e && e.message || e); process.exit(1) })
