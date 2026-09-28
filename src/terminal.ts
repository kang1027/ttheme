import type { PaletteEntry } from './emit/manifest.ts'
import { colorless, paletteOsc, queryTerminalColors, restoreOsc, SLOT_CODES } from './osc.ts'

type Env = Record<string, string | undefined>

export type Terminal =
  | 'ghostty'
  | 'kitty'
  | 'wezterm'
  | 'alacritty'
  | 'iterm2'
  | 'terminal-app'
  | 'windows-terminal'
  | 'warp'
  | 'foot'
  | 'unknown'

export function detectTerminal(env: Env): Terminal {
  if (env.TERM_PROGRAM === 'WarpTerminal') {
    return 'warp'
  }
  if (env.GHOSTTY_RESOURCES_DIR || env.TERM_PROGRAM === 'ghostty') {
    return 'ghostty'
  }
  if (env.KITTY_WINDOW_ID) {
    return 'kitty'
  }
  if (env.WEZTERM_PANE) {
    return 'wezterm'
  }
  if (env.ALACRITTY_WINDOW_ID) {
    return 'alacritty'
  }
  if (env.ITERM_SESSION_ID || env.TERM_PROGRAM === 'iTerm.app') {
    return 'iterm2'
  }
  if (env.TERM_PROGRAM === 'Apple_Terminal') {
    return 'terminal-app'
  }
  if (env.WT_SESSION && !env.TERM_PROGRAM) {
    return 'windows-terminal'
  }
  if (env.TERM?.startsWith('foot')) {
    return 'foot'
  }
  return 'unknown'
}

export interface Traits {
  links: boolean
  pictures: boolean
  bands: boolean
  paints: boolean
  repaint?: readonly number[]
}

export const TRAITS: Record<Terminal, Traits> = {
  ghostty: { links: true, pictures: true, bands: false, paints: true },
  kitty: { links: true, pictures: true, bands: false, paints: true },
  iterm2: { links: true, pictures: true, bands: true, paints: true, repaint: [0, 1] },
  wezterm: { links: true, pictures: false, bands: false, paints: true },
  alacritty: { links: true, pictures: false, bands: false, paints: true },
  'windows-terminal': { links: true, pictures: false, bands: false, paints: true },
  foot: { links: true, pictures: false, bands: false, paints: true },
  'terminal-app': { links: false, pictures: false, bands: false, paints: true },
  warp: { links: false, pictures: false, bands: false, paints: false },
  unknown: { links: false, pictures: false, bands: false, paints: true },
}

export function linkable(env: Env): boolean {
  return TRAITS[detectTerminal(env)].links
}

export function showsPictures(env: Env): boolean {
  return TRAITS[detectTerminal(env)].pictures && !env.TMUX
}

export function cropsInBands(env: Env): boolean {
  return TRAITS[detectTerminal(env)].bands
}

export const CLEAR = '\x1b[H\x1b[K\x1b[2H\x1b[J\x1b[H'

export interface Live {
  slots: readonly number[]
  paint(entry: PaletteEntry): string
  saved(): Promise<Map<string, string>>
  restore(saved: ReadonlyMap<string, string>): string
}

export function livePaint(env: Env, tty: boolean): Live | undefined {
  const traits = TRAITS[detectTerminal(env)]
  if (!tty || colorless(env) || env.TMUX || !traits.paints) {
    return undefined
  }
  const slots = traits.repaint ?? SLOT_CODES.map((_, slot) => slot)
  const codes = SLOT_CODES.filter((_, slot) => slots.includes(slot))
  return {
    slots,
    paint: (entry) => paletteOsc(entry, slots),
    saved: () => queryTerminalColors(codes),
    restore: (saved) => restoreOsc(saved, codes),
  }
}
