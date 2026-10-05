// Checks quickbar.json files the same way the plugin does, outside Claude Code (CI, pre-commit).
// Usage: node scripts/check-config.ts [file ...]   (Node 22.18+ runs TypeScript directly)
import { readFileSync } from 'node:fs'

import { parse } from '../plugins/quickbar/hooks/config.ts'

const files = process.argv.slice(2)
if (!files.length) files.push('plugins/quickbar/defaults/quickbar.json')

let failed = 0
for (const file of files) {
  const { errors } = parse(readFileSync(file, 'utf8'))
  if (errors.length) {
    failed++
    console.error(`✘ ${file}\n  - ${errors.join('\n  - ')}`)
  } else {
    console.log(`✔ ${file}`)
  }
}
process.exit(failed ? 1 : 0)
