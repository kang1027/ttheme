import assert from 'node:assert/strict'
import { test } from 'node:test'
import { oklch } from './color.ts'
import { renderEditor } from './editor-screen.ts'
import { type EditorOptions, listOf, PaletteEditor, parseColor } from './palette-editor.ts'
import { type Colors, grow, SEEDS } from './seeds.ts'

const start: Colors = grow(SEEDS)
const other: Colors = grow({ ...SEEDS, hue: 20, background: 0.15 })

function editor(opts: Partial<EditorOptions> = {}): PaletteEditor {
  return new PaletteEditor({
    title: 'Edit palette',
    name: 'kec@dust/dusk',
    colors: start,
    signature: ['background', 'foreground', 'cursor'],
    palettes: [{ name: 'kec@dust/dawn', colors: other }],
    check: () => undefined,
    ...opts,
  })
}

function press(e: PaletteEditor, ...keys: string[]): PaletteEditor {
  for (const key of keys) {
    e.press(key)
  }
  return e
}

function screen(e: PaletteEditor, cols = 100, rows = 30): string {
  return renderEditor(e, cols, rows, false).join('\n')
}

const RED = ['down', 'down', 'down', 'down', 'down']

test('new starts on the seeds, and enter moves to the slots with what they grew', () => {
  const e = editor({ title: 'New palette', colors: undefined })
  assert.match(screen(e), /\[SEEDS\]/)
  press(e, 'down', 'right', 'enter')
  assert.equal(e.mode, 'list')
  assert.deepEqual(e.colors(), grow({ ...SEEDS, foreground: 0.89 }))
  press(e, 'enter')
  assert.equal(e.result, 'saved')
})

test('tab tunes one channel of one slot, enter keeps it, and u takes the whole tune back', () => {
  const e = press(editor(), ...RED, 'tab', 'down', 'down', 'right', 'shift-right', 'enter')
  const changed = listOf(e.colors()).flatMap((c, i) => (c === listOf(start)[i] ? [] : [i]))
  assert.deepEqual(changed, [5])
  assert.equal(Math.round(e.lch[5]?.h ?? 0), Math.round(oklch(start.ansi[1] as string).h) + 11)
  press(e, 'u')
  assert.deepEqual(e.colors(), start)
})

test('esc in tune puts the slot back as it was', () => {
  const e = press(editor(), ...RED, 'tab', '9', 'esc')
  assert.equal(e.mode, 'list')
  assert.deepEqual(e.colors(), start)
})

test('# takes hex, rgb() or oklch(), and a paste sets the focused slot', () => {
  assert.equal(parseColor('#F00'), '#ff0000')
  assert.equal(parseColor('rgb(0 128 255)'), '#0080ff')
  assert.match(parseColor('oklch(70% 0.1 250)') ?? '', /^#[0-9a-f]{6}$/)
  assert.equal(parseColor('red'), undefined)
  const e = press(editor(), ...RED, 'right', '#', ...'ff0000', 'enter')
  assert.equal(e.colors().ansi[9], '#ff0000')
  e.paste('rgb(0 0 255)')
  assert.equal(e.colors().ansi[9], '#0000ff')
})

test('c and v copy a slot, = makes the bright follow its normal, r puts a slot back', () => {
  const e = press(editor(), ...RED, 'c', 'right', 'v')
  assert.equal(e.colors().ansi[9], start.ansi[1])
  press(e, 'r')
  assert.equal(e.colors().ansi[9], start.ansi[9])
  press(e, 'left', 'tab', 'down', 'down', '5', 'enter', '=')
  assert.equal(e.col, 1)
  assert.ok(Math.abs((e.lch[13]?.h ?? 0) - (e.lch[5]?.h ?? 0)) < 1)
})

test('* marks a signature color, keeping the last three', () => {
  const e = press(editor(), ...RED, '*')
  assert.deepEqual(e.signature, ['foreground', 'cursor', 'ansi1'])
  press(e, '*')
  assert.deepEqual(e.signature, ['foreground', 'cursor'])
  assert.match(e.notice ?? '', /needs three/)
})

test('o takes another palette’s colors, filtered by what is typed', () => {
  const e = press(editor(), 'o', 'd', 'a', 'w')
  assert.match(screen(e), /Take colors from {2}daw▏/)
  press(e, 'enter')
  assert.deepEqual(e.colors(), other)
  assert.match(e.notice ?? '', /kec@dust\/dawn/)
})

test('space shows the colors you started from without touching yours', () => {
  const e = press(editor(), ...RED, 'tab', '9', 'enter', ' ')
  assert.deepEqual(e.shown(), listOf(start))
  assert.notDeepEqual(e.colors(), start)
  assert.match(screen(e), /\[BEFORE\]/)
})

test('f moves the colors the gate misses', () => {
  const dim = { ...start, ansi: start.ansi.map((c, i) => (i === 1 ? '#301010' : c)) }
  const e = press(editor({ colors: dim }), 'f')
  assert.notEqual(e.colors().ansi[1], '#301010')
  assert.match(e.notice ?? '', /Moved \d+ colors? — passes the gate/)
})

test('esc asks before throwing changes away, and a palette that cannot be read is not saved', () => {
  const e = press(editor({ check: () => 'meta.signature slots must resolve to three different colors' }), 'tab', '9')
  press(e, 'enter', 'enter')
  assert.equal(e.result, undefined)
  assert.match(e.notice ?? '', /signature/)
  press(e, 'esc')
  assert.match(screen(e), /\[QUIT\] Discard changes\?/)
  press(e, 'n')
  assert.equal(e.result, undefined)
  press(e, 'esc', 'y')
  assert.equal(e.result, 'cancelled')
})

test('the screen fits 80×24 and says what it needs below that', () => {
  const lines = renderEditor(press(editor(), ...RED), 80, 24, true)
  assert.equal(lines.length, 24)
  assert.match(renderEditor(editor(), 70, 20, false).join('\n'), /Needs 80×24 — now 70×20/)
  const red = screen(press(editor(), ...RED))
  assert.match(red, /Red {2}ansi 1/)
  assert.match(red, /Hue 19° · in red 19±25°/)
})

test('p, ctrl+v, an empty paste and a pasted path or link each ask find for a picture', () => {
  const find = async () => ({ count: 1 })
  assert.deepEqual(press(editor({ find }), 'p').wants, {})
  assert.deepEqual(press(editor({ find }), 'ctrl-v').wants, { start: { clipboard: true } })
  const empty = editor({ find })
  empty.paste('')
  assert.deepEqual(empty.wants, { start: { clipboard: true } })
  const link = editor({ find })
  link.paste('https://example.com/a.png')
  assert.deepEqual(link.wants, { start: { paste: 'https://example.com/a.png' } })
  const color = editor({ find })
  color.paste('#ff0000')
  assert.equal(color.wants, undefined)
  assert.equal(color.colors().background, '#ff0000')
  assert.match(press(editor(), 'p').notice ?? '', /Pictures need/)
})

test('a picture find added counts as a change, and esc says it goes too', () => {
  const e = editor({ find: async () => ({ count: 1 }), pictures: 0 })
  e.found({ count: 1, note: 'Background · kec@dust/dusk ← danbooru 1' })
  assert.equal(e.added, 1)
  assert.match(screen(e), /▣ 1 picture/)
  press(e, 'esc')
  assert.match(screen(e), /Discard changes and 1 picture\?/)
})
