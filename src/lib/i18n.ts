// Interface language. Every visible text is written as L('português', 'English'),
// so both translations live next to each other in the code.

export type Lang = 'pt' | 'en'

let lang: Lang = (() => {
  try {
    const v = localStorage.getItem('lang')
    return v === 'en' || v === 'pt' ? v : 'pt'
  } catch {
    return 'pt'
  }
})()
const subs = new Set<() => void>()

export function getLang(): Lang {
  return lang
}

export function setLang(l: Lang): void {
  lang = l
  try {
    localStorage.setItem('lang', l)
  } catch {
    /* private mode */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l === 'en' ? 'en' : 'pt-BR'
  subs.forEach((s) => s())
}

/** L('Salvar', 'Save') → the text in the current language. */
export function L(pt: string, en: string): string {
  return lang === 'en' ? en : pt
}

/** For useSyncExternalStore (kept React-free so the parsers can run in Node tests). */
export function subscribeLang(cb: () => void): () => void {
  subs.add(cb)
  return () => subs.delete(cb)
}

/**
 * A record whose values follow the current language: langRecord({ a: ['pt', 'en'] }).a
 * Works with indexing and Object.entries.
 */
export function langRecord<K extends string>(map: Record<K, [string, string]>): Record<K, string> {
  return new Proxy({} as Record<K, string>, {
    get: (_, k) => (map[k as K] ? L(map[k as K][0], map[k as K][1]) : undefined),
    ownKeys: () => Object.keys(map),
    getOwnPropertyDescriptor: (_, k) => (map[k as K] ? { enumerable: true, configurable: true, value: L(map[k as K][0], map[k as K][1]) } : undefined)
  })
}

export const MONTHS_EN =['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_EN_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
