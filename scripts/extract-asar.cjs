// 纯 node 解包 asar（无依赖）。用法: node extract-asar.cjs <asar> <dest>
const fs = require('fs')
const path = require('path')
const [, , asarPath, dest] = process.argv
const buf = fs.readFileSync(asarPath)
const headerSize = buf.readUInt32LE(4)
const base = 8 + headerSize
const strLen = buf.readUInt32LE(12)
const header = JSON.parse(buf.subarray(16, 16 + strLen).toString())
let dirs = 0, files = 0
function walk(node, rel) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) {
      walk(child, rel ? rel + '/' + name : name)
    }
  } else {
    const off = base + parseInt(node.offset)
    const full = path.join(dest, rel.split('/').join(path.sep))
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, buf.subarray(off, off + node.size))
    files++
  }
}
walk(header, '')
console.log(`extracted: ${files} files to ${dest}`)
