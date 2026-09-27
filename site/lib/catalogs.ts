import type { Theme } from '@/lib/themes'

export function catalogsOf(themes: Theme[]): { catalog: string | null; themes: Theme[] }[] {
  const shelves = new Map<string | null, Theme[]>()
  for (const theme of themes) {
    shelves.set(theme.catalog, [...(shelves.get(theme.catalog) ?? []), theme])
  }
  return [...shelves]
    .sort(([a], [b]) => Number(a === null) - Number(b === null))
    .map(([catalog, shelf]) => ({ catalog, themes: shelf }))
}
