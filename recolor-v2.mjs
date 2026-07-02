// FLINT v2 — recoloration globale DA orange/noir/blanc.
// Remap rule-based (HSL) de tous les hex + rgba + bascule Anton→Inter.
// Usage: node recolor-v2.mjs   (modifie index.html en place, imprime la table)
import fs from 'node:fs'

const FILE = 'index.html'
let s = fs.readFileSync(FILE, 'utf8')
const before = s

// ─── 0. Pré-remplacements sémantiques (rampes qui doivent rester distinctes) ───
s = s.replace(
  "const ZCOL=['#3FB57A','#9BCB4A','#F2C744','#F0902E','#F0492E']",
  "const ZCOL=['#FFC7A6','#FF9E66','#FF7A33','#F9560E','#E23000']",
)
s = s.replace(
  "var REC_TONE={good:['#2E7D4F','#EAF4EE','#3FB57A'],warn:['#9A6500','#FBF1DD','#E0922A'],bad:['#B23A22','#FBEAE6','#CF4631']}",
  "var REC_TONE={good:['#C22E00','#FFE9DE','#F93A00'],warn:['#5A5A5A','#F0F0F0','#8C8C8C'],bad:['#1A1A1A','#EAEAEA','#3C3C3C']}",
)

// ─── 1. rgba() ───
const RGBA = [
  ['rgba(20,18,12', 'rgba(12,12,12'],
  ['rgba(22,21,18', 'rgba(13,13,13'],
  ['rgba(22,18,12', 'rgba(13,13,13'],
  ['rgba(15,12,10', 'rgba(10,10,10'],
  ['rgba(232,103,74', 'rgba(249,58,0'],
  ['rgba(240,73,46', 'rgba(249,58,0'],
  ['rgba(120,110,95', 'rgba(70,70,70'],
  ['rgba(250,248,245', 'rgba(255,255,255'],
  ['rgba(243,239,231', 'rgba(255,255,255'],
  ['rgba(47,168,106', 'rgba(249,58,0'],
  ['rgba(63,181,122', 'rgba(249,58,0'],
  ['rgba(46,158,102', 'rgba(249,58,0'],
  ['rgba(59,109,17', 'rgba(194,46,0'],
  ['rgba(108,123,214', 'rgba(109,109,109'],
  ['rgba(94,111,204', 'rgba(109,109,109'],
  ['rgba(94,111,230', 'rgba(109,109,109'],
  ['rgba(124,77,255', 'rgba(109,109,109'],
  ['rgba(110,107,255', 'rgba(109,109,109'],
  ['rgba(255,106,77', 'rgba(255,122,69'],
  ['rgba(224,146,42', 'rgba(249,58,0'],
  ['rgba(154,152,143', 'rgba(150,150,150'],
  ['rgba(63,160,224', 'rgba(140,140,140'],
  ['rgba(242,169,59', 'rgba(249,58,0'],
  ['rgba(225,68,52', 'rgba(249,58,0'],
  ['rgba(122,117,110', 'rgba(118,118,118'],
]
for (const [a, b] of RGBA) s = s.split(a).join(b)

// ─── 2. Hex remap rule-based ───
const PROTECT = new Set([
  '#F93A00','#FFD9C4','#FC6A33','#F6542B','#FF8A5C','#FFE9DE','#EFEFEF','#F5F5F5',
  '#FBFBFB','#F1F1F1','#F4F4F4','#F0F0F0','#0B0B0B','#8E9094','#A2A4A8','#3A3B3E',
  '#6D6D6D','#575757','#E8E8E8','#8A8A8A','#C22E00','#E23000','#FF9E66','#FFC7A6',
  '#FF7A33','#F9560E','#FFFFFF','#000000','#8C8C8C','#5A5A5A','#1A1A1A','#EAEAEA','#3C3C3C',
])
function toHSL(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  let h = 0, sat = 0
  if (mx !== mn) {
    const d = mx - mn
    sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (mx === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return { h, s: sat, l }
}
const gray = (l) => { const v = Math.round(l * 255); const x = v.toString(16).padStart(2, '0').toUpperCase(); return `#${x}${x}${x}` }
function chromaOf(hex){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return (Math.max(r,g,b)-Math.min(r,g,b))/255}
function mapHex(raw) {
  const hex = raw.toUpperCase()
  if (PROTECT.has(hex)) return raw
  const { h, l } = toHSL(hex)
  const ch = chromaOf(hex)
  if (l < 0.16) return gray(l)                 // encres quasi noires : rester noires
  if (ch < 0.12) {                             // neutres (chroma faible, pas la sat HSL)
    if (l >= 0.955) return '#FFFFFF'
    if (l >= 0.88) return '#F5F5F5'
    if (l >= 0.80) return '#ECECEC'
    return gray(l)
  }
  if (l >= 0.86) {
    if (ch < 0.12) { if (l >= 0.955) return '#FFFFFF'; if (l >= 0.88) return '#F5F5F5'; return '#ECECEC' }
    return (h <= 170 || h > 330) ? '#FFE9DE' : '#F0F0F0'
  }
  const warm = h <= 75 || h > 330
  if (warm || (h > 75 && h <= 170)) { // chauds + verts → orange
    if (l < 0.32) return '#C22E00'
    if (l > 0.65) return '#FF8A5C'
    return '#F93A00'
  }
  if (h <= 260) { // bleus/teals → gris
    return l > 0.65 ? '#C9C9C9' : '#8C8C8C'
  }
  return l > 0.65 ? '#9E9E9E' : '#6D6D6D' // violets → anthracite
}
const table = new Map()
s = s.replace(/#[0-9a-fA-F]{6}\b/g, (m) => {
  const out = mapHex(m)
  const k = m.toUpperCase() + '→' + out.toUpperCase()
  table.set(k, (table.get(k) || 0) + 1)
  return out
})

// ─── 3. Anton → Inter ───
s = s.split("font-family:'Anton',sans-serif;font-weight:400").join("font-family:'Inter',sans-serif;font-weight:800")
s = s.split("font-family:'Anton',sans-serif").join("font-family:'Inter',sans-serif;font-weight:800")
s = s.split("font-family:'Anton'").join("font-family:'Inter';font-weight:800")
s = s.replace(/font-style:oblique \d+deg/g, 'font-style:normal')
s = s.replace("--disp:'Anton',-apple-system,'Arial Narrow',sans-serif", "--disp:'Inter',-apple-system,sans-serif")
s = s.replace('family=Anton&', '') // ne plus charger Anton
s = s.replace('.disp{font-family:var(--disp);font-weight:400;letter-spacing:.01em}', '.disp{font-family:var(--disp);font-weight:800;letter-spacing:-.01em}')

fs.writeFileSync(FILE, s)
const changed = [...table.entries()].filter(([k]) => { const [a, b] = k.split('→'); return a !== b })
changed.sort((x, y) => y[1] - x[1])
console.log('hex changes:', changed.length, 'distinct —', changed.reduce((a, c) => a + c[1], 0), 'total')
console.log(changed.slice(0, 40).map(([k, n]) => `${k} x${n}`).join('\n'))
console.log('bytes:', before.length, '→', s.length)
