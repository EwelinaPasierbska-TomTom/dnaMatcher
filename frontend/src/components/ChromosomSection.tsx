import { useEffect, useRef, useState } from 'react'
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
const CANVAS_MARGIN = 4  // horizontal breathing room

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
// Component
// ---------------------------------------------------------------------------

export default function ChromosomSection({
  chrom,
  pairwisePairs,
  phasingPersons,
  annotations,
  ancestorColorMap,
  chromBounds,
  chromosomeLengths,
  containerWidth,
  onPopupRequest,
}: Props) {
  const [open, setOpen] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)

  // Similarity canvas
  const simCanvasRef = useRef<HTMLCanvasElement>(null)
  const simHits = useRef<HitTarget[]>([])

  // Phasing canvases (one per person) — callback refs into this array
  const phasingCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const phasingHits = useRef<HitTarget[][]>([])

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // Derived scale parameters
  const lengths = chromosomeLengths ?? HG38_LENGTHS
  const rangeStart = chromBounds?.start_bp ?? 0
  const rangeEnd = chromBounds?.end_bp ?? (lengths[chrom] ?? 1)
  const rangeWidth = rangeEnd - rangeStart || 1

  const nPairs = pairwisePairs.length
  const simHeight = PAD + nPairs * (SIM_TRACK_HEIGHT + TRACK_GAP) + PAD
  const simTrackWidth = Math.max(1, containerWidth - CANVAS_MARGIN * 2)

  // Segment rows for this chromosome
  const chromSegs: SegmentRow[] = pairwisePairs
    .flatMap(pair =>
      pair.segments
        .filter(s => s.chromosome === chrom)
        .map(s => ({
          pairLabel: pair.person_names.join(' vs '),
          match_type: s.match_type,
          start_bp: s.start_bp,
          end_bp: s.end_bp,
          length_cm: s.length_cm,
          snp_count: s.snp_count,
        })),
    )
    .sort((a, b) => a.start_bp - b.start_bp)

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

    for (let pi = 0; pi < pairwisePairs.length; pi++) {
      const pair = pairwisePairs[pi]
      const trackY = PAD + pi * (SIM_TRACK_HEIGHT + TRACK_GAP)

      // Gray background
      ctx.fillStyle = '#e5e7eb'
      ctx.fillRect(0, trackY, simTrackWidth, SIM_TRACK_HEIGHT)

      for (const seg of pair.segments) {
        if (seg.chromosome !== chrom) continue
        const x = ((seg.start_bp - rangeStart) / rangeWidth) * simTrackWidth
        const w = Math.max(2, ((seg.end_bp - seg.start_bp) / rangeWidth) * simTrackWidth)
        ctx.fillStyle = COLORS[seg.match_type] ?? '#9ca3af'
        ctx.fillRect(x, trackY, w, SIM_TRACK_HEIGHT)

        const cm = seg.length_cm != null ? ` | ${seg.length_cm.toFixed(1)} cM` : ''
        const label = pair.person_names.join(' vs ')
        newHits.push({
          x, y: trackY, w, h: SIM_TRACK_HEIGHT,
          tooltipContent: `Chr${chrom}: ${seg.start_bp.toLocaleString()}–${seg.end_bp.toLocaleString()} bp | ${seg.match_type} | ${seg.snp_count} SNPs${cm} [${label}]`,
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
  }, [open, containerWidth, pairwisePairs, chrom, rangeStart, rangeWidth, simHeight, simTrackWidth, nPairs])

  // ---------------------------------------------------------------------------
  // Draw phasing canvases (one per person)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!open || containerWidth === 0) return

    const phasingTrackWidth = Math.max(1, containerWidth - CANVAS_MARGIN * 2)
    const newAllHits: HitTarget[][] = []

    for (let pp = 0; pp < phasingPersons.length; pp++) {
      const person = phasingPersons[pp]
      const canvas = phasingCanvasRefs.current[pp]

      if (!canvas) {
        newAllHits.push([])
        continue
      }

      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(phasingTrackWidth * dpr)
      canvas.height = Math.round(PHASING_TRACK_HEIGHT * dpr)
      canvas.style.width = `${phasingTrackWidth}px`
      canvas.style.height = `${PHASING_TRACK_HEIGHT}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) { newAllHits.push([]); continue }
      ctx.scale(dpr, dpr)

      const halfH = PHASING_TRACK_HEIGHT / 2
      ctx.fillStyle = '#e5e7eb'
      ctx.fillRect(0, 0, phasingTrackWidth, PHASING_TRACK_HEIGHT)

      const personAnns = annotations.filter(
        a => a.profile_id === person.id && a.chromosome === chrom,
      )

      const hits: HitTarget[] = []

      // Annotation hits FIRST (take priority over gray-track hits below)
      for (const ann of personAnns) {
        const x = ((ann.start_position - rangeStart) / rangeWidth) * phasingTrackWidth
        const w = Math.max(2, ((ann.end_position - ann.start_position) / rangeWidth) * phasingTrackWidth)
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
        x: 0, y: 0, w: phasingTrackWidth, h: halfH,
        tooltipContent: `${person.name} — maternal: kliknij aby dodać adnotację`,
        payload: { type: 'phasing-track', person, chromosome: chrom, strand: 'maternal', approxBp: 0 },
      })
      hits.push({
        x: 0, y: halfH, w: phasingTrackWidth, h: halfH,
        tooltipContent: `${person.name} — paternal: kliknij aby dodać adnotację`,
        payload: { type: 'phasing-track', person, chromosome: chrom, strand: 'paternal', approxBp: 0 },
      })

      newAllHits.push(hits)
    }

    phasingHits.current = newAllHits
    setTooltip(null)
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
    const phasingTrackWidth = Math.max(1, containerWidth - CANVAS_MARGIN * 2)
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const hits = phasingHits.current[pp] ?? []
    const hit = findHit(hits, mx, my)
    if (!hit) { setTooltip(null); return }
    if (hit.payload.type === 'phasing-track') {
      const approxBp = Math.round(rangeStart + (mx / phasingTrackWidth) * rangeWidth)
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
          </div>

          {/* Phasing rows — one per person */}
          {phasingPersons.length > 0 && (
            <div className="space-y-1">
              {phasingPersons.map((person, pp) => (
                <div key={person.id} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 truncate text-xs text-gray-600 text-right pr-1">
                    {person.name}
                  </span>
                  <div className="relative flex-1" style={{ margin: `0 ${CANVAS_MARGIN}px` }}>
                    <canvas
                      ref={el => { phasingCanvasRefs.current[pp] = el }}
                      onMouseMove={e => handlePhasingMouseMove(pp, e)}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={e => handlePhasingClick(pp, e)}
                      className="block w-full"
                      style={{ cursor: 'crosshair' }}
                    />
                  </div>
                </div>
              ))}
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
}
