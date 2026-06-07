import { useEffect, useMemo, useRef, useState } from 'react'
import type { AncestorOut } from './AncestorPanel'
import AnnotationPopup from './AnnotationPopup'
import type { PhasingPayload, PopupPayload, SimPayload } from './AnnotationPopup'
import type { AnnotationOut, SegmentOut } from './ChromosomeDiagram'
import type { ProfileMeta, UpsertAnnotationBody } from './SegmentTable'

export interface PairResult {
  profile_ids: string[]
  person_names: string[]
  segments: SegmentOut[]
}

// Human genome reference lengths (hg38), in base pairs
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

const LABEL_WIDTH = 36
const SIM_TRACK_HEIGHT = 10
const PHASING_TRACK_HEIGHT = 16
const TRACK_GAP = 2
const CHROM_GAP = 8
const PAD = 8

interface HitTarget {
  x: number
  y: number
  w: number
  h: number
  tooltipContent: string
  payload: SimPayload | PhasingPayload
}

interface Props {
  pairs: PairResult[]
  allProfiles: ProfileMeta[]
  annotations: AnnotationOut[]
  ancestors: AncestorOut[]
  chromosomeLengths?: Record<string, number>
  onAnnotate?: (body: UpsertAnnotationBody) => Promise<void>
  onDeleteAnnotation?: (id: string) => Promise<void>
}

export default function ChromosomCanvas({
  pairs,
  allProfiles,
  annotations,
  ancestors,
  chromosomeLengths,
  onAnnotate,
  onDeleteAnnotation,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitTargets = useRef<HitTarget[]>([])
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)
  const [popup, setPopup] = useState<PopupPayload | null>(null)
  const [width, setWidth] = useState(0)

  const pairwisePairs = useMemo(
    () => pairs.filter(p => p.profile_ids.length === 2),
    [pairs],
  )

  const chromsWithData = useMemo(() => {
    const all = pairwisePairs.flatMap(p => p.segments.map(s => s.chromosome))
    return [...new Set(all)].sort((a, b) => {
      const na = parseInt(a, 10)
      const nb = parseInt(b, 10)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      if (!isNaN(na)) return -1
      if (!isNaN(nb)) return 1
      return a.localeCompare(b)
    })
  }, [pairwisePairs])

  const phasingPersons = useMemo(() => {
    const ids = new Set(pairwisePairs.flatMap(p => p.profile_ids))
    return allProfiles.filter(p => ids.has(p.id))
  }, [pairwisePairs, allProfiles])

  const ancestorColorMap = useMemo(
    () => Object.fromEntries(ancestors.map(a => [a.id, a.color])),
    [ancestors],
  )

  const nPairs = pairwisePairs.length
  const nPhasingPersons = phasingPersons.length
  const chromGroupHeight =
    nPairs * (SIM_TRACK_HEIGHT + TRACK_GAP) +
    nPhasingPersons * (PHASING_TRACK_HEIGHT + TRACK_GAP)
  const totalHeight =
    chromsWithData.length === 0
      ? 0
      : chromsWithData.length * chromGroupHeight +
        Math.max(0, chromsWithData.length - 1) * CHROM_GAP +
        PAD * 2

  // Track container width via ResizeObserver
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width)
      if (w > 0) setWidth(w)
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Draw canvas whenever layout or data changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0 || chromsWithData.length === 0 || nPairs === 0) return

    const lengths = chromosomeLengths ?? HG38_LENGTHS
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(totalHeight * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${totalHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const trackWidth = width - LABEL_WIDTH - 8
    const newHits: HitTarget[] = []

    ctx.clearRect(0, 0, width, totalHeight)
    ctx.font = '10px system-ui, sans-serif'
    ctx.textBaseline = 'middle'

    for (let ci = 0; ci < chromsWithData.length; ci++) {
      const chrom = chromsWithData[ci]
      const chromLen = lengths[chrom] ?? 1
      const chromY = PAD + ci * (chromGroupHeight + CHROM_GAP)
      const labelY = chromY + chromGroupHeight / 2

      // Chromosome label
      ctx.fillStyle = '#6b7280'
      ctx.textAlign = 'right'
      ctx.fillText(chrom, LABEL_WIDTH - 4, labelY)

      // One similarity track per pairwise pair
      for (let pi = 0; pi < pairwisePairs.length; pi++) {
        const pair = pairwisePairs[pi]
        const trackY = chromY + pi * (SIM_TRACK_HEIGHT + TRACK_GAP)

        // Gray background track
        ctx.fillStyle = '#e5e7eb'
        ctx.fillRect(LABEL_WIDTH, trackY, trackWidth, SIM_TRACK_HEIGHT)

        // Colored segments
        for (const seg of pair.segments) {
          if (seg.chromosome !== chrom) continue
          const x = LABEL_WIDTH + (seg.start_bp / chromLen) * trackWidth
          const w = Math.max(1, ((seg.end_bp - seg.start_bp) / chromLen) * trackWidth)

          ctx.fillStyle = COLORS[seg.match_type] ?? '#9ca3af'
          ctx.fillRect(x, trackY, w, SIM_TRACK_HEIGHT)

          const cm = seg.length_cm != null ? ` | ${seg.length_cm.toFixed(1)} cM` : ''
          const pairLabel = pair.person_names.join(' vs ')
          newHits.push({
            x, y: trackY, w, h: SIM_TRACK_HEIGHT,
            tooltipContent: `Chr${chrom}: ${seg.start_bp.toLocaleString()}–${seg.end_bp.toLocaleString()} bp | ${seg.match_type} | ${seg.snp_count} SNPs${cm} [${pairLabel}]`,
            payload: { type: 'sim', pair, chromosome: chrom, start_bp: seg.start_bp, end_bp: seg.end_bp },
          })
        }
      }

      // Phasing tracks: one per unique person, maternal top / paternal bottom
      const simHeight = nPairs * (SIM_TRACK_HEIGHT + TRACK_GAP)
      for (let pp = 0; pp < phasingPersons.length; pp++) {
        const person = phasingPersons[pp]
        const trackY = chromY + simHeight + pp * (PHASING_TRACK_HEIGHT + TRACK_GAP)
        const halfH = PHASING_TRACK_HEIGHT / 2

        // Gray background
        ctx.fillStyle = '#e5e7eb'
        ctx.fillRect(LABEL_WIDTH, trackY, trackWidth, PHASING_TRACK_HEIGHT)

        const personAnns = annotations.filter(
          a => a.profile_id === person.id && a.chromosome === chrom,
        )

        for (const ann of personAnns) {
          const x = LABEL_WIDTH + (ann.start_position / chromLen) * trackWidth
          const w = Math.max(1, ((ann.end_position - ann.start_position) / chromLen) * trackWidth)
          const color =
            ann.ancestor_id && ancestorColorMap[ann.ancestor_id]
              ? ancestorColorMap[ann.ancestor_id]
              : '#9ca3af'

          ctx.fillStyle = color
          if (ann.strand === 'maternal') {
            ctx.fillRect(x, trackY, w, halfH)
          } else {
            ctx.fillRect(x, trackY + halfH, w, halfH)
          }

          const ancestorSuffix = ann.ancestor_label ? ` → ${ann.ancestor_label}` : ''
          newHits.push({
            x,
            y: ann.strand === 'maternal' ? trackY : trackY + halfH,
            w,
            h: halfH,
            tooltipContent: `Chr${chrom}: ${ann.start_position.toLocaleString()}–${ann.end_position.toLocaleString()} bp | ${ann.strand} | ${person.name}${ancestorSuffix}`,
            payload: { type: 'phasing', annotation: ann, person, strand: ann.strand },
          })
        }
      }
    }

    hitTargets.current = newHits
    setTooltip(null)
  }, [width, pairwisePairs, chromsWithData, phasingPersons, annotations, ancestorColorMap, chromosomeLengths])

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const hit = hitTargets.current.find(
      t => mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h,
    )
    setTooltip(hit ? { x: mx + 12, y: my - 8, content: hit.tooltipContent } : null)
    if (canvasRef.current) {
      canvasRef.current.style.cursor = hit ? 'pointer' : 'crosshair'
    }
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onAnnotate) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const hit = hitTargets.current.find(
      t => mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h,
    )
    if (!hit) { setPopup(null); return }
    const cw = containerRef.current?.clientWidth ?? width
    const ch = containerRef.current?.clientHeight ?? totalHeight
    const px = mx + 200 > cw ? mx - 216 : mx
    const py = my + 120 > ch ? my - 120 : my
    setPopup({ ...hit.payload, px, py })
  }

  if (pairwisePairs.length === 0 || chromsWithData.length === 0) return null

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="font-medium text-gray-600">Pary:</span>
        {pairwisePairs.map((pair, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-gray-300" />
            {pair.person_names.join(' vs ')}
          </span>
        ))}
        <span className="ml-2 font-medium text-gray-600">Wynik:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: COLORS.FULL }} />
          FULL
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: COLORS.HALF }} />
          HALF
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: COLORS.NONE }} />
          NONE
        </span>
        {phasingPersons.length > 0 && (
          <>
            <span className="ml-2 font-medium text-gray-600">Fazowanie:</span>
            {phasingPersons.map(p => (
              <span key={p.id} className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-4 rounded-sm bg-gray-300" />
                {p.name}
              </span>
            ))}
            <span className="text-gray-400 italic">(mat/pat)</span>
          </>
        )}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative w-full">
        {width > 0 && (
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => {
              setTooltip(null)
              if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair'
            }}
            onClick={handleClick}
            className="block"
            style={{ cursor: 'crosshair' }}
          />
        )}
        {!popup && tooltip && (
          <div
            className="pointer-events-none absolute z-10 max-w-xs rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.content}
          </div>
        )}
        {popup && onAnnotate && (
          <AnnotationPopup
            popup={popup}
            ancestors={ancestors}
            onSave={onAnnotate}
            onDelete={
              onDeleteAnnotation
                ? async id => { await onDeleteAnnotation(id); setPopup(null) }
                : undefined
            }
            onClose={() => setPopup(null)}
          />
        )}
      </div>
    </div>
  )
}
