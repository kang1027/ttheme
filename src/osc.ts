import { openSync, writeSync } from 'node:fs'
import { ReadStream } from 'node:tty'
import type { PaletteEntry } from './emit/manifest.ts'

export const SLOT_CODES: readonly string[] = ['11', '10', '12', '17', ...Array.from({ length: 16 }, (_, i) => `4;${i}`)]

export function colorless(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.NO_COLOR) || env.TERM === 'dumb'
}

export function slotOsc(slot: number, color: string): string {
  return `\x1b]${SLOT_CODES[slot]};${color}\x1b\\`
}

export function paletteOsc(entry: PaletteEntry, slots?: readonly number[]): string {
  return [entry.background, entry.foreground, entry.cursor, entry.selection, ...entry.ansi]
    .map((color, slot) => (slots && !slots.includes(slot) ? '' : slotOsc(slot, color)))
    .join('')
}

function resetOsc(code: string): string {
  return `\x1b]${code.startsWith('4;') ? `104;${code.slice(2)}` : `1${code}`}\x1b\\`
}

export function parseOscColors(text: string): Map<string, string> {
  const colors = new Map<string, string>()
  for (const part of text.split('\x1b')) {
    const match = part.match(/^\](\d+(?:;\d+)?);(rgba?:[0-9a-fA-F/]+)/)
    const [, code, value] = match ?? []
    if (code && value) {
      colors.set(code, value)
    }
  }
  return colors
}

export function restoreOsc(saved: ReadonlyMap<string, string>, codes: readonly string[] = [...saved.keys()]): string {
  return codes
    .map((code) => {
      const value = saved.get(code)
      return value ? `\x1b]${code};${value}\x1b\\` : resetOsc(code)
    })
    .join('')
}

export function colorQuery(codes: readonly string[] = SLOT_CODES): string {
  return `${codes.map((code) => `\x1b]${code};?\x1b\\`).join('')}\x1b[5n`
}

export function answered(replies: string): boolean {
  return replies.includes('\x1b[0n')
}

export async function queryTerminalColors(codes: readonly string[] = SLOT_CODES): Promise<Map<string, string>> {
  let fd: number
  let stream: ReadStream
  try {
    fd = openSync('/dev/tty', 'r+')
    stream = new ReadStream(fd)
    stream.setRawMode(true)
  } catch {
    return new Map()
  }
  try {
    writeSync(fd, colorQuery(codes))
    let buffer = ''
    await new Promise<void>((resolve) => {
      const deadline = setTimeout(resolve, 120)
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        if (answered(buffer)) {
          clearTimeout(deadline)
          resolve()
        }
      })
    })
    return parseOscColors(buffer)
  } finally {
    stream.setRawMode(false)
    stream.destroy()
  }
}
