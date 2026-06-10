import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { PhasingPayload, PhasingTrackPayload, SimPayload } from './AnnotationPopup'
import type { AnnotationOut } from './ChromosomeDiagram'
import type { ChromosomeBounds, PairResult } from './ChromosomCanvas'
import type { ProfileMeta } from './SegmentTable'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HG38_LENGTHS: Record<string, number> = {
  '1': 248956422, '2': 242193529, '3': 198295559, '4': 190214555,
  '5': 181538259, '6': 170805979, '7': 159345973, '8': 145138636,
  '9': 138394717, '10': 133797422, '11': 135086622, '12': 133275309,
  '13': 114364328, '14': 107043718, '15': 101991189, '16': 90338345,
  '17': 83257441, '18': 80373285, '19': 58617616, '20': 64444167,
  '21': 46709983, '22': 50818468, 'X': 156040895, 'Y': 57227415,
}

const COLORS: Record<string, string> = {
  FULL: '#22c55e',
  HALF: '#eab308',
  NONE: '#ef4444',
}

const SIM_TRACK_HEIGHT = 20
const PHASING_TRACK_HEIGHT = 28
const TRACK_GAP = 2
const PAD = 4
const CANVAS_MARGIN = 4      // horizontal breathing room
const PAIR_LABEL_WIDTH = 96  // left margin for pair name labels in similarity canvas
const RULER_HEIGHT = 22      // height of position ruler canvas

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface HitTarget {
  x: number
  y: number
  w: number
  h: number
  tooltipContent: string
  payload: SimPayload | PhasingPayload | PhasingTrackPayload
}

interface TooltipState {
  x: number
  y: number
  content: string
}

interface SegmentRow {
  pairLabel: string
  pairIndex: number
  match_type: string
  start_bp: number
  end_bp: number
  length_cm: number | null
  snp_count: number
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  chrom: string
  pairwisePairs: PairResult[]
  phasingPersons: ProfileMeta[]
  annotations: AnnotationOut[]
  ancestorColorMap: Record<string, string>
  chromBounds: ChromosomeBounds | undefined
  chromosomeLengths?: Record<string, number>
  containerWidth: number
  onPopupRequest: (
    payload: SimPayload | PhasingPayload | PhasingTrackPayload,
    clientX: number,
    clientY: number,
  ) => void
}

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

export interface ChromosomSectionHandle {
  openSection: () => void
  getCanvasDataUrl: () => string | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ChromosomSection = forwardRef<ChromosomSectionHandle, Props>(function ChromosomSection({
  chrom,
  pairwisePairs,
  phasingPersons,
  annotations,
  ancestorColorMap,
  chromBounds,
  chromosomeLengths,
  containerWidth,
  onPopupRequest,
}: Props, ref) {
  const [open, setOpen] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)

  // Similarity canvas
  const simCanvasRef = useRef<HTMLCanvasElement>(null)
  const simHits = useRef<HitTarget[]>([])

  // Phasing canvases (one per person) — callback refs into this array
  const phasingCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const phasingHits = useRef<HitTarget[][]>([])

  // Position ruler canvases
  const simRulerRef = useRef<HTMLCanvasElement>(null)
  const phasingRulerRef = useRef<HTMLCanvasElement>(null)

  useImperativeHandle(ref, () => ({
    openSection: () => setOpen(true),
    getCanvasDataUrl: () => {
      const canvases: HTMLCanvasElement[] = [
        simCanvasRef.current,
        simRulerRef.current,
        ...phasingCanvasRefs.current,
        phasingPersons.length > 0 ? phasingRulerRef.current : null,
      ].filter((c): c is HTMLCanvasElement => c !== null && c.width > 0)

      if (canvases.length === 0) return null

      const offscreen = document.createElement('canvas')
      offscreen.width = canvases[0].width
      offscreen.height = canvases.reduce((sum, c) => sum + c.height, 0)
      const ctx = offscreen.getContext('2d')
      if (!ctx) return null

      let y = 0
      for (const canvas of canvases) {
        ctx.drawImage(canvas, 0, y)
        y += canvas.height
      }

      return offscreen.toDataURL('image/jpeg', 0.92)
    },
  }), [open, phasingPersons.length])

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // Derived scale parameters
  const lengths = chromosomeLengths ?? HG38_LENGTHS
  const rangeStart = chromBounds?.start_bp ?? 0
  const rangeEnd = chromBounds?.end_bp ?? (lengths[chrom] ?? 1)
  const rangeWidth = rangeEnd - rangeStart || 1

  const nPairs = pairwisePairs.length
  const simHeight = PAD + nPairs * (SIM_TRACK_HEIGHT + TRACK_GAP) + PAD
  const simTrackWidth = Math.max(1, containerWidth - CANVAS_MARGIN * 2)

  // Segment rows for this chromosome — sorted by pair order (matching canvas tracks),
  // 3-way pair ("Grupowe") appears last.
  const chromSegs: SegmentRow[] = pairwisePairs
    .flatMap((pair, pi) =>
      pair.segments
        .filter(s => s.chromosome === chrom)
        .map(s => ({
          pairLabel: pair.profile_ids.length > 2 ? 'Grupowe' : pair.person_names.join(' vs '),
          pairIndex: pi,
          match_type: s.match_type,
          start_bp: s.start_bp,
          end_bp: s.end_bp,
          length_cm: s.length_cm,
          snp_count: s.snp_count,
        })),
    )
    .sort((a, b) => a.pairIndex - b.pairIndex || a.start_bp - b.start_bp)

  // ---------------------------------------------------------------------------
  // Draw position ruler — shared helper
  // ---------------------------------------------------------------------------

  function drawRuler(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(simTrackWidth * dpr)
    canvas.height = Math.round(RULER_HEIGHT * dpr)
    canvas.style.width = `${simTrackWidth}px`
    canvas.style.height = `${RULER_HEIGHT}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, simTrackWidth, RULER_HEIGHT)

    const dataW = Math.max(1, simTrackWidth - PAIR_LABEL_WIDTH)
    const TICK_COUNT = 10
    const BASELINE_Y = 14
    const TICK_TOP = 9
    const TICK_BOT = 16
    const LABEL_Y = TICK_TOP - 1   // textBaseline = 'bottom'

    // Baseline
    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(PAIR_LABEL_WIDTH, BASELINE_Y)
    ctx.lineTo(simTrackWidth, BASELINE_Y)
    ctx.stroke()

    ctx.font = '9px system-ui, sans-serif'
    ctx.fillStyle = '#9ca3af'
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth = 0.75

    for (let i = 0; i <= TICK_COUNT; i++) {
      const x = PAIR_LABEL_WIDTH + (dataW / TICK_COUNT) * i
      const bp = rangeStart + rangeWidth * (i / TICK_COUNT)
      const label = Math.round(bp / 1_000_000) + 'M'

      ctx.beginPath()
      ctx.moveTo(x, TICK_TOP)
      ctx.lineTo(x, TICK_BOT)
      ctx.stroke()

      ctx.textBaseline = 'bottom'
      ctx.textAlign = i === 0 ? 'left' : i === TICK_COUNT ? 'right' : 'center'
      ctx.fillText(label, x, LABEL_Y)
    }
  }

  // ---------------------------------------------------------------------------
  // Draw similarity canvas
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const canvas = simCanvasRef.current
    if (!canvas || !open || containerWidth === 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(simTrackWidth * dpr)
    canvas.height = Math.round(simHeight * dpr)
    canvas.style.width = `${simTrackWidth}px`
    canvas.style.height = `${simHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, simTrackWidth, simHeight)

    const newHits: HitTarget[] = []
    // Area for segment data (right of the label column)
    const dataW = Math.max(1, simTrackWidth - PAIR_LABEL_WIDTH)

    ctx.font = '10px system-ui, sans-serif'
    ctx.textBaseline = 'middle'

    for (let pi = 0; pi < pairwisePairs.length; pi++) {
      const pair = pairwisePairs[pi]
      const trackY = PAD + pi * (SIM_TRACK_HEIGHT + TRACK_GAP)
      const pairLabel = pair.profile_ids.length > 2
        ? 'Grupowe'
        : pair.person_names.join(' vs ')

      // Pair label on the left
      ctx.fillStyle = '#6b7280'
      ctx.textAlign = 'right'
      const truncated = pairLabel.length > 14 ? pairLabel.slice(0, 13) + '…' : pairLabel
      ctx.fillText(truncated, PAIR_LABEL_WIDTH - 4, trackY + SIM_TRACK_HEIGHT / 2)

      // Gray background track (right of label)
      ctx.fillStyle = '#e5e7eb'
      ctx.fillRect(PAIR_LABEL_WIDTH, trackY, dataW, SIM_TRACK_HEIGHT)

      for (const seg of pair.segments) {
        if (seg.chromosome !== chrom) continue
        const x = PAIR_LABEL_WIDTH + ((seg.start_bp - rangeStart) / rangeWidth) * dataW
        const w = Math.max(2, ((seg.end_bp - seg.start_bp) / rangeWidth) * dataW)
        ctx.fillStyle = COLORS[seg.match_type] ?? '#9ca3af'
        ctx.fillRect(x, trackY, w, SIM_TRACK_HEIGHT)

        const cm = seg.length_cm != null ? ` | ${seg.length_cm.toFixed(1)} cM` : ''
        newHits.push({
          x, y: trackY, w, h: SIM_TRACK_HEIGHT,
          tooltipContent: `Chr${chrom}: ${seg.start_bp.toLocaleString()}–${seg.end_bp.toLocaleString()} bp | ${seg.match_type} | ${seg.snp_count} SNPs${cm} [${pairLabel}]`,
          payload: {
            type: 'sim',
            pair,
            chromosome: chrom,
            start_bp: seg.start_bp,
            end_bp: seg.end_bp,
          },
        })
      }
    }

    simHits.current = newHits
    setTooltip(null)

    if (simRulerRef.current) drawRuler(simRulerRef.current)
  }, [open, containerWidth, pairwisePairs, chrom, rangeStart, rangeWidth, simHeight, simTrackWidth, nPairs])

  // ---------------------------------------------------------------------------
  // Draw phasing canvases (one per person)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!open || containerWidth === 0) return

    // Use same canvas width and data offset as similarity tracks for perfect alignment
    const phWidth = simTrackWidth
    const phDataW = Math.max(1, phWidth - PAIR_LABEL_WIDTH)
    const newAllHits: HitTarget[][] = []

    for (let pp = 0; pp < phasingPersons.length; pp++) {
      const person = phasingPersons[pp]
      const canvas = phasingCanvasRefs.current[pp]

      if (!canvas) {
        newAllHits.push([])
        continue
      }

      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(phWidth * dpr)
      canvas.height = Math.round(PHASING_TRACK_HEIGHT * dpr)
      canvas.style.width = `${phWidth}px`
      canvas.style.height = `${PHASING_TRACK_HEIGHT}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) { newAllHits.push([]); continue }
      ctx.scale(dpr, dpr)

      const halfH = PHASING_TRACK_HEIGHT / 2

      // Person name label on the left (same position as pair labels in similarity)
      ctx.font = '10px system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#6b7280'
      ctx.textAlign = 'right'
      const nameLabel = person.name.length > 11 ? person.name.slice(0, 10) + '…' : person.name
      ctx.fillText(nameLabel, PAIR_LABEL_WIDTH - 4, halfH)

      // Gray background for data area (right of label)
      ctx.fillStyle = '#e5e7eb'
      ctx.fillRect(PAIR_LABEL_WIDTH, 0, phDataW, PHASING_TRACK_HEIGHT)

      const personAnns = annotations.filter(
        a => a.profile_id === person.id && a.chromosome === chrom,
      )

      const hits: HitTarget[] = []

      // Annotation hits FIRST (take priority over gray-track hits below)
      for (const ann of personAnns) {
        const x = PAIR_LABEL_WIDTH + ((ann.start_position - rangeStart) / rangeWidth) * phDataW
        const w = Math.max(2, ((ann.end_position - ann.start_position) / rangeWidth) * phDataW)
        const color =
          ann.ancestor_id && ancestorColorMap[ann.ancestor_id]
            ? ancestorColorMap[ann.ancestor_id]
            : '#9ca3af'
        ctx.fillStyle = color
        if (ann.strand === 'maternal') {
          ctx.fillRect(x, 0, w, halfH)
        } else {
          ctx.fillRect(x, halfH, w, halfH)
        }
        const ancestorSuffix = ann.ancestor_label ? ` → ${ann.ancestor_label}` : ''
        hits.push({
          x,
          y: ann.strand === 'maternal' ? 0 : halfH,
          w,
          h: halfH,
          tooltipContent: `Chr${chrom}: ${ann.start_position.toLocaleString()}–${ann.end_position.toLocaleString()} bp | ${ann.strand} | ${person.name}${ancestorSuffix}`,
          payload: { type: 'phasing', annotation: ann, person, strand: ann.strand },
        })
      }

      // Gray-track catch-all hits AFTER annotation hits
      hits.push({
        x: PAIR_LABEL_WIDTH, y: 0, w: phDataW, h: halfH,
        tooltipContent: `${person.name} — maternal: kliknij aby dodać adnotację`,
        payload: { type: 'phasing-track', person, chromosome: chrom, strand: 'maternal', approxBp: 0 },
      })
      hits.push({
        x: PAIR_LABEL_WIDTH, y: halfH, w: phDataW, h: halfH,
        tooltipContent: `${person.name} — paternal: kliknij aby dodać adnotację`,
        payload: { type: 'phasing-track', person, chromosome: chrom, strand: 'paternal', approxBp: 0 },
      })

      newAllHits.push(hits)
    }

    phasingHits.current = newAllHits
    setTooltip(null)

    if (phasingRulerRef.current) drawRuler(phasingRulerRef.current)
  }, [open, containerWidth, phasingPersons, annotations, ancestorColorMap, chrom, rangeStart, rangeWidth])

  // ---------------------------------------------------------------------------
  // Mouse/click helpers
  // ---------------------------------------------------------------------------

  function tooltipPos(e: React.MouseEvent): { x: number; y: number } {
    const rect = sectionRef.current?.getBoundingClientRect()
    return {
      x: e.clientX - (rect?.left ?? 0) + 12,
      y: e.clientY - (rect?.top ?? 0) - 8,
    }
  }

  function findHit(targets: HitTarget[], mx: number, my: number): HitTarget | undefined {
    return targets.find(t => mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h)
  }

  // Similarity canvas handlers
  function handleSimMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const hit = findHit(simHits.current, e.clientX - rect.left, e.clientY - rect.top)
    setTooltip(hit ? { ...tooltipPos(e), content: hit.tooltipContent } : null)
    e.currentTarget.style.cursor = hit ? 'pointer' : 'crosshair'
  }

  function handleSimClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const hit = findHit(simHits.current, e.clientX - rect.left, e.clientY - rect.top)
    if (hit) onPopupRequest(hit.payload, e.clientX, e.clientY)
    else setTooltip(null)
  }

  // Phasing canvas handlers
  function handlePhasingMouseMove(pp: number, e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const hits = phasingHits.current[pp] ?? []
    const hit = findHit(hits, e.clientX - rect.left, e.clientY - rect.top)
    setTooltip(hit ? { ...tooltipPos(e), content: hit.tooltipContent } : null)
    e.currentTarget.style.cursor = hit ? 'pointer' : 'crosshair'
  }

  function handlePhasingClick(pp: number, e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const hits = phasingHits.current[pp] ?? []
    const hit = findHit(hits, mx, my)
    if (!hit) { setTooltip(null); return }
    if (hit.payload.type === 'phasing-track') {
      const phDataW = Math.max(1, simTrackWidth - PAIR_LABEL_WIDTH)
      const approxBp = Math.round(rangeStart + ((mx - PAIR_LABEL_WIDTH) / phDataW) * rangeWidth)
      onPopupRequest({ ...hit.payload, approxBp }, e.clientX, e.clientY)
    } else {
      onPopupRequest(hit.payload, e.clientX, e.clientY)
    }
  }

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div ref={sectionRef} className="relative border-b border-gray-100 last:border-0">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs text-gray-400">{open ? '▼' : '▶'}</span>
        <span>Chromosom {chrom}</span>
        <span className="ml-auto text-xs font-normal text-gray-400">
          {chromSegs.length} seg.
        </span>
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3">
          {/* Similarity canvas */}
          <div className="relative">
            <canvas
              ref={simCanvasRef}
              onMouseMove={handleSimMouseMove}
              onMouseLeave={() => setTooltip(null)}
              onClick={handleSimClick}
              className="block"
              style={{ cursor: 'crosshair', marginLeft: CANVAS_MARGIN, marginRight: CANVAS_MARGIN }}
            />
            <canvas
              ref={simRulerRef}
              className="block"
              style={{ marginLeft: CANVAS_MARGIN, marginRight: CANVAS_MARGIN }}
            />
          </div>

          {/* Phasing rows — one per person */}
          {phasingPersons.length > 0 && (
            <div className="space-y-1">
              {phasingPersons.map((person, pp) => (
                <div key={person.id} style={{ marginLeft: CANVAS_MARGIN, marginRight: CANVAS_MARGIN }}>
                  <canvas
                    ref={el => { phasingCanvasRefs.current[pp] = el }}
                    onMouseMove={e => handlePhasingMouseMove(pp, e)}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={e => handlePhasingClick(pp, e)}
                    className="block"
                    style={{ cursor: 'crosshair' }}
                  />
                </div>
              ))}
              <div style={{ marginLeft: CANVAS_MARGIN, marginRight: CANVAS_MARGIN }}>
                <canvas ref={phasingRulerRef} className="block" />
              </div>
            </div>
          )}

          {/* Segment table */}
          {chromSegs.length > 0 && (
            <div className="overflow-x-auto rounded border border-gray-100">
              <table className="min-w-full divide-y divide-gray-100 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {['Para', 'Typ', 'Start bp', 'End bp', 'cM', 'SNPs'].map(col => (
                      <th key={col} className="px-3 py-1.5 text-left font-medium text-gray-500">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {chromSegs.map((seg, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1 text-gray-700">{seg.pairLabel}</td>
                      <td className="px-3 py-1">
                        <span
                          className={`font-mono font-semibold ${
                            seg.match_type === 'FULL'
                              ? 'text-green-600'
                              : seg.match_type === 'HALF'
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }`}
                        >
                          {seg.match_type}
                        </span>
                      </td>
                      <td className="px-3 py-1 font-mono text-gray-600">
                        {seg.start_bp.toLocaleString()}
                      </td>
                      <td className="px-3 py-1 font-mono text-gray-600">
                        {seg.end_bp.toLocaleString()}
                      </td>
                      <td className="px-3 py-1 text-gray-600">
                        {seg.length_cm != null ? seg.length_cm.toFixed(1) : '—'}
                      </td>
                      <td className="px-3 py-1 text-gray-600">{seg.snp_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Section-level tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 max-w-xs rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  )
})

export default ChromosomSection
