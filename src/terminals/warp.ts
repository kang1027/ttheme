import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { backupOnce, editUserFile } from '../edits.ts'
import { warp as emitter, owned } from '../emit/index.ts'
import { dataHome, readText, tilde } from './common.ts'
import type { At, Wiring } from './types.ts'

export function warpThemes(home: string): string {
  return process.platform === 'darwin' ? join(home, '.warp', 'themes') : join(dataHome(home), 'warp-terminal', 'themes')
}

export function warpSettings(home: string, configHome: string): string {
  return process.platform === 'darwin'
    ? join(home, '.warp', 'settings.toml')
    : join(configHome, 'warp-terminal', 'settings.toml')
}

export const WARP_DEFAULT = '"dark"'

export function warpBasePath(configHome: string): string {
  return join(configHome, 'ttheme', 'warp.base')
}

const WARP_SECTION = '[appearance.themes]'

function warpSection(lines: string[]): [number, number] | undefined {
  const start = lines.findIndex((line) => line.trim() === WARP_SECTION)
  if (start < 0) {
    return undefined
  }
  const next = lines.findIndex((line, i) => i > start && line.trimStart().startsWith('['))
  return [start, next < 0 ? lines.length : next]
}

export function warpThemeOf(content: string): string | undefined {
  const lines = content.split('\n')
  const section = warpSection(lines)
  if (!section) {
    return undefined
  }
  const line = lines.slice(section[0] + 1, section[1]).find((l) => /^theme\s*=/.test(l))
  return line?.replace(/^theme\s*=\s*/, '').trim()
}

export function warpThemeValue(palette: string): string {
  return `{ custom = { name = "${palette}", path = "${owned(palette)}.yaml" } }`
}

export function withWarpTheme(content: string, value: string | undefined): string {
  const lines = content.split('\n')
  const section = warpSection(lines)
  if (!section) {
    return value === undefined ? content : `${content.replace(/\n*$/, '\n')}\n${WARP_SECTION}\ntheme = ${value}\n`
  }
  const at = lines.findIndex((l, i) => i > section[0] && i < section[1] && /^theme\s*=/.test(l))
  if (at >= 0) {
    lines.splice(at, 1, ...(value === undefined ? [] : [`theme = ${value}`]))
  } else if (value !== undefined) {
    lines.splice(section[0] + 1, 0, `theme = ${value}`)
  }
  return lines.join('\n')
}

function ours(content: string): boolean {
  return warpThemeOf(content)?.includes(`path = "${owned('')}`) === true
}

const WARP_LATER =
  "setTimeout(() => { const fs = require('node:fs'); const [file, next, seen] = process.argv.slice(-3); if (fs.readFileSync(file, 'utf8') !== seen) return; const tmp = file + '.ttheme-' + process.pid; fs.writeFileSync(tmp, next); fs.chmodSync(tmp, fs.statSync(file).mode & 0o7777); fs.renameSync(tmp, file) }, 1500)"

function wearWarp(at: At, startup: string | undefined, later: boolean): string | undefined {
  const file = warpSettings(at.home, at.configHome)
  if (!existsSync(file)) {
    return undefined
  }
  const base = warpBasePath(at.configHome)
  const content = readFileSync(file, 'utf8')
  let value: string
  if (startup) {
    if (!ours(content) && !existsSync(base)) {
      mkdirSync(dirname(base), { recursive: true })
      writeFileSync(base, warpThemeOf(content) ?? '')
    }
    value = warpThemeValue(startup)
  } else {
    if (!ours(content)) {
      return undefined
    }
    value = (existsSync(base) && readFileSync(base, 'utf8')) || WARP_DEFAULT
    rmSync(base, { force: true })
  }
  const next = withWarpTheme(content, value)
  if (next === content) {
    return undefined
  }
  if (later) {
    backupOnce(file)
    spawn(process.execPath, ['-e', WARP_LATER, realpathSync(file), next, content], {
      detached: true,
      stdio: 'ignore',
    }).unref()
  } else {
    editUserFile(file, next)
  }
  return file
}

export const warp: Wiring = {
  id: 'warp',
  name: 'Warp',
  emitter,
  shelf: { from: 'themes', dir: (at) => warpThemes(at.home) },
  offered: (_, host) => host.platform !== 'win32',
  present: (setup) => existsSync(dirname(warpThemes(setup.home))),
  sync(ctx, out) {
    const fresh = ctx.startup !== undefined && !existsSync(join(warpThemes(ctx.home), `${owned(ctx.startup)}.yaml`))
    const file = wearWarp(ctx, ctx.startup, fresh)
    out.themes(warp)
    if (file) {
      out.note(file)
    }
  },
  plan(ctx) {
    const file = warpSettings(ctx.home, ctx.configHome)
    return ctx.startup && existsSync(file)
      ? [`Edit ${tilde(file, ctx.home)} — [appearance.themes] theme; \`ttheme off\` puts yours back`]
      : []
  },
  notes: () => [
    'Warp wears the default palette app-wide through its settings.toml — the shell layer stays off in it, since Warp paints no tab background of its own',
  ],
  next: () => [],
  unwire(at) {
    const file = warpSettings(at.home, at.configHome)
    const content = readText(file)
    return {
      edits: ours(content)
        ? [{ file, content: withWarpTheme(content, readText(warpBasePath(at.configHome)) || WARP_DEFAULT) }]
        : [],
      removals: [],
      touches: [],
    }
  },
}
