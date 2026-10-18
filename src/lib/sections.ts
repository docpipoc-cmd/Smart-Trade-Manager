import type { SceneKind } from '../components/scenes'

export type Page = 'dashboard' | 'portfolios' | 'trades' | 'analytics' | 'tools' | 'admin' | 'settings'

/** Sidebar sections reuse the $mart palettes (see theme.css `.sec-*`). */
export type SectionId = 'overview' | 'banking' | 'business' | 'tax' | 'setup'

export const SECTION_OF: Record<Page, SectionId> = {
  dashboard: 'overview',
  analytics: 'overview',
  portfolios: 'business',
  trades: 'banking',
  tools: 'tax',
  admin: 'setup',
  settings: 'setup'
}

const PAGE_SCENE: Record<Page, SceneKind> = {
  dashboard: 'towers',
  analytics: 'stairs',
  portfolios: 'vault',
  trades: 'ledger',
  tools: 'calc',
  admin: 'layers',
  settings: 'gear'
}
export const sceneFor = (p: Page): SceneKind => PAGE_SCENE[p]
