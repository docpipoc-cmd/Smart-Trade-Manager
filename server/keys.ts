// Where provider API keys live. They never reach the renderer: the UI can only
// set/clear a key and ask whether one is configured.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export interface KeyStore {
  get(name: string): string | null
  set(name: string, value: string | null): void
}

/** Plain JSON file (web/dev mode — the file sits in the project's .data folder, outside the served root). */
export function fileKeyStore(path: string, codec?: { enc(s: string): Buffer; dec(b: Buffer): string }): KeyStore {
  const load = (): Record<string, string> => {
    try {
      if (!existsSync(path)) return {}
      const raw = readFileSync(path)
      return JSON.parse(codec ? codec.dec(raw) : raw.toString('utf8'))
    } catch {
      return {}
    }
  }
  return {
    get: (name) => load()[name] ?? null,
    set(name, value) {
      const all = load()
      if (value) all[name] = value
      else delete all[name]
      if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true })
      const txt = JSON.stringify(all)
      writeFileSync(path, codec ? codec.enc(txt) : txt)
    }
  }
}
