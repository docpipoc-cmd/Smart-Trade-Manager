import { useEffect, useState } from 'react'
import { I } from './icons'
import { L } from '../lib/i18n'
import type { LightboxImage } from './ui'

/** Full-screen image viewer with zoom (click / wheel), pan and ← → navigation. */
export function Lightbox({ images, index, onClose }: { images: LightboxImage[]; index: number; onClose(): void }) {
  const [i, setI] = useState(index)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const img = images[i]
  const go = (d: number) => {
    setI((v) => (v + d + images.length) % images.length)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }
  useEffect(() => {
    // Capture phase + stopPropagation: Escape closes only the viewer, not the trade dialog under it
    const k = (e: KeyboardEvent) => {
      if (!['Escape', 'ArrowRight', 'ArrowLeft', '+', '=', '-'].includes(e.key)) return
      e.stopPropagation()
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(6, z * 1.25))
      else if (e.key === '-') setZoom((z) => Math.max(1, z / 1.25))
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [images.length])
  if (!img) return null
  return (
    <div className="lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lb-bar">
        <span className="ellipsis">
          {img.kind && <span className="badge gray" style={{ marginRight: 8 }}>{img.kind}</span>}
          {img.caption || img.name}
          {images.length > 1 && <span className="muted"> · {i + 1}/{images.length}</span>}
        </span>
        <div className="row">
          <button className="lb-btn" onClick={() => setZoom((z) => Math.max(1, z / 1.25))} aria-label={L('Diminuir zoom', 'Zoom out')}>
            −
          </button>
          <span className="xs" style={{ width: 44, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button className="lb-btn" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} aria-label={L('Aumentar zoom', 'Zoom in')}>
            +
          </button>
          <button className="lb-btn" onClick={onClose} aria-label={L('Fechar', 'Close')}>
            <I.x />
          </button>
        </div>
      </div>
      <div
        className={'lb-stage' + (zoom > 1 ? ' zoomed' : '')}
        onWheel={(e) => setZoom((z) => Math.max(1, Math.min(6, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))}
        onMouseDown={(e) => zoom > 1 && setDrag({ x: e.clientX - pan.x, y: e.clientY - pan.y })}
        onMouseMove={(e) => drag && setPan({ x: e.clientX - drag.x, y: e.clientY - drag.y })}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
        onDoubleClick={() => (zoom > 1 ? (setZoom(1), setPan({ x: 0, y: 0 })) : setZoom(2.5))}
      >
        <img src={img.url} alt={img.caption || img.name} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} draggable={false} />
      </div>
      {images.length > 1 && (
        <>
          <button className="lb-nav prev" onClick={() => go(-1)} aria-label={L('Anterior', 'Previous')}>
            <I.chevronLeft />
          </button>
          <button className="lb-nav next" onClick={() => go(1)} aria-label={L('Próxima', 'Next')}>
            <I.chevronRight />
          </button>
        </>
      )}
      <div className="lb-hint xs">{L('Duplo clique ou roda do mouse para zoom · arraste para mover · ← → navega', 'Double-click or wheel to zoom · drag to pan · ← → to navigate')}</div>
    </div>
  )
}
