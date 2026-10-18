import { useId, type CSSProperties, type ReactNode } from 'react'

/**
 * Isometric header scenes. Each section has a default scene; the main pages get a
 * symbol of their own (a car on a road for mileage, a piggy bank for planning…).
 * Colors come from the section palette (--iso-top/left/right, --spark, --sa/sb/sc).
 */
export type SceneKind =
  | 'towers'
  | 'vault'
  | 'stairs'
  | 'forge'
  | 'crystals'
  | 'road'
  | 'piggy'
  | 'pie'
  | 'invoice'
  | 'shop'
  | 'calc'
  | 'house'
  | 'checkbook'
  | 'tray'
  | 'ledger'
  | 'scale'
  | 'verify'
  | 'bridge'
  | 'bell'
  | 'lock'
  | 'gear'
  | 'bolt'
  | 'layers'
  | 'cycle'

type Vars = CSSProperties & Record<`--${string}`, string | number>
type C3 = [string, string, string]

const TW = 15
const TH = 8.66
const P = (x: number, y: number, z: number): [number, number] => [(x - y) * TW, (x + y) * TH - z]
const pts = (a: [number, number][]) => a.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
const GOLD: C3 = ['#ffd36b', '#e89b1a', '#b86e0a']
const PAPER: C3 = ['#ffffff', '#e8ecf3', '#c9d1df']

interface BoxP {
  x: number
  y: number
  w?: number
  d?: number
  h: number
  z?: number
  i?: number
  c?: C3
  still?: boolean
  plat?: boolean
  className?: string
}
function Box({ x, y, w = 1, d = 1, h, z = 0, i = 0, c, still, plat, className = '' }: BoxP) {
  const t = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)]
  const l = [P(x, y + d, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x, y + d, z)]
  const r = [P(x + w, y, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x + w, y, z)]
  const k = plat ? 'plat-' : ''
  return (
    <g className={(plat || still ? '' : 'iso-b ') + className} style={{ '--i': i } as Vars}>
      <polygon className={k + 'l edge'} points={pts(l)} style={c ? { fill: c[1] } : undefined} />
      <polygon className={k + 'r edge'} points={pts(r)} style={c ? { fill: c[2] } : undefined} />
      <polygon className={k + 't edge'} points={pts(t)} style={c ? { fill: c[0] } : undefined} />
    </g>
  )
}
/** A flat quad lying on a horizontal plane (decals: screens, lines, stamps). */
function Quad({ x, y, w, d, z, fill, className }: { x: number; y: number; w: number; d: number; z: number; fill: string; className?: string }) {
  return <polygon className={className} points={pts([P(x, y, z), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z)])} style={{ fill }} />
}
/** A quad on the front (y = const) face. */
function FrontQuad({ x, y, w, z, h, fill }: { x: number; y: number; w: number; z: number; h: number; fill: string }) {
  return <polygon points={pts([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y, z), P(x, y, z)])} style={{ fill }} />
}
function Line({ a, b, stroke = '#94a3b8', width = 1 }: { a: [number, number, number]; b: [number, number, number]; stroke?: string; width?: number }) {
  const [x1, y1] = P(...a)
  const [x2, y2] = P(...b)
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} strokeLinecap="round" />
}
function Spike({ x, y, w = 0.8, h, z = 0, i = 0, c }: BoxP) {
  const apex = P(x + w / 2, y + w / 2, z + h)
  const l = [P(x, y + w, z), P(x + w, y + w, z), apex]
  const r = [P(x + w, y, z), P(x + w, y + w, z), apex]
  return (
    <g className="iso-b" style={{ '--i': i } as Vars}>
      <polygon className="l edge" points={pts(l)} style={c ? { fill: c[1] } : undefined} />
      <polygon className="r edge" points={pts(r)} style={c ? { fill: c[2] } : undefined} />
    </g>
  )
}
function Roof({ x, y, w, d, z, h, c, i = 0 }: { x: number; y: number; w: number; d: number; z: number; h: number; c: C3; i?: number }) {
  const back = [P(x, y, z), P(x + w, y, z), P(x + w, y + d / 2, z + h), P(x, y + d / 2, z + h)]
  const front = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d / 2, z + h), P(x, y + d / 2, z + h)]
  const gable = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d / 2, z + h)]
  return (
    <g className="iso-b" style={{ '--i': i } as Vars}>
      <polygon className="edge" points={pts(back)} style={{ fill: c[0] }} />
      <polygon className="edge" points={pts(gable)} style={{ fill: c[2] }} />
      <polygon className="edge" points={pts(front)} style={{ fill: c[1] }} />
    </g>
  )
}
function Cyl({ cx, cy, r, h, z = 0, i = 0, c, glowTop, still }: { cx: number; cy: number; r: number; h: number; z?: number; i?: number; c?: C3; glowTop?: boolean; still?: boolean }) {
  const [X, Y0] = P(cx, cy, z)
  const rx = r * TW * 1.414
  const ry = r * TH * 1.414
  const Yt = Y0 - h
  const left = `M${X - rx},${Yt} L${X - rx},${Y0} A${rx},${ry} 0 0 0 ${X},${Y0 + ry} L${X},${Yt + ry} A${rx},${ry} 0 0 1 ${X - rx},${Yt}Z`
  const right = `M${X + rx},${Yt} L${X + rx},${Y0} A${rx},${ry} 0 0 1 ${X},${Y0 + ry} L${X},${Yt + ry} A${rx},${ry} 0 0 0 ${X + rx},${Yt}Z`
  return (
    <g className={still ? '' : 'iso-b'} style={{ '--i': i } as Vars}>
      <path d={left} className={c ? 'edge' : 'l edge'} style={c ? { fill: c[1] } : undefined} />
      <path d={right} className={c ? 'edge' : 'r edge'} style={c ? { fill: c[2] } : undefined} />
      <ellipse cx={X} cy={Yt} rx={rx} ry={ry} className={c ? 'edge' : glowTop ? 'spark iso-glow' : 't edge'} style={c ? { fill: c[0] } : undefined} />
    </g>
  )
}
function Coins({ cx, cy, n, z = 5, i = 0 }: { cx: number; cy: number; n: number; z?: number; i?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, k) => (
        <g key={k} className="iso-b" style={{ '--i': i + k } as Vars}>
          <Cyl cx={cx} cy={cy} r={0.42} h={3.6} z={z + k * 4} c={GOLD} still />
          <ellipse cx={P(cx, cy, z + k * 4 + 3.6)[0]} cy={P(cx, cy, z + k * 4 + 3.6)[1]} rx={0.42 * TW * 0.95} ry={0.42 * TH * 0.95} fill="none" stroke="#c98212" strokeWidth={0.8} />
        </g>
      ))}
    </>
  )
}
function Coin({ cx, cy, z }: { cx: number; cy: number; z: number }) {
  return (
    <g className="iso-coin">
      <Cyl cx={cx} cy={cy} r={0.55} h={4} z={z} c={GOLD} still />
    </g>
  )
}
function Sphere({ cx, cy, z, r, grad }: { cx: number; cy: number; z: number; r: number; grad: string }) {
  const [X, Y] = P(cx, cy, z)
  return (
    <g className="iso-float">
      <ellipse cx={X} cy={P(cx, cy, 0)[1] + 2} rx={r * 0.9} ry={r * 0.32} fill="#000" opacity={0.25} />
      <circle cx={X} cy={Y} r={r} fill={`url(#${grad})`} />
      <circle cx={X - r * 0.35} cy={Y - r * 0.38} r={r * 0.22} fill="#fff" opacity={0.7} />
    </g>
  )
}
function Particles({ list }: { list: [number, number, number][] }) {
  return (
    <>
      {list.map(([x, y, z], i) => {
        const [X, Y] = P(x, y, z)
        return <rect key={i} className="iso-p spark" x={X} y={Y} width={3} height={3} rx={0.6} style={{ '--i': i } as Vars} />
      })}
    </>
  )
}
function Shadow({ cx, cy, rx, ry = rx * 0.35 }: { cx: number; cy: number; rx: number; ry?: number }) {
  const [X, Y] = P(cx, cy, 5)
  return <ellipse cx={X} cy={Y} rx={rx} ry={ry} fill="#000" opacity={0.28} />
}
/** Stack of paper sheets with text lines on top. */
function Papers({ x, y, w, d, n = 3, accent, i = 0 }: { x: number; y: number; w: number; d: number; n?: number; accent?: string; i?: number }) {
  const top = 5 + n * 1.3
  const ox = x + (n - 1) * 0.12
  return (
    <>
      {Array.from({ length: n }, (_, k) => (
        <Box key={k} x={x + k * 0.12} y={y - k * 0.08} w={w} d={d} h={1.3} z={5 + k * 1.3} c={PAPER} i={i + k} />
      ))}
      <g className="iso-b" style={{ '--i': i + n } as Vars}>
        {[0.35, 0.65, 0.95, 1.25, 1.55, 1.85].filter((k) => k < d - 0.3).map((k, j) => (
          <Line key={k} a={[ox + 0.3, y - (n - 1) * 0.08 + k, top]} b={[ox + w - (j % 2 ? 0.9 : 0.4), y - (n - 1) * 0.08 + k, top]} />
        ))}
        {accent && <Quad x={ox + 0.25} y={y - (n - 1) * 0.08 + d - 0.75} w={0.9} d={0.45} z={top} fill={accent} />}
      </g>
    </>
  )
}

function gearPath(r: number, teeth: number, depth: number): string {
  const out: string[] = []
  for (let k = 0; k < teeth * 2; k++) {
    const a0 = (Math.PI * k) / teeth
    const a1 = (Math.PI * (k + 1)) / teeth
    const rr = k % 2 ? r - depth : r
    const t = 0.18 / teeth
    out.push(`${(Math.cos(a0 + t) * rr).toFixed(2)},${(Math.sin(a0 + t) * rr).toFixed(2)}`, `${(Math.cos(a1 - t) * rr).toFixed(2)},${(Math.sin(a1 - t) * rr).toFixed(2)}`)
  }
  return 'M' + out.join(' L') + 'Z'
}

export function IsoScene({ kind, className = '' }: { kind: SceneKind; className?: string }) {
  const id = 's' + useId().replace(/:/g, '')
  const plat = <Box x={-0.4} y={-0.4} w={4.8} d={3.8} h={5} plat />
  const [BX, BY] = P(2, 1.5, 5) // center of the platform top
  let body: ReactNode
  let noPlat = false

  switch (kind) {
    case 'towers': {
      const bars: BoxP[] = [
        { x: 0.2, y: 0.3, h: 12 },
        { x: 1.3, y: 0.3, h: 20 },
        { x: 2.4, y: 0.3, h: 30 },
        { x: 3.5, y: 0.3, h: 44 },
        { x: 0.2, y: 1.7, h: 18 },
        { x: 1.3, y: 1.7, h: 28 },
        { x: 2.4, y: 1.7, h: 42 },
        { x: 3.5, y: 1.7, h: 60 }
      ]
      body = (
        <>
          {bars
            .sort((a, b) => a.x + a.y - (b.x + b.y))
            .map((b, i) => (
              <Box key={i} {...b} w={0.8} d={0.8} z={5} i={i} />
            ))}
          <Coin cx={4.6} cy={-0.6} z={74} />
          <Coin cx={-0.2} cy={2.2} z={44} />
          <Particles list={[[1, 0, 30], [2.6, 1, 50], [3.9, 2, 66], [0.6, 2.4, 26]]} />
        </>
      )
      break
    }
    case 'vault':
      body = (
        <>
          <Box x={0.3} y={0.5} w={2.8} d={1.7} h={8} z={5} i={0} />
          {[0.5, 1.15, 1.8, 2.45].map((x, i) => (
            <Box key={i} x={x} y={1.75} w={0.32} d={0.32} h={22} z={13} i={i + 1} />
          ))}
          <Box x={0.2} y={0.4} w={3} d={1.9} h={5} z={35} i={5} />
          <Box x={0.6} y={0.75} w={2.2} d={1.2} h={6} z={40} i={6} />
          <Coins cx={4} cy={1.6} n={4} i={7} />
          <Sphere cx={-0.4} cy={0.2} z={62} r={9} grad={id + 'sp'} />
          <Particles list={[[3.8, 0.4, 40], [1.6, 2.6, 30], [0.2, 2.6, 20]]} />
        </>
      )
      break
    case 'stairs':
      body = (
        <>
          {[8, 16, 25, 35].map((h, i) => (
            <Box key={i} x={0.2 + i * 0.95} y={1.1} w={0.95} d={1.7} h={h} z={5} i={i} />
          ))}
          <Box x={0.4} y={0.1} w={0.7} d={0.7} h={10} z={5} i={4} />
          <Cyl cx={3.6} cy={1.9} r={0.08} h={22} z={40} i={5} />
          <Sphere cx={3.6} cy={1.9} z={70} r={8} grad={id + 'sp'} />
          <Sphere cx={-0.2} cy={2.6} z={42} r={5.5} grad={id + 'sp'} />
          <Particles list={[[1.2, 2, 30], [2.4, 2.2, 44], [3.2, 0.6, 52]]} />
        </>
      )
      break
    case 'forge':
      body = (
        <>
          <Box x={0.2} y={0.3} w={1.2} d={1.2} h={18} z={5} i={0} />
          <Box x={1.7} y={0.2} w={1} d={1} h={28} z={5} i={1} />
          <Cyl cx={3.4} cy={0.7} r={0.38} h={50} z={5} i={2} glowTop />
          <Box x={0.3} y={1.9} w={1.7} d={0.9} h={10} z={5} i={3} />
          <Box x={2.4} y={1.6} w={1.1} d={1.1} h={16} z={5} i={4} />
          <Box x={3.7} y={2.2} w={0.6} d={0.6} h={7} z={5} i={5} />
          <Particles list={[[3.4, 0.7, 60], [3.3, 0.6, 64], [3.5, 0.8, 58], [3.4, 0.5, 66], [1.2, 2.5, 22]]} />
        </>
      )
      break
    case 'crystals': {
      const spikes: BoxP[] = [
        { x: 1.1, y: 0.2, w: 0.85, h: 52 },
        { x: 2.6, y: 0.4, w: 0.7, h: 40 },
        { x: 0.3, y: 1.1, w: 0.75, h: 32 },
        { x: 1.9, y: 1.2, w: 0.95, h: 70 },
        { x: 3.2, y: 1.6, w: 0.6, h: 28 },
        { x: 1.2, y: 2.3, w: 0.6, h: 22 },
        { x: 2.5, y: 2.5, w: 0.5, h: 16 }
      ]
      const [rx, ry] = [2.1 * TW * 1.414, 2.1 * TH * 1.414]
      const [cx, cy] = P(2.2, 1.6, 5)
      body = (
        <>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className="ring iso-glow" />
          {spikes
            .sort((a, b) => a.x + a.y - (b.x + b.y))
            .map((s, i) => (
              <Spike key={i} {...s} z={5} i={i} />
            ))}
          <Sphere cx={4.2} cy={-0.4} z={64} r={7} grad={id + 'sp'} />
          <Particles list={[[0.8, 0.6, 50], [2.8, 1.8, 76], [3.6, 0.6, 46], [1.6, 2.8, 34]]} />
        </>
      )
      break
    }

    // ───────── page symbols
    case 'road': {
      // Mileage: a car driving along a road, with a road sign and trees
      noPlat = true
      const car: C3 = ['#ffd27a', '#f59e0b', '#b45309']
      const glass: C3 = ['#d6ecff', '#9cc7ef', '#5f8fbf']
      const [w1x, w1y] = P(0.85, 2.05, 1.6)
      const [w2x, w2y] = P(1.75, 2.05, 1.6)
      body = (
        <>
          <Box x={-0.6} y={-0.2} w={5.6} d={3.4} h={4} c={['#2d6a4f', '#1f4d3a', '#163829']} still />
          <Box x={-0.6} y={1.0} w={5.6} d={1.6} h={0.6} z={4} c={['#3a3d45', '#2a2c33', '#1c1d22']} still />
          {[0, 1, 2, 3, 4].map((k) => (
            <Quad key={k} x={-0.3 + k * 1.1} y={1.74} w={0.55} d={0.14} z={4.7} fill="#ffd166" />
          ))}
          <Spike x={0.1} y={0.05} w={0.7} h={24} z={4} i={0} c={['#4ade80', '#22c55e', '#15803d']} />
          <Spike x={1.1} y={-0.1} w={0.55} h={17} z={4} i={1} c={['#4ade80', '#22c55e', '#15803d']} />
          <Cyl cx={3.9} cy={0.55} r={0.07} h={26} z={4} i={2} c={['#cbd5e1', '#94a3b8', '#64748b']} />
          <g className="iso-b" style={{ '--i': 3 } as Vars}>
            <polygon points={pts([P(3.6, 0.55, 40), P(3.9, 0.55, 46), P(4.2, 0.55, 40), P(3.9, 0.55, 34)])} style={{ fill: '#fbbf24' }} stroke="#92400e" strokeWidth={0.8} />
          </g>
          <g className="iso-drive">
            <Box x={0.6} y={1.25} w={1.5} d={0.8} h={6} z={4.6} c={car} still />
            <Box x={0.9} y={1.3} w={0.85} d={0.7} h={4.5} z={10.6} c={glass} still />
            <circle cx={w1x} cy={w1y} r={3.4} fill="#111" />
            <circle cx={w1x} cy={w1y} r={1.4} fill="#9ca3af" />
            <circle cx={w2x} cy={w2y} r={3.4} fill="#111" />
            <circle cx={w2x} cy={w2y} r={1.4} fill="#9ca3af" />
            <circle cx={P(2.1, 1.85, 8)[0]} cy={P(2.1, 1.85, 8)[1]} r={1.5} fill="#fff7cc" className="iso-glow" />
          </g>
          <Particles list={[[3.3, 2.2, 14], [2.6, 2.4, 10]]} />
        </>
      )
      break
    }
    case 'piggy': {
      // Planning & forecast: piggy bank with a coin dropping in
      const X = BX + 4
      const Y = BY - 2
      body = (
        <>
          <Coins cx={-0.1} cy={0.4} n={3} i={0} />
          <Coins cx={0.5} cy={1.4} n={2} i={3} />
          <Shadow cx={2.3} cy={1.6} rx={34} ry={9} />
          <g className="iso-b" style={{ '--i': 4 } as Vars}>
            {[-18, -6, 8, 20].map((dx, k) => (
              <rect key={k} x={X + dx - 4} y={Y - 12} width={8} height={12} rx={3} fill={k % 2 ? '#db2777' : '#be185d'} />
            ))}
            <path d={`M${X - 30},${Y - 30} q-9,-4 -6,-11 q3,-5 6,1`} fill="none" stroke="#db2777" strokeWidth={2.4} strokeLinecap="round" />
            <ellipse cx={X} cy={Y - 30} rx={31} ry={22} fill={`url(#${id}pig)`} />
            <path d={`M${X + 6},${Y - 48} l7,-12 l6,13 z`} fill="#f472b6" />
            <ellipse cx={X + 29} cy={Y - 29} rx={7} ry={8.5} fill="#f9a8d4" stroke="#db2777" strokeWidth={1.2} />
            <circle cx={X + 27} cy={Y - 31} r={1.4} fill="#9d174d" />
            <circle cx={X + 31} cy={Y - 27} r={1.4} fill="#9d174d" />
            <circle cx={X + 15} cy={Y - 38} r={2.4} fill="#1f2937" />
            <circle cx={X + 15.8} cy={Y - 38.8} r={0.8} fill="#fff" />
            <rect x={X - 9} y={Y - 52.5} width={16} height={3.4} rx={1.7} fill="#831843" />
            <ellipse cx={X - 10} cy={Y - 40} rx={9} ry={5} fill="#fff" opacity={0.35} />
          </g>
          <g className="coin-drop">
            <ellipse cx={X - 1} cy={Y - 64} rx={6.5} ry={6.5} fill="#ffd36b" stroke="#b86e0a" strokeWidth={1.4} />
            <text x={X - 1} y={Y - 60.6} textAnchor="middle" fontSize={9} fontWeight={900} fill="#b86e0a">
              $
            </text>
          </g>
          <Particles list={[[3.6, 0.2, 40], [0.4, 0.2, 30]]} />
        </>
      )
      break
    }
    case 'pie': {
      // Budget: a 3D pie chart with one slice popping out
      const rx = 1.7 * TW * 1.414
      const ry = 1.7 * TH * 1.414
      const H = 10
      const X = BX
      const Yb = BY - 1
      const Yt = Yb - H
      const fr = [0.42, 0.24, 0.2, 0.14]
      const cols = ['var(--sa)', 'var(--sb)', 'var(--spark)', '#94a3b8']
      const side = ['var(--sb)', 'var(--sc)', 'color-mix(in srgb, var(--spark) 65%, #000)', '#64748b']
      let acc = -Math.PI / 2
      const wedges = fr.map((f, k) => {
        const a0 = acc
        acc += f * Math.PI * 2
        return { a0, a1: acc, k }
      })
      const pt = (a: number, yy: number, dx = 0, dy = 0): [number, number] => [X + dx + rx * Math.cos(a), yy + dy + ry * Math.sin(a)]
      const band = (a0: number, a1: number, dx: number, dy: number) => {
        const s = Math.max(a0, 0)
        const e = Math.min(a1, Math.PI)
        if (e <= s) return null
        const top: [number, number][] = []
        const bot: [number, number][] = []
        for (let t = s; t <= e + 1e-6; t += (e - s) / 12) {
          top.push(pt(t, Yt, dx, dy))
          bot.unshift(pt(t, Yb, dx, dy))
        }
        return pts([...top, ...bot])
      }
      const wedge = (a0: number, a1: number, dx: number, dy: number) =>
        `M${X + dx},${Yt + dy} L${pt(a0, Yt, dx, dy).join(',')} A${rx},${ry} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(a1, Yt, dx, dy).join(',')}Z`
      const pop = 2
      body = (
        <>
          <Shadow cx={2} cy={1.5} rx={rx + 4} ry={ry * 0.75} />
          {wedges.map(({ a0, a1, k }) => {
            const mid = (a0 + a1) / 2
            const off = k === pop ? [Math.cos(mid) * 9, Math.sin(mid) * 5] : [0, 0]
            const b = band(a0, a1, off[0], off[1])
            return (
              <g key={k} className={'iso-b' + (k === pop ? ' slice-pop' : '')} style={{ '--i': k } as Vars}>
                {k === pop && (
                  <>
                    <polygon points={pts([[X + off[0], Yt + off[1]], pt(a0, Yt, off[0], off[1]), pt(a0, Yb, off[0], off[1]), [X + off[0], Yb + off[1]]])} style={{ fill: side[k] }} />
                    <polygon points={pts([[X + off[0], Yt + off[1]], pt(a1, Yt, off[0], off[1]), pt(a1, Yb, off[0], off[1]), [X + off[0], Yb + off[1]]])} style={{ fill: side[k] }} />
                  </>
                )}
                {b && <polygon points={b} style={{ fill: side[k] }} className="edge" />}
                <path d={wedge(a0, a1, off[0], off[1])} style={{ fill: cols[k] }} className="edge" />
              </g>
            )
          })}
          <Coins cx={4.1} cy={0.3} n={3} i={5} />
          <Particles list={[[3.8, 2.2, 30], [0.2, 0.4, 36]]} />
        </>
      )
      break
    }
    case 'invoice':
      // Customers & invoices: stack of invoices with a paid stamp and a coin
      body = (
        <>
          <Papers x={0.5} y={0.3} w={2.6} d={2.9} n={4} accent="var(--spark)" />
          <Coins cx={3.8} cy={1.9} n={3} i={6} />
          <Sphere cx={3.9} cy={0} z={58} r={8} grad={id + 'sp'} />
          <Particles list={[[1, 0, 40], [2.6, 0.3, 50]]} />
        </>
      )
      break
    case 'verify':
      // Reconcile / statements: statements with a big check mark
      body = (
        <>
          <Papers x={0.6} y={0.4} w={2.5} d={2.8} n={3} accent="var(--spark)" />
          <g className="iso-float" style={{ animationDuration: '3.5s' }}>
            <path d={`M${BX - 18},${BY - 46} l12,12 l24,-26`} fill="none" stroke="#34d399" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} />
            <path d={`M${BX - 18},${BY - 48} l12,12 l24,-26`} fill="none" stroke="#10b981" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" className="draw-check" />
          </g>
          <Particles list={[[3.6, 0.6, 40], [0.2, 2.4, 30]]} />
        </>
      )
      break
    case 'shop': {
      // Vendors: storefront with striped awning and crates
      const wall: C3 = ['#e2e8f0', '#f8fafc', '#cbd5e1']
      body = (
        <>
          <Box x={0.5} y={0.4} w={2.8} d={1.8} h={24} z={5} c={wall} i={0} />
          <Box x={0.4} y={0.3} w={3} d={2} h={3} z={29} c={['var(--sb)', 'var(--sc)', 'var(--sc)']} i={1} />
          <g className="iso-b" style={{ '--i': 2 } as Vars}>
            <FrontQuad x={0.8} y={2.2} w={0.7} z={5} h={11} fill="#334155" />
            <FrontQuad x={1.8} y={2.2} w={1.2} z={9} h={8} fill="#7dd3fc" />
            <Line a={[2.4, 2.2, 9]} b={[2.4, 2.2, 17]} stroke="#e0f2fe" />
          </g>
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <Box key={k} x={0.5 + k * 0.467} y={2.2} w={0.467} d={0.5} h={2.4} z={19} c={k % 2 ? ['#fff', '#f1f5f9', '#cbd5e1'] : ['var(--spark)', 'color-mix(in srgb, var(--spark) 80%, #000)', 'color-mix(in srgb, var(--spark) 60%, #000)']} i={3 + k} />
          ))}
          <Box x={3.6} y={1.6} w={0.8} d={0.8} h={7} z={5} c={['#d6a26a', '#b07a42', '#8a5a2b']} i={9} />
          <Box x={3.7} y={0.6} w={0.6} d={0.6} h={5} z={5} c={['#d6a26a', '#b07a42', '#8a5a2b']} i={10} />
          <Box x={3.75} y={1.65} w={0.6} d={0.6} h={5} z={12} c={['#e3b67f', '#b07a42', '#8a5a2b']} i={11} />
          <Particles list={[[1.4, 0.4, 50], [2.8, 0.2, 44]]} />
        </>
      )
      break
    }
    case 'calc': {
      // Taxes: calculator with a floating percent sign
      const g: C3 = ['#4a4e58', '#2b2d33', '#1c1d22']
      const keys: ReactNode[] = []
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++)
          keys.push(
            <Box key={r * 4 + c} x={0.95 + c * 0.55} y={1.25 + r * 0.5} w={0.4} d={0.36} h={1.6} z={11} c={c === 3 ? ['#fbbf24', '#d97706', '#92400e'] : ['#6b7280', '#4b5563', '#374151']} i={2 + r} still={false} />
          )
      body = (
        <>
          <Box x={0.7} y={0.2} w={2.6} d={3.2} h={6} z={5} c={g} i={0} />
          <g className="iso-b" style={{ '--i': 1 } as Vars}>
            <Quad x={0.95} y={0.4} w={2.1} d={0.65} z={11} fill="#d9f99d" />
            <text x={P(2.2, 0.75, 11)[0]} y={P(2.2, 0.75, 11)[1] + 2} fontSize={6} fontWeight={800} fill="#365314" textAnchor="middle" transform={`skewY(30) translate(0, ${-P(2.2, 0.75, 11)[0] * Math.tan(Math.PI / 6)})`}>
              1,099.00
            </text>
          </g>
          {keys}
          <g className="iso-float" style={{ animationDuration: '4s' }}>
            <text x={P(3.9, 0.2, 52)[0]} y={P(3.9, 0.2, 52)[1]} fontSize={30} fontWeight={900} fill="var(--spark)" textAnchor="middle" style={{ filter: 'drop-shadow(0 0 6px var(--glow))' }}>
              %
            </text>
          </g>
          <Particles list={[[3.6, 2.6, 20], [0.3, 0.3, 30]]} />
        </>
      )
      break
    }
    case 'house': {
      // Loans & assets: house with a stack of coins
      const wall: C3 = ['#f1f5f9', '#e2e8f0', '#94a3b8']
      body = (
        <>
          <Box x={0.6} y={0.5} w={2.3} d={1.9} h={17} z={5} c={wall} i={0} />
          <Roof x={0.45} y={0.35} w={2.6} d={2.2} z={22} h={14} c={['var(--sc)', 'var(--sb)', 'color-mix(in srgb, var(--sb) 70%, #000)']} i={1} />
          <Box x={2.2} y={0.6} w={0.35} d={0.35} h={10} z={30} c={['#94a3b8', '#64748b', '#475569']} i={2} />
          <g className="iso-b" style={{ '--i': 3 } as Vars}>
            <FrontQuad x={1.0} y={2.4} w={0.55} z={5} h={9} fill="#7c2d12" />
            <FrontQuad x={1.85} y={2.4} w={0.75} z={10} h={5} fill="#fde68a" />
          </g>
          <Coins cx={3.8} cy={1.7} n={5} i={4} />
          <Coins cx={3.9} cy={0.6} n={2} i={9} />
          <Particles list={[[2.4, 0.6, 50], [2.5, 0.7, 56]]} />
        </>
      )
      break
    }
    case 'checkbook':
      // Checks: checkbook with a pen
      body = (
        <>
          <Box x={0.3} y={0.5} w={3.6} d={2} h={2.4} z={5} c={['#1e3a8a', '#1e40af', '#172554']} i={0} />
          <Box x={0.45} y={0.6} w={3.3} d={1.8} h={1.2} z={7.4} c={['#e0f2fe', '#bae6fd', '#7dd3fc']} i={1} />
          <g className="iso-b" style={{ '--i': 2 } as Vars}>
            <Line a={[0.8, 1.3, 8.6]} b={[2.9, 1.3, 8.6]} stroke="#0369a1" />
            <Line a={[0.8, 1.75, 8.6]} b={[3.4, 1.75, 8.6]} stroke="#0369a1" />
            <Quad x={2.9} y={0.85} w={0.6} d={0.32} z={8.6} fill="#fff" />
            <Line a={[0.8, 2.15, 8.6]} b={[2.2, 2.15, 8.6]} stroke="#64748b" />
          </g>
          <g className="iso-b pen-write" style={{ '--i': 3 } as Vars}>
            <Box x={1.6} y={2.65} w={2.6} d={0.22} h={1.4} z={5} c={['#ff8a6b', 'var(--spark)', 'color-mix(in srgb, var(--spark) 60%, #000)']} still />
            <Box x={4.2} y={2.68} w={0.35} d={0.16} h={1} z={5.2} c={['#e5e7eb', '#9ca3af', '#6b7280']} still />
          </g>
          <Coins cx={-0.2} cy={2.4} n={2} i={4} />
          <Particles list={[[3.6, 0.2, 30], [1, 0, 40]]} />
        </>
      )
      break
    case 'tray':
      // Import: statements dropping into an inbox tray
      body = (
        <>
          <Box x={0.5} y={0.7} w={3} d={2.3} h={7} z={5} c={['var(--sb)', 'var(--sc)', 'color-mix(in srgb, var(--sc) 70%, #000)']} i={0} />
          <Quad x={0.75} y={0.9} w={2.5} d={1.9} z={12} fill="color-mix(in srgb, var(--sc) 60%, #000)" />
          {[0, 1, 2].map((k) => (
            <g key={k} className="doc-fall" style={{ animationDelay: k * 1.1 + 's' }}>
              <Box x={1.0 + k * 0.08} y={1.05} w={1.9} d={1.6} h={0.7} z={13} c={PAPER} still />
              <Line a={[1.25 + k * 0.08, 1.4, 13.7]} b={[2.5, 1.4, 13.7]} />
              <Line a={[1.25 + k * 0.08, 1.75, 13.7]} b={[2.2, 1.75, 13.7]} />
              <Quad x={1.25 + k * 0.08} y={2.1} w={0.6} d={0.3} z={13.7} fill="var(--spark)" />
            </g>
          ))}
          <g className="iso-float" style={{ animationDuration: '2.4s' }}>
            <path d={`M${BX + 46},${BY - 70} v18 m-8,-8 l8,8 l8,-8`} fill="none" stroke="var(--spark)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <Particles list={[[3.9, 0.2, 30], [0.1, 2.6, 20]]} />
        </>
      )
      break
    case 'ledger':
      // Register: a ledger book with a bookmark, and a smaller book on top
      body = (
        <>
          <Box x={0.4} y={0.5} w={3.2} d={2.4} h={9} z={5} c={['var(--sb)', '#f8fafc', 'var(--sc)']} i={0} />
          <g className="iso-b" style={{ '--i': 1 } as Vars}>
            {[6.5, 8, 9.5, 11].map((z) => (
              <Line key={z} a={[0.5, 2.9, z]} b={[3.5, 2.9, z]} stroke="#cbd5e1" width={0.7} />
            ))}
            <polygon points={pts([P(2.6, 2.9, 14), P(2.9, 2.9, 14), P(2.9, 2.9, 1), P(2.75, 2.9, 3.5), P(2.6, 2.9, 1)])} style={{ fill: 'var(--spark)' }} />
          </g>
          <Box x={0.8} y={0.8} w={2.5} d={1.8} h={6} z={14} c={['var(--sa)', '#f1f5f9', 'var(--sb)']} i={2} />
          <g className="iso-b" style={{ '--i': 3 } as Vars}>
            <Quad x={1.3} y={1.2} w={1.4} d={0.5} z={20} fill="rgba(255,255,255,.75)" />
          </g>
          <Coins cx={4.1} cy={1.9} n={2} i={4} />
          <Particles list={[[3.8, 0.3, 40], [0.2, 0.1, 34]]} />
        </>
      )
      break
    case 'scale': {
      // Balance sheet: balance scale (assets = liabilities + equity)
      const top = BY - 64
      body = (
        <>
          <Cyl cx={2} cy={1.5} r={0.7} h={4} z={5} i={0} />
          <Box x={1.9} y={1.4} w={0.2} d={0.2} h={50} z={9} i={1} />
          <g className="scale-tilt" style={{ transformOrigin: `${BX}px ${top}px` }}>
            <rect x={BX - 48} y={top - 2} width={96} height={4.5} rx={2.2} fill="var(--iso-top)" />
            <circle cx={BX} cy={top} r={4.5} fill="var(--spark)" />
            {[-1, 1].map((s) => (
              <g key={s}>
                <line x1={BX + s * 44} y1={top} x2={BX + s * 44 - 12} y2={top + 24} stroke="#cbd5e1" strokeWidth={1} />
                <line x1={BX + s * 44} y1={top} x2={BX + s * 44 + 12} y2={top + 24} stroke="#cbd5e1" strokeWidth={1} />
                <ellipse cx={BX + s * 44} cy={top + 25} rx={15} ry={4.5} fill="var(--iso-left)" stroke="var(--iso-right)" />
              </g>
            ))}
            {[0, 1, 2].map((k) => (
              <g key={k}>
                <rect x={BX - 51} y={top + 15 - k * 4} width={14} height={4} rx={2} fill="#e89b1a" />
                <ellipse cx={BX - 44} cy={top + 15 - k * 4} rx={7} ry={2} fill="#ffd36b" />
              </g>
            ))}
            <rect x={BX + 37} y={top + 8} width={14} height={16} rx={1.5} fill="#fff" />
            <line x1={BX + 40} y1={top + 13} x2={BX + 48} y2={top + 13} stroke="#94a3b8" />
            <line x1={BX + 40} y1={top + 17} x2={BX + 46} y2={top + 17} stroke="#94a3b8" />
          </g>
          <Particles list={[[3.8, 0.3, 50], [0.2, 2.6, 30]]} />
        </>
      )
      break
    }
    case 'bridge': {
      // Transfers: two buildings with a coin flying between them
      const a = P(0.6, 1.2, 33)
      const b = P(3.4, 1.0, 41)
      const path = `M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2},${Math.min(a[1], b[1]) - 40} ${b[0]},${b[1]}`
      body = (
        <>
          <Box x={0.1} y={0.7} w={1} d={1} h={28} z={5} i={0} />
          <Box x={2.9} y={0.5} w={1} d={1} h={36} z={5} i={1} />
          <Box x={0.2} y={2.1} w={0.9} d={0.8} h={12} z={5} i={2} />
          <Box x={2.9} y={2.0} w={1} d={0.9} h={16} z={5} i={3} />
          <path d={path} fill="none" stroke="var(--spark)" strokeWidth={1.6} strokeDasharray="4 4" className="dash-flow" />
          <g>
            <ellipse rx={6} ry={6} fill="#ffd36b" stroke="#b86e0a" strokeWidth={1.4} />
            <text y={3.2} textAnchor="middle" fontSize={8.5} fontWeight={900} fill="#b86e0a">
              $
            </text>
            <animateMotion dur="2.6s" repeatCount="indefinite" path={path} keyPoints="0;1;1" keyTimes="0;0.8;1" calcMode="linear" />
          </g>
        </>
      )
      break
    }
    case 'bell': {
      // Alerts: a ringing bell
      const X = BX + 2
      const Y = BY - 12
      body = (
        <>
          <Shadow cx={2} cy={1.6} rx={26} />
          <g className="bell-swing" style={{ transformOrigin: `${X}px ${Y - 56}px` }}>
            <path d={`M${X - 22},${Y - 6} q2,-8 6,-14 q0,-26 16,-30 q16,4 16,30 q4,6 6,14 z`} fill={`url(#${id}bell)`} />
            <rect x={X - 25} y={Y - 8} width={50} height={6} rx={3} fill="color-mix(in srgb, var(--sb) 80%, #000)" />
            <circle cx={X} cy={Y - 52} r={3.6} fill="var(--sb)" />
            <circle cx={X} cy={Y + 1} r={5} fill="var(--spark)" />
            <path d={`M${X - 12},${Y - 36} q2,-10 9,-12`} stroke="#fff" strokeWidth={2.4} fill="none" opacity={0.6} strokeLinecap="round" />
          </g>
          {[1, 2].map((k) => (
            <g key={k} className="wave" style={{ animationDelay: k * 0.35 + 's' }}>
              <path d={`M${X + 28 + k * 7},${Y - 44} q${8},${12} 0,${26}`} fill="none" stroke="var(--spark)" strokeWidth={2.2} strokeLinecap="round" />
              <path d={`M${X - 28 - k * 7},${Y - 44} q${-8},${12} 0,${26}`} fill="none" stroke="var(--spark)" strokeWidth={2.2} strokeLinecap="round" />
            </g>
          ))}
        </>
      )
      break
    }
    case 'lock': {
      // Period close: padlock that opens and closes
      const [lx, ly] = P(1.1, 1.9, 21)
      const [rx2, ry2] = P(2.9, 1.9, 21)
      body = (
        <>
          <g className="shackle">
            <path d={`M${lx + 6},${ly} V${ly - 14} a${(rx2 - lx - 12) / 2},${(rx2 - lx - 12) / 2} 0 0 1 ${rx2 - lx - 12},${ry2 - ly} V${ry2}`} fill="none" stroke="#94a3b8" strokeWidth={7} strokeLinecap="round" />
            <path d={`M${lx + 6},${ly} V${ly - 14} a${(rx2 - lx - 12) / 2},${(rx2 - lx - 12) / 2} 0 0 1 ${rx2 - lx - 12},${ry2 - ly} V${ry2}`} fill="none" stroke="#e2e8f0" strokeWidth={3} strokeLinecap="round" />
          </g>
          <Box x={0.9} y={1.0} w={2.2} d={1.1} h={18} z={5} c={['#fcd34d', '#f59e0b', '#b45309']} i={0} />
          <g className="iso-b" style={{ '--i': 1 } as Vars}>
            <circle cx={P(2, 2.1, 15)[0]} cy={P(2, 2.1, 15)[1]} r={2.6} fill="#451a03" />
            <polygon points={pts([P(1.93, 2.1, 14), P(2.07, 2.1, 14), P(2.12, 2.1, 9), P(1.88, 2.1, 9)])} fill="#451a03" />
          </g>
          <Coins cx={3.9} cy={1.8} n={2} i={2} />
          <Particles list={[[0.2, 0.3, 30], [3.6, 0.4, 44]]} />
        </>
      )
      break
    }
    case 'gear': {
      // Settings: two meshing gears lying on the platform
      const big = gearPath(26, 10, 6)
      const small = gearPath(15, 7, 5)
      body = (
        <>
          {[
            { cx: BX - 12, cy: BY - 20, d: big, r: 8, cls: 'spin', depth: 6 },
            { cx: BX + 27, cy: BY - 9, d: small, r: 5, cls: 'spin-rev', depth: 5 }
          ].map((gr, k) => (
            <g key={k} transform={`translate(${gr.cx} ${gr.cy}) scale(1 0.58)`} className="iso-b" style={{ '--i': k } as Vars}>
              <g transform={`translate(0 ${gr.depth / 0.58})`}>
                <path d={gr.d} className={gr.cls} fill="color-mix(in srgb, var(--sc) 70%, #000)" />
              </g>
              <path d={gr.d} className={gr.cls} fill={`url(#${id}gear)`} stroke="rgba(255,255,255,.3)" strokeWidth={0.8} />
              <circle r={gr.r} fill="color-mix(in srgb, var(--sc) 60%, #000)" />
            </g>
          ))}
          <Sphere cx={4} cy={-0.2} z={56} r={6} grad={id + 'sp'} />
          <Particles list={[[0.6, 0.3, 40], [3.2, 2.4, 30]]} />
        </>
      )
      break
    }
    case 'bolt': {
      // Automatic rules: an extruded lightning bolt
      const X = BX
      const Y = BY - 6
      const d = `M${X + 6},${Y - 64} L${X - 16},${Y - 28} L${X - 2},${Y - 28} L${X - 10},${Y} L${X + 16},${Y - 38} L${X + 2},${Y - 38} Z`
      body = (
        <>
          <Shadow cx={2} cy={1.6} rx={22} />
          <g className="iso-b" style={{ '--i': 0 } as Vars}>
            <path d={d} transform="translate(4 4)" fill="color-mix(in srgb, var(--sc) 75%, #000)" />
            <path d={d} fill={`url(#${id}bolt)`} stroke="rgba(255,255,255,.5)" strokeWidth={1} className="flicker" />
          </g>
          <Spike x={0.2} y={0.6} w={0.6} h={26} z={5} i={1} />
          <Spike x={3.5} y={1.8} w={0.55} h={20} z={5} i={2} />
          <Spike x={3.2} y={0.2} w={0.5} h={32} z={5} i={3} />
          <Particles list={[[1, 0.4, 50], [3, 1.4, 60], [0.4, 2.4, 30]]} />
        </>
      )
      break
    }
    case 'layers': {
      // Chart of accounts: floating stacked layers
      const cs: C3[] = [
        ['var(--sa)', 'var(--sb)', 'var(--sc)'],
        ['var(--spark)', 'color-mix(in srgb, var(--spark) 75%, #000)', 'color-mix(in srgb, var(--spark) 55%, #000)'],
        ['var(--iso-top)', 'var(--iso-left)', 'var(--iso-right)'],
        ['#e2e8f0', '#94a3b8', '#64748b']
      ]
      body = (
        <>
          {[0, 1, 2, 3].map((k) => (
            <g key={k} className="layer-float" style={{ animationDelay: k * 0.25 + 's' }}>
              <Box x={0.7} y={0.5} w={2.6} d={2.3} h={3.2} z={6 + k * 11} c={cs[3 - k]} i={k} />
            </g>
          ))}
          <Particles list={[[3.7, 0.4, 40], [0.2, 2.4, 30]]} />
        </>
      )
      break
    }
    case 'cycle': {
      // Recurring: a calendar with an orbiting ring
      const [cx, cy] = P(2, 1.5, 14)
      body = (
        <>
          <Box x={1} y={0.7} w={2} d={1.7} h={16} z={5} c={['#f8fafc', '#e2e8f0', '#94a3b8']} i={0} />
          <Box x={0.95} y={0.65} w={2.1} d={1.8} h={4} z={21} c={['var(--spark)', 'color-mix(in srgb, var(--spark) 80%, #000)', 'color-mix(in srgb, var(--spark) 60%, #000)']} i={1} />
          <g className="iso-b" style={{ '--i': 2 } as Vars}>
            {[0, 1, 2].map((r) =>
              [0, 1, 2].map((c) => <Quad key={r * 3 + c} x={1.2 + c * 0.55} y={2.4} w={0.3} d={0} z={0} fill="none" />)
            )}
            <text x={P(2, 2.4, 9)[0]} y={P(2, 2.4, 9)[1]} fontSize={13} fontWeight={900} fill="var(--sc)" textAnchor="middle">
              30
            </text>
          </g>
          <ellipse cx={cx} cy={cy} rx={56} ry={20} fill="none" stroke="var(--sa)" strokeWidth={2.4} strokeDasharray="10 8" className="dash-flow" opacity={0.85} />
          <g>
            <circle r={5} fill="#ffd36b" stroke="#b86e0a" strokeWidth={1.2} />
            <animateMotion dur="5s" repeatCount="indefinite" path={`M${cx - 56},${cy} a56,20 0 1,0 112,0 a56,20 0 1,0 -112,0`} />
          </g>
        </>
      )
      break
    }
  }

  return (
    <svg className={'iso ' + className} viewBox="-84 -90 176 146" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <radialGradient id={id + 'sp'} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="35%" stopColor="var(--spark)" />
          <stop offset="100%" stopColor="color-mix(in srgb, var(--spark) 45%, #000)" />
        </radialGradient>
        <radialGradient id={id + 'pig'} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fde2ef" />
          <stop offset="45%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#9d174d" />
        </radialGradient>
        <linearGradient id={id + 'bell'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--sa)" />
          <stop offset="60%" stopColor="var(--sb)" />
          <stop offset="100%" stopColor="var(--sc)" />
        </linearGradient>
        <linearGradient id={id + 'gear'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--sa)" />
          <stop offset="100%" stopColor="var(--sb)" />
        </linearGradient>
        <linearGradient id={id + 'bolt'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="45%" stopColor="var(--sa)" />
          <stop offset="100%" stopColor="var(--sc)" />
        </linearGradient>
      </defs>
      <g className="iso-float" style={{ animationDuration: '8s' }}>
        {!noPlat && plat}
        {body}
      </g>
    </svg>
  )
}
