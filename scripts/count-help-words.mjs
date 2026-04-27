import fs from 'node:fs'

const text = fs.readFileSync('src/content/help.ts', 'utf8')
const matches = text.match(/'((?:[^'\\]|\\.)*)'/g) || []
let total = 0
for (const m of matches) {
  const inner = m.slice(1, -1)
  if (inner.length < 20) continue
  if (!/\s/.test(inner)) continue
  total += inner.split(/\s+/).filter(Boolean).length
}
console.log('prose words:', total)
