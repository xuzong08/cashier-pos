import { mkdirSync, readdirSync, statSync, unlinkSync, openSync, readSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import type { DB } from './db'

const KEEP = 20

const stamp = (): string => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)

export class Backups {
  constructor(
    private dir: string,
    private db: () => DB
  ) {
    mkdirSync(dir, { recursive: true })
  }

  /** Online, consistent copy via SQLite's backup API (safe while the app runs). */
  async now(target = join(this.dir, `bitepoint-${stamp()}.db`)): Promise<string> {
    await this.db().backup(target)
    this.prune()
    return target
  }

  list(): { name: string; size: number; date: string }[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.db'))
      .map((name) => {
        const st = statSync(join(this.dir, name))
        return { name, size: st.size, date: st.mtime.toISOString() }
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  private prune(): void {
    for (const b of this.list().slice(KEEP)) unlinkSync(join(this.dir, b.name))
  }
}

export function isSqliteFile(path: string): boolean {
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(16)
    readSync(fd, buf, 0, 16, 0)
    return buf.toString('latin1') === 'SQLite format 3\0'
  } finally {
    closeSync(fd)
  }
}
