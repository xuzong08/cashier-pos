// Floor-plan geometry for the table map. Units are abstract "floor units" (Settings.floorWidth/Height).

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Floor {
  width: number
  height: number
  grid: number
}

export const snap = (v: number, grid: number): number => (grid > 0 ? Math.round(v / grid) * grid : Math.round(v))

/** Keep a rect fully on the floor. Oversized rects pin to the top-left. */
export function clampToFloor<T extends Rect>(r: T, floor: Pick<Floor, 'width' | 'height'>): T {
  return {
    ...r,
    x: Math.max(0, Math.min(r.x, floor.width - r.w)),
    y: Math.max(0, Math.min(r.y, floor.height - r.h))
  }
}

export const overlaps = (a: Rect, b: Rect, gap = 0): boolean =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap

/** First grid position (row by row) where a new w×h table fits without touching others. */
export function findFreeSpot(existing: Rect[], size: { w: number; h: number }, floor: Floor): { x: number; y: number } {
  const step = Math.max(floor.grid, 10)
  for (let y = step; y + size.h <= floor.height; y += step) {
    for (let x = step; x + size.w <= floor.width; x += step) {
      const r = { x, y, ...size }
      if (!existing.some((e) => overlaps(r, e, step))) return { x, y }
    }
  }
  return { x: 0, y: 0 } // floor is full: drop it in the corner and let the admin move it
}

/** Starting layout: zones A, B, C as rows of 8 tables. */
export function defaultTables(): { name: string; zone: string; x: number; y: number; w: number; h: number; shape: 'round' | 'square'; seats: number }[] {
  return ['A', 'B', 'C'].flatMap((zone, zi) =>
    Array.from({ length: 8 }, (_, i) => ({
      name: `${zone}${i + 1}`,
      zone,
      x: 40 + i * 140,
      y: 60 + zi * 240,
      w: 100,
      h: 100,
      shape: zi === 1 ? ('round' as const) : ('square' as const),
      seats: zi === 2 ? 2 : 4
    }))
  )
}
