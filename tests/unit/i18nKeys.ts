import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Every literal passed to t(), tNow(), tr(), receipt L()/E() and UserError() in src/. */
export function collectKeys(root = 'src'): Set<string> {
  const files: string[] = []
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name))
      else if (/\.tsx?$/.test(e.name) && !d.includes('i18n')) files.push(join(d, e.name))
    }
  }
  walk(root)
  const keys = new Set<string>()
  const re = /(?:\b(?:t|tx|tNow|tr|L|E)|new UserError)\(\s*'((?:[^'\\]|\\.)*)'/g
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(re)) keys.add(m[1].replace(/\\'/g, "'"))
  return keys
}
