// Generates build/icon.ico (256x256 Living-Glass moss droplet) with zero deps.
// Same hand-rolled PNG encoder as gen-icon.mjs; the ICO container holds a single
// PNG-compressed entry, which Windows Vista+ and electron-builder both accept.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const S = 256
const px = Buffer.alloc(S * S * 4)

const cx = (S - 1) / 2
const cy = (S - 1) / 2
const rad = S * 0.44 // droplet with breathing room for the taskbar
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4
    const d = Math.hypot(x - cx, y - cy)
    if (d > rad + 1) continue // transparent
    const t = Math.min(1, d / rad) // radial fade for the glassy sheen
    const edge = Math.max(0, Math.min(1, rad + 1 - d)) // 2px anti-aliased rim
    px[i] = Math.round(0x8f - t * 34)
    px[i + 1] = Math.round(0xed - t * 66)
    px[i + 2] = Math.round(0xb4 - t * 44)
    px[i + 3] = Math.round(255 * edge)
  }
}

const crcTable = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // colour type: RGBA
const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0 // filter: none
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, y * S * 4 + S * 4)
}
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])

// ICO container: ICONDIR + one ICONDIRENTRY + the PNG payload.
const dir = Buffer.alloc(6)
dir.writeUInt16LE(0, 0) // reserved
dir.writeUInt16LE(1, 2) // type: icon
dir.writeUInt16LE(1, 4) // one image
const entry = Buffer.alloc(16)
entry[0] = 0 // width 0 = 256
entry[1] = 0 // height 0 = 256
entry.writeUInt16LE(1, 4) // colour planes
entry.writeUInt16LE(32, 6) // bits per pixel
entry.writeUInt32LE(png.length, 8)
entry.writeUInt32LE(6 + 16, 12) // payload offset
const ico = Buffer.concat([dir, entry, png])

const out = join(here, '..', 'build', 'icon.ico')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, ico)
console.log('wrote', out, ico.length, 'bytes')
