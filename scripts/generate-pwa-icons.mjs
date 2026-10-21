import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// "晨光花园" design: calendar, pink blossom, green leaves and full-bleed
// cream background. Everything is generated locally; no font, SVG renderer,
// network, native library, or machine-specific path is needed on Windows.
const W = 192
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(typeName, bytes) {
  const type = Buffer.from(typeName, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(bytes.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([type, bytes])))
  return Buffer.concat([length, type, bytes, crc])
}
function clamp(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)) }
function mix(a, b, t) { return a + (b - a) * clamp(t) }
function over(color, other, alpha) {
  const a = clamp(alpha)
  return color.map((channel, i) => mix(channel, other[i], a))
}
function rr(x, y, left, top, width, height, radius) {
  const cx = left + width / 2, cy = top + height / 2
  const dx = Math.abs(x - cx) - width / 2 + radius
  const dy = Math.abs(y - cy) - height / 2 + radius
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  const distance = outside + Math.min(Math.max(dx, dy), 0) - radius
  return clamp(0.65 - distance * 2.5)
}
function ellipse(x, y, cx, cy, rx, ry, angle = 0) {
  const cosine = Math.cos(angle), sine = Math.sin(angle)
  const ux = ((x - cx) * cosine + (y - cy) * sine) / rx
  const uy = (-(x - cx) * sine + (y - cy) * cosine) / ry
  return { coverage: clamp((1 - ux * ux - uy * uy) * 10), ux, uy }
}
function paintLeaf(color, x, y, cx, cy, rx, ry, angle, bright) {
  const e = ellipse(x, y, cx, cy, rx, ry, angle)
  const shade = clamp(0.45 + (e.uy - e.ux) * 0.24)
  const tint = bright
    ? [Math.round(mix(54, 130, shade)), Math.round(mix(116, 190, shade)), Math.round(mix(37, 65, shade))]
    : [Math.round(mix(11, 75, shade)), Math.round(mix(87, 153, shade)), Math.round(mix(43, 65, shade))]
  return over(color, tint, e.coverage)
}
function paintPetal(color, x, y, cx, cy, rx, ry, angle) {
  const e = ellipse(x, y, cx, cy, rx, ry, angle)
  const light = clamp((e.ux + 1) * .4 + (1 - e.uy) * .23)
  const petal = [Math.round(mix(253, 255, light)), Math.round(mix(123, 205, light)),
    Math.round(mix(133, 189, light))]
  color = over(color, petal, e.coverage)
  // A faint vein keeps petals legible even on the iPhone's small Home icon.
  const vein = e.coverage * clamp((0.065 - Math.abs(e.ux)) * 7) * clamp(1 - Math.abs(e.uy) * .5)
  return over(color, [242, 139, 137], vein * .25)
}
function sample(x, y) {
  const t = y / W
  const glow = clamp(1 - Math.hypot((x - 83) / 180, (y - 31) / 215))
  let color = [255, mix(242, 252, glow) - t * 5, mix(224, 246, glow) - t * 6]

  // Calendar lift, body and red header.
  const shadow = rr(x, y + 1, 28, 34, 136, 119, 17)
  color = over(color, [186, 133, 100], shadow * .10)
  color = over(color, [255, 251 - t * 7, 242 - t * 6], rr(x, y, 26, 38, 140, 117, 18))
  const header = rr(x, y, 27, 31, 138, 45, 19)
  const strip = rr(x, y, 27, 49, 138, 26, 5)
  const red = [mix(255, 233, t * .2), mix(113, 74, clamp((y - 30) / 48)),
    mix(91, 85, clamp((y - 30) / 48))]
  color = over(color, red, Math.max(header, strip))
  // Calendar white face in front of the header.
  color = over(color, [255, 252, 248], rr(x, y, 27, 66, 138, 88, 16))
  color = over(color, [255, 250, 243], rr(x, y, 27, 66, 138, 12, 7))
  // Softly inset calendar dates (every date remains a recognizable square).
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
    const tile = rr(x, y, 43 + 26 * col, 79 + row * 27, 20, 20, 4)
    const tileColor = row === 0 && col === 2 ? [255, 135, 134] :
      row === 1 && col === 1 ? [135, 186, 74] :
        col % 2 ? [255, 231, 214] : [247, 214, 190]
    color = over(color, tileColor, tile)
  }
  // Raised binding bars and white highlight around the holes.
  for (const bx of [65, 127]) {
    color = over(color, [255, 250, 231], ellipse(x, y, bx, 40, 10, 10).coverage)
    color = over(color, [159, 36, 30], rr(x, y, bx - 6, 19, 12, 29, 6) * .5)
    color = over(color, [mix(243, 252, clamp((x - bx + 6) / 12)),
      mix(48, 108, clamp((x - bx + 6) / 12)), 43], rr(x, y, bx - 6, 14, 12, 31, 6))
  }

  // Leaf silhouettes remain behind the blossom.
  color = paintLeaf(color, x, y, 158, 137, 18, 47, -.47, true)
  color = paintLeaf(color, x, y, 62, 158, 43, 19, .26, true)
  color = paintLeaf(color, x, y, 142, 167, 31, 19, -.55, false)

  // Five overlapping coral-to-pink petals, then a warm yellow centre.
  color = paintPetal(color, x, y, 116, 126, 33, 20, -.65)
  color = paintPetal(color, x, y, 148, 117, 19, 32, -.14)
  color = paintPetal(color, x, y, 159, 143, 31, 19, -.56)
  color = paintPetal(color, x, y, 125, 167, 18, 30, .34)
  color = paintPetal(color, x, y, 103, 152, 29, 18, -.17)
  const middle = ellipse(x, y, 134, 145, 10, 12)
  color = over(color, [241, 156, 48], middle.coverage)
  for (const [bx, by, rx, ry] of [[133, 137, 3.8, 8], [139, 141, 3.8, 7],
    [127, 142, 3.4, 6], [134, 146, 5, 5]]) {
    const pollen = ellipse(x, y, bx, by, rx, ry, .18)
    color = over(color, [255, 207 - (by - 137) * 2, 75], pollen.coverage)
  }
  return color.map(v => Math.max(0, Math.min(255, Math.round(v))))
}
export function makeIcon(size) {
  if (![192, 512].includes(size)) throw new Error('Unsupported PWA icon size: ' + size)
  const stride = 1 + size * 4
  const pixels = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    const row = y * stride
    for (let x = 0; x < size; x++) {
      const [r, g, b] = sample((x + .5) * W / size, (y + .5) * W / size)
      const i = row + 1 + x * 4
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8; header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}
export function generatePWAIcons(directory) {
  const output = resolve(directory)
  mkdirSync(output, { recursive: true })
  for (const size of [192, 512]) {
    const filename = join(output, 'icon-' + size + '.png')
    writeFileSync(filename, makeIcon(size))
    console.log('Generated ' + filename)
  }
}
const executable = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (executable) generatePWAIcons(process.argv[2] || join(resolve('public')))
