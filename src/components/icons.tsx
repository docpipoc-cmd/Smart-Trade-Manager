import type { SVGProps } from 'react'

const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
type P = SVGProps<SVGSVGElement>
const mk = (d: React.ReactNode) => (p: P) => (
  <svg {...base} {...p}>
    {d}
  </svg>
)

export const I = {
  dashboard: mk(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  register: mk(<><path d="M4 6h16M4 12h16M4 18h10" /></>),
  review: mk(<><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9" /></>),
  check: mk(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 10h7M6 14h4M15 14h3" /></>),
  import: mk(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></>),
  statement: mk(<><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>),
  pl: mk(<><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>),
  rules: mk(<><path d="M13 2L3 14h9l-1 8 10-12h-9z" /></>),
  categories: mk(<><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>),
  settings: mk(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>),
  search: mk(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>),
  plus: mk(<path d="M12 5v14M5 12h14" />),
  edit: mk(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></>),
  trash: mk(<><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></>),
  download: mk(<><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></>),
  sun: mk(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  moon: mk(<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />),
  ok: mk(<path d="M20 6L9 17l-5-5" />),
  x: mk(<path d="M18 6L6 18M6 6l12 12" />),
  warn: mk(<><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>),
  arrowUp: mk(<path d="M12 19V5M5 12l7-7 7 7" />),
  arrowDown: mk(<path d="M12 5v14M19 12l-7 7-7-7" />),
  transfer: mk(<><path d="M17 3l4 4-4 4" /><path d="M21 7H7M7 21l-4-4 4-4" /><path d="M3 17h14" /></>),
  bank: mk(<><path d="M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 21h18" /></>),
  wallet: mk(<><path d="M20 7H5a2 2 0 010-4h14v4" /><path d="M3 5v14a2 2 0 002 2h16V7" /><circle cx="16" cy="14" r="1" /></>),
  invoice: mk(<><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M14.5 8.5c-.4-.9-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4.1 0 1.1-1.1 2-2.5 2-1.1 0-2.2-.6-2.6-1.5M12 5.5v1.5M12 15v1.5" /></>),
  store: mk(<><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0" /><path d="M5 12v9h14v-9M10 21v-5h4v5" /></>),
  repeat: mk(<><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 01-4 4H3" /></>),
  target: mk(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>),
  pie: mk(<><path d="M21.2 15.9A10 10 0 118 2.8" /><path d="M22 12A10 10 0 0012 2v10z" /></>),
  tag: mk(<><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>),
  percent: mk(<><path d="M19 5L5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>),
  car: mk(<><path d="M5 17h14M3 17v-4l2-5a2 2 0 012-1.5h10A2 2 0 0119 8l2 5v4" /><circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" /><path d="M4 12h16" /></>),
  coins: mk(<><ellipse cx="9" cy="6" rx="6" ry="3" /><path d="M3 6v4c0 1.7 2.7 3 6 3s6-1.3 6-3V6" /><path d="M9 13v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4" /><path d="M15 10c3.3 0 6 1.3 6 3" /></>),
  bell: mk(<><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>),
  lock: mk(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>),
  scale: mk(<><path d="M12 3v18M7 21h10M5 7h14" /><path d="M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z" /></>),
  book: mk(<><path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5z" /><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5M8 7h8M8 11h6" /></>),
  card: mk(<><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20M6 15h4" /></>),
  piggy: mk(<><path d="M19 9.5c1-.5 2 0 2 1M5 11a7 6 0 017-5h1a7 6 0 017 6c0 2-1 3.5-2.5 4.5V20h-3v-2h-4v2H7.5v-3C6 16 5 14.5 5 13H3v-3h2.2" /><circle cx="15.5" cy="10.5" r=".6" /></>),
  cash: mk(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.8" /><path d="M6 9v.01M18 15v.01" /></>),
  chartUp: mk(<><path d="M3 20h18" /><path d="M5 16l5-5 3 3 6-7" /><path d="M15 7h4v4" /></>),
  house: mk(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10M10 20v-6h4v6" /></>),
  user: mk(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>),
  users: mk(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><path d="M16 4.5a3.5 3.5 0 010 7M18 14c2 .8 3.5 3 3.5 6" /></>),
  briefcase: mk(<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M2 13h20" /></>),
  folder: mk(<path d="M3 6a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2z" />),
  sparkles: mk(<><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>),
  layers: mk(<><path d="M12 2l10 5-10 5L2 7z" /><path d="M2 12l10 5 10-5M2 17l10 5 10-5" /></>),
  chevronLeft: mk(<path d="M15 18l-6-6 6-6" />),
  chevronRight: mk(<path d="M9 18l6-6-6-6" />),
  pin: mk(<><path d="M9 4h6l-1 5 4 4H6l4-4z" /><path d="M12 13v8" /></>),
  motion: mk(<><path d="M3 12h4M2 7h6M3 17h4" /><circle cx="15" cy="12" r="6" /></>),
  candles: mk(<><path d="M6 3v4M6 15v6M12 2v6M12 14v8M18 5v3M18 17v3" /><rect x="4" y="7" width="4" height="8" rx="1" /><rect x="10" y="8" width="4" height="6" rx="1" /><rect x="16" y="8" width="4" height="9" rx="1" /></>),
  tools: mk(<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />),
  shield: mk(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  image: mk(<><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>),
  calendar: mk(<><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  list: mk(<><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>),
  copy: mk(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></>),
  clock: mk(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  globe: mk(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></>),
  refresh: mk(<><path d="M21 12a9 9 0 01-15.5 6.2L3 16" /><path d="M3 12a9 9 0 0115.5-6.2L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>),
  filter: mk(<path d="M3 5h18l-7 8v6l-4 2v-8z" />),
  eye: mk(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  upload: mk(<><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></>),
  brain: mk(<><path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 006 0V7a3 3 0 00-3-3z" /><path d="M15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-6 0" /></>),
  trophy: mk(<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z" /><path d="M7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4" /></>),
  note: mk(<><path d="M5 3h10l4 4v14H5z" /><path d="M14 3v5h5M8 12h8M8 16h5" /></>),
  more: mk(<><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>),
  menu: mk(<path d="M4 6h16M4 12h16M4 18h16" />),
  zoom: mk(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></>),
  database: mk(<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>),
  key: mk(<><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /></>),
  logo: (p: P) => (
    <svg viewBox="0 0 18 18" fill="none" {...p}>
      <rect x="2" y="10" width="3.5" height="6" rx="1" fill="#fff" />
      <rect x="7.25" y="6.5" width="3.5" height="9.5" rx="1" fill="#fff" />
      <rect x="12.5" y="2" width="3.5" height="14" rx="1" fill="#fff" />
    </svg>
  )
}
