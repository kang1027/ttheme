import { dropImage, showImage } from './backdrop.ts'
import { find, readAvailable } from './catalog.ts'
import { configHome, refreshProfiles } from './palettes.ts'

export function runImage(name: string, action: string, key?: string): number {
  const home = configHome()
  find(readAvailable(home).palettes, name)
  if (action === 'show') {
    if (!key) {
      throw new Error('image show needs the picture to show')
    }
    const { at, of } = showImage(home, name, key)
    refreshProfiles(home)
    process.stderr.write(`Background · ${name} ${at}/${of} ${key}\n`)
    return 0
  }
  if (action === 'drop') {
    const { key: gone, left } = dropImage(home, name, key)
    refreshProfiles(home)
    process.stderr.write(`Background · ${name} removed ${gone} · ${left} left\n`)
    return 0
  }
  if (action === 'tuned') {
    refreshProfiles(home)
    return 0
  }
  throw new Error(`unknown image action ${action} — show, drop or tuned`)
}
