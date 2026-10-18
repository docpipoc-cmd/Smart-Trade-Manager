import { useEffect, useRef, useState } from 'react'
import { I } from './icons'
import { L } from '../lib/i18n'
import { checkImage, imageUrl } from '../lib/images'
import type { TradeImage } from '../lib/types'
import { useApp } from './ui'

export interface PendingImage {
  key: string
  kind: 'entry' | 'exit' | 'other'
  file: File
  url: string
}

/** Thumbnail of a stored screenshot (loads the file lazily). */
export function StoredThumb({ img, onOpen, onRemove, onReplace }: { img: TradeImage; onOpen(url: string): void; onRemove?(): void; onReplace?(f: File): void }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const rep = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let live = true
    imageUrl(img.file, img.mime).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [img.file, img.mime])
  return (
    <div className="thumb">
      {url === undefined ? (
        <div className="thumb-ph shimmer" />
      ) : url === null ? (
        <div className="thumb-ph missing" title={L('Arquivo da imagem não encontrado', 'Image file not found')}>
          <I.warn />
        </div>
      ) : (
        <button type="button" className="thumb-img" onClick={() => onOpen(url)} title={L('Ampliar', 'Enlarge')}>
          <img src={url} alt={img.caption || img.name} />
          <span className="thumb-zoom">
            <I.zoom />
          </span>
        </button>
      )}
      <div className="thumb-actions">
        {onReplace && (
          <>
            <button type="button" className="icon-btn" title={L('Substituir', 'Replace')} onClick={() => rep.current?.click()}>
              <I.refresh />
            </button>
            <input ref={rep} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && onReplace(e.target.files[0])} />
          </>
        )}
        {onRemove && (
          <button type="button" className="icon-btn red" title={L('Remover', 'Remove')} onClick={onRemove}>
            <I.trash />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Drop zone for entry or exit screenshots: click, drag & drop or paste (Ctrl+V when focused).
 * Shows previews of new files (not saved yet) next to the ones already stored.
 */
export function ImageDrop(p: {
  kind: 'entry' | 'exit' | 'other'
  title: string
  stored: TradeImage[]
  pending: PendingImage[]
  onAdd(files: File[]): void
  onRemovePending(key: string): void
  onRemoveStored(id: string): void
  onReplaceStored?(id: string, f: File): void
}) {
  const app = useApp()
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const take = (list: FileList | File[]) => {
    const ok: File[] = []
    for (const f of Array.from(list)) {
      const err = checkImage(f)
      if (err === 'type') app.toast(L(`${f.name}: use PNG, JPG ou WEBP`, `${f.name}: use PNG, JPG or WEBP`), 'err')
      else if (err === 'size') app.toast(L(`${f.name}: máximo 10 MB`, `${f.name}: 10 MB maximum`), 'err')
      else ok.push(f)
    }
    if (ok.length) p.onAdd(ok)
  }
  const all: ({ s: TradeImage; x?: undefined } | { x: PendingImage; s?: undefined })[] = [...p.stored.map((s) => ({ s })), ...p.pending.map((x) => ({ x }))]
  const openAt = (i: number) =>
    Promise.all(all.map(async (a) => (a.s ? { url: (await imageUrl(a.s.file, a.s.mime)) ?? '', name: a.s.name, caption: a.s.caption } : { url: a.x!.url, name: a.x!.file.name }))).then((imgs) =>
      app.lightbox(imgs.filter((x) => x.url), i)
    )
  return (
    <div className="img-zone">
      <div className="img-zone-head">
        <b>{p.title}</b>
        <span className="xs muted">{all.length ? `${all.length} ${all.length === 1 ? L('imagem', 'image') : L('imagens', 'images')}` : 'PNG · JPG · WEBP · ≤10 MB'}</span>
      </div>
      <div
        className={'drop img-drop' + (over ? ' over' : '')}
        tabIndex={0}
        role="button"
        aria-label={`${p.title}: ${L('adicionar imagens', 'add images')}`}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ref.current?.click())}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          take(e.dataTransfer.files)
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files)
          if (files.length) (e.preventDefault(), take(files))
        }}
      >
        <I.image className="drop-ico" />
        <div className="small bold">{L('Clique, arraste ou cole (Ctrl+V)', 'Click, drop or paste (Ctrl+V)')}</div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => (e.target.files && take(e.target.files), (e.target.value = ''))} />
      </div>
      {all.length > 0 && (
        <div className="thumbs">
          {p.stored.map((s, i) => (
            <StoredThumb key={s.id} img={s} onOpen={() => openAt(i)} onRemove={() => p.onRemoveStored(s.id)} onReplace={p.onReplaceStored ? (f) => p.onReplaceStored!(s.id, f) : undefined} />
          ))}
          {p.pending.map((x, i) => (
            <div className="thumb pending" key={x.key}>
              <button type="button" className="thumb-img" onClick={() => openAt(p.stored.length + i)}>
                <img src={x.url} alt={x.file.name} />
                <span className="thumb-new">{L('novo', 'new')}</span>
              </button>
              <div className="thumb-actions">
                <button type="button" className="icon-btn red" title={L('Remover', 'Remove')} onClick={() => p.onRemovePending(x.key)}>
                  <I.trash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
