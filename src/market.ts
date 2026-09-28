import { existsSync } from 'node:fs'
import * as p from '@clack/prompts'
import { available, readCatalog, readKept, search } from './catalog.ts'
import { adopt } from './craft.ts'
import { listed, type Manifest } from './emit/manifest.ts'
import { addSource, localLine } from './markets.ts'
import { colorless } from './osc.ts'
import { CODE, readLocal } from './own.ts'
import { PalettePrompt, type PickerScope, promptFx } from './palette-prompt.ts'
import {
  commit,
  configHome,
  forget,
  itermDefaults,
  pointItermDefault,
  readInstalled,
  startupPalette,
  sync,
  withItermBase,
  writeInstalled,
} from './palettes.ts'
import { pending } from './pending.ts'
import { bringPictures, since } from './pictures.ts'
import { refreshLine, refreshMarket } from './refresh.ts'
import { installedPath, isLocal, marketSources, OFFICIAL, shownSource } from './sources.ts'
import { livePaint } from './terminal.ts'
import { alphabetical, marketOf } from './theme.ts'
import { type InitTerminal, TERMINAL_NAMES } from './wiring.ts'

export function reload(count: number): void {
  console.log(`\n${count} palettes installed — open a new tab, or reload your terminal config`)
}

export function inMarket(given: string[], id: string): string[] {
  return given.map((name) => {
    if (name.startsWith(CODE)) {
      return name
    }
    const market = marketOf(name)
    if (market === undefined) {
      return id === OFFICIAL ? name : `${id}/${name}`
    }
    if (market !== id) {
      throw new Error(`${name} is not in ${id} — give its bare name, or leave --market out`)
    }
    return name
  })
}

export async function runAdd(asked: string[], market?: string): Promise<void> {
  const home = configHome()
  const given = market ? inMarket(asked, (await addSource(home, market)).id) : asked
  const catalog = readCatalog(home)
  const names = [...new Set(given.map((n) => (n.startsWith(CODE) ? adopt(home, n, catalog) : n)))]
  const state = readInstalled(home)
  const already = names.filter((n) => state.palettes.includes(n))
  const fresh = names.filter((n) => !state.palettes.includes(n))
  if (fresh.length === 0) {
    sync(home, catalog, state)
    console.log(`Already installed: ${already.join(', ')}`)
    return
  }
  const next = { ...state, palettes: [...state.palettes, ...fresh] }
  commit(home, catalog, state, next)
  for (const name of fresh) {
    console.log(`  + ${name}`)
  }
  await bringPictures(
    home,
    available(home, catalog, false).palettes.filter((e) => fresh.includes(e.name)),
    next.terminals,
  )
  reload(next.palettes.length)
}

export function runRemove(names: string[]): number {
  const home = configHome()
  const catalog = readCatalog(home)
  const state = readInstalled(home)
  const gone = names.filter((n) => state.palettes.includes(n))
  const absent = names.filter((n) => !state.palettes.includes(n))
  if (gone.length === 0) {
    throw new Error(`not installed: ${absent.join(', ')} — \`ttheme list\` marks what is`)
  }
  const next = { ...state, palettes: state.palettes.filter((n) => !gone.includes(n)) }
  commit(home, catalog, state, next)
  forget(home, catalog, state.terminals, gone)
  for (const name of gone) {
    console.log(`  - ${name}`)
  }
  reload(next.palettes.length)
  if (absent.length > 0) {
    console.error(`ttheme remove: not installed: ${absent.join(', ')}`)
    return 1
  }
  return 0
}

export function runDefault(name: string): void {
  const home = configHome()
  const catalog = readCatalog(home)
  const state = readInstalled(home)
  if (!state.palettes.includes(name)) {
    throw new Error(`${name} is not installed — \`ttheme add ${name}\` first`)
  }
  const { off: _, ...rest } = state
  const prefs = itermDefaults()
  const next = withItermBase({ ...rest, startup: name }, prefs)
  sync(home, catalog, next)
  writeInstalled(home, next)
  const moved = pointItermDefault(next, prefs)
  console.log(defaultNote(name, next.terminals, moved && prefs.running()).join('\n'))
}

export function runOn(): void {
  const home = configHome()
  const state = readInstalled(home)
  const name = startupPalette(state)
  if (!name) {
    throw new Error('no palettes installed — `ttheme browse` picks some')
  }
  if (!state.off) {
    console.log(`Already on · ${name}`)
    return
  }
  const { off: _, ...next } = state
  const restart = commit(home, readCatalog(home), state, next)
  console.log(defaultNote(name, next.terminals, restart).join('\n'))
}

export function runOff(): void {
  const home = configHome()
  const state = readInstalled(home)
  if (state.off) {
    console.log('Already off')
    return
  }
  const restart = commit(home, readCatalog(home), state, { ...state, off: true })
  const name = startupPalette(state)
  console.log(`Off · new tabs open in the terminal's own colors${name ? ` — \`ttheme on\` wears ${name} again` : ''}`)
  if (restart) {
    console.log('iTerm2 new tabs open on your own profile once iTerm2 restarts')
  }
}

function defaultNote(name: string, terminals: InitTerminal[], restart: boolean): string[] {
  const wearing = terminals.filter((t) => t !== 'iterm2')
  const lines =
    wearing.length > 0
      ? [
          `Default ${name} · ${wearing.map((t) => TERMINAL_NAMES[t]).join(', ')} open new tabs with it once their config reloads`,
        ]
      : []
  if (terminals.includes('iterm2')) {
    lines.push(
      restart
        ? `iTerm2 new tabs open with it once iTerm2 restarts — "ttheme · default" is now its default profile`
        : `iTerm2 new tabs open with it — "ttheme · default" is its default profile`,
    )
  }
  return lines.length > 0
    ? lines
    : [`Default ${name} · no terminal is wired to open with it — \`ttheme init\` wires one`]
}

type Source = 'market' | 'mine' | 'kept'

function sources(home: string, catalog: Manifest): Map<string, Source> {
  const out = new Map<string, Source>(catalog.palettes.map((p) => [p.name, 'market']))
  for (const p of readLocal(home, catalog.palettes, false)) {
    out.set(p.name, 'mine')
  }
  return out
}

export function runList(query: string | undefined, json = false): void {
  const home = configHome()
  const catalog = readCatalog(home)
  const installed = new Set(readInstalled(home).palettes)
  const from = sources(home, catalog)
  const all = listed(available(home, catalog).palettes)
  const hits = alphabetical(query ? search(all, query) : all)
  const source = (name: string): Source => from.get(name) ?? 'kept'
  if (json) {
    const rows = hits.map((p) => ({
      name: p.name,
      group: p.group,
      ...(p.catalog ? { catalog: p.catalog } : {}),
      installed: installed.has(p.name),
      source: source(p.name),
    }))
    console.log(JSON.stringify(rows, null, 2))
    return
  }
  const pad = Math.max(...hits.map((p) => p.name.length), 0)
  const note: Record<Source, string> = { market: '', mine: '  · yours', kept: '  · in no market you added' }
  for (const p of hits) {
    const group = p.catalog ? `${p.group} / ${p.catalog}` : p.group
    console.log(`  ${installed.has(p.name) ? '●' : '○'} ${p.name.padEnd(pad)}  ${group}${note[source(p.name)]}`)
  }
  if (process.stdout.isTTY) {
    const shown = query ? `${hits.length} of ${all.length}` : `${all.length}`
    console.log(`\n${shown} palettes — ${hits.filter((p) => installed.has(p.name)).length} installed`)
  }
}

export async function runUpdate(): Promise<void> {
  const home = configHome()
  const markets = marketSources(home)
  if (markets.length === 0) {
    console.log('No markets to update — `ttheme market add official` brings the ttheme catalog back')
  }
  const kept = (source: string, error: unknown): string =>
    `${shownSource(source)}: ${(error as Error).message} — kept the copy from the last update`
  for (const source of markets.filter(isLocal)) {
    try {
      console.log(`  ${localLine(home, source)}`)
    } catch (error) {
      console.log(`  ${kept(source, error)}`)
    }
  }
  const remote = markets.filter((source) => !isLocal(source))
  const waiting = new Set(remote)
  const line = pending()
  const show = (): void =>
    line.set(
      `Updating ${[...waiting].map(shownSource).join(', ')}${remote.length > 1 ? ` · ${remote.length - waiting.size}/${remote.length}` : ''}`,
    )
  show()
  await Promise.all(
    remote.map(async (source) => {
      let text: string
      try {
        text = refreshLine(await refreshMarket(home, source))
      } catch (error) {
        text = kept(source, error)
      }
      waiting.delete(source)
      if (waiting.size > 0) {
        show()
      } else {
        line.done()
      }
      line.say(`  ${text}`)
    }),
  )
  line.done()
  if (!existsSync(installedPath(home))) {
    return
  }
  const catalog = readCatalog(home)
  const state = readInstalled(home)
  const from = sources(home, catalog)
  const gone = state.palettes.filter((name) => !from.has(name))
  const was = new Map(readKept(home).map((e) => [e.name, e.pictures]))
  sync(home, catalog, state)
  for (const name of gone) {
    console.log(`  ${name} left its market — ttheme keeps the copy you have`)
  }
  await bringPictures(
    home,
    available(home, catalog, false)
      .palettes.filter((e) => state.palettes.includes(e.name) && was.has(e.name))
      .map((e) => since(e, was.get(e.name))),
    state.terminals,
  )
}

export async function pickPalettes(
  catalog: Manifest,
  installed: string[],
  scope: PickerScope,
  required = false,
): Promise<string[] | undefined> {
  const entries = process.env.TTHEME_SORT === 'series' ? catalog.palettes : alphabetical(catalog.palettes)
  const live = livePaint(process.env, process.stdout.isTTY === true)
  const saved = live ? await live.saved() : new Map<string, string>()
  const prompt = new PalettePrompt({
    entries,
    scope,
    installed,
    required,
    color: !colorless(),
    fx: promptFx(process.env.TTHEME_FX),
    onFocus: live ? (entry) => process.stdout.write(live.paint(entry)) : undefined,
  })
  const done = await prompt.prompt()
  if (live) {
    process.stdout.write(live.restore(saved))
  }
  if (p.isCancel(done)) {
    return undefined
  }
  return catalog.palettes.filter((e) => prompt.picked.has(e.name)).map((e) => e.name)
}
