import { dropImage, showImage } from './backdrop.ts'
import { find, readAvailable } from './catalog.ts'
import { configHome, refreshPictures } from './palettes.ts'
import { redrawColoring } from './redraw.ts'

export async function runImage(name: string, action: string, key?: string): Promise<number> {
  const home = configHome()
  find(readAvailable(home).palettes, name)
  if (action === 'show') {
    if (!key) {
      throw new Error('image show needs the picture to show')
    }
    const { at, of } = showImage(home, name, key)
    refreshPictures(home)
    process.stderr.write(`Background · ${name} ${at}/${of} ${key}\n`)
    return 0
  }
  if (action === 'drop') {
    const { key: gone, left } = dropImage(home, name, key)
    refreshPictures(home)
    process.stderr.write(`Background · ${name} removed ${gone} · ${left} left\n`)
    return 0
  }
  if (action === 'tone' || action === 'original') {
    const drawn = await redrawColoring(home, name, action, key)
    process.stderr.write(`Background · ${name} ${drawn.key} ${action === 'tone' ? 'tinted' : 'in its own colors'}\n`)
    return 0
  }
  if (action === 'tuned') {
    refreshPictures(home)
    return 0
  }
  throw new Error(`unknown image action ${action} — show, drop, tone, original or tuned`)
}
