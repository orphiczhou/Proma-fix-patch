// 读 asar 内文件（纯 node）。用法: node read-asar.cjs <asar> <relPath|@list>
const fs = require('fs')
const [, , asarPath, rel] = process.argv
if (!asarPath || !rel) { console.error('用法: node read-asar.cjs <asar> <relPath|@list>'); process.exit(1) }
const buf = fs.readFileSync(asarPath)
// size pickle: [0,4)=payloadsize(4) [4,8)=headerSize(uint32)
const headerSize = buf.readUInt32LE(4)
const base = 8 + headerSize
// header pickle: [8,12)=payloadsize  [12,16)=stringLen(uint32) [16,...)=JSON
const strLen = buf.readUInt32LE(12)
const header = JSON.parse(buf.subarray(16, 16 + strLen).toString())
function findNode(r) {
  let n = header
  for (const p of r.split('/')) {
    if (!n.files || !n.files[p]) return null
    n = n.files[p]
  }
  return n
}
if (rel === '@list') {
  console.log(Object.keys(header.files).sort().join('\n'))
  process.exit(0)
}
const node = findNode(rel)
if (!node) { console.error('NOT FOUND:', rel); process.exit(1) }
const off = base + parseInt(node.offset)
process.stdout.write(buf.subarray(off, off + node.size))
