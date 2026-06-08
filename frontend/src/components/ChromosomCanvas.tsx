import { useEffect, useMemo, useRef, useState } from 'react'
import type { AncestorOut } from './AncestorPanel'
import AnnotationPopup from './AnnotationPopup'
import type { PhasingPayload, PhasingTrackPayload, PopupPayload, SimPayload } from './AnnotationPopup'
import type { AnnotationOut, SegmentOut } from './ChromosomeDiagram'
import ChromosomSection from './ChromosomSection'
import type { ProfileMeta, UpsertAnnotationBody } from './SegmentTable'

// ---------------------------------------------------------------------------
// Exported interfaces (used by ResultsPage and ChromosomSection)
// ---------------------------------------------------------------------------

export interface ChromosomeBounds {
  start_bp: number
  end_bp: number
}

export interface PairResult {
  profile_ids: string[]
  person_names: string[]
  segments: SegmentOut[]
  chromosome_bounds: Record<string, ChromosomeBounds>
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface Props {
  pairs: PairResult[]
  allProfiles: ProfileMeta[]
  annotations: AnnotationOut[]
  ancestors: AncestorOut[]
  chromosomeLengths?: Record<string, number>
  onAnnotate?: (body: UpsertAnnotationBody) => Promise<void>
  onDeleteAnnotation?: (id: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChromosomCanvas({
  pairs,
  allProfiles,
  annotations,
  ancestors,
  chromosomeLengths,
  onAnnotate,
  onDeleteAnnotation,
}: Props) {
  const mainContainerRef = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<PopupPayload | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // ---------------------------------------------------------------------------
  // Derived data (stable memo values)
  // ---------------------------------------------------------------------------

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

  // Merged chromosome bounds from all pairwise pairs
  const chromBoundsMap = useMemo(() => {
    const map: Record<string, ChromosomeBounds> = {}
    for (const pair of pairwisePairs) {
      for (const [chrom, b] of Object.entries(pair.chromosome_bounds)) {
        const cur = map[chrom]
        if (!cur) {
          map[chrom] = { start_bp: b.start_bp, end_bp: b.end_bp }
        } else {
          map[chrom] = {
            start_bp: Math.min(cur.start_bp, b.start_bp),
            end_bp: Math.max(cur.end_bp, b.end_bp),
          }
        }
      }
    }
    return map
  }, [pairwisePairs])

  // ---------------------------------------------------------------------------
  // Shared container width (passed to each ChromosomSection)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const container = mainContainerRef.current
    if (!container) return
    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width)
      if (w > 0) setContainerWidth(w)
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // ---------------------------------------------------------------------------
  // Popup management (single popup shared across all sections)
  // ---------------------------------------------------------------------------

  function handlePopupRequest(
    payload: SimPayload | PhasingPayload | PhasingTrackPayload,
    clientX: number,
    clientY: number,
  ) {
    if (!onAnnotate) return
    const rect = mainContainerRef.current?.getBoundingClientRect()
    const px = clientX - (rect?.left ?? 0)
    const py = clientY - (rect?.top ?? 0)
    const cw = rect?.width ?? containerWidth
    const ch = rect?.height ?? 500
    const safeX = px + 200 > cw ? px - 216 : px
    const safeY = py + 140 > ch ? py - 140 : py
    setPopup({ ...payload, px: safeX, py: safeY })
  }

  if (pairwisePairs.length === 0 || chromsWithData.length === 0) return null

  // ---------------------------------------------------------------------------
  // Legend (same colors as before)
  // ---------------------------------------------------------------------------

  const COLORS = { FULL: '#22c55e', HALF: '#eab308', NONE: '#ef4444' }

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
        {(['FULL', 'HALF', 'NONE'] as const).map(t => (
          <span key={t} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-4 rounded-sm"
              style={{ backgroundColor: COLORS[t] }}
            />
            {t}
          </span>
        ))}
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

      {/* Chromosome sections */}
      <div
        ref={mainContainerRef}
        className="relative overflow-hidden rounded border border-gray-200 bg-white"
      >
        {chromsWithData.map(chrom => (
          <ChromosomSection
            key={chrom}
            chrom={chrom}
            pairwisePairs={pairwisePairs}
            phasingPersons={phasingPersons}
            annotations={annotations}
            ancestorColorMap={ancestorColorMap}
            chromBounds={chromBoundsMap[chrom]}
            chromosomeLengths={chromosomeLengths}
            containerWidth={containerWidth}
            onPopupRequest={handlePopupRequest}
          />
        ))}

        {/* Shared popup at parent level */}
        {popup && onAnnotate && (
          <AnnotationPopup
            popup={popup}
            ancestors={ancestors}
            onSave={onAnnotate}
            onDelete={
              onDeleteAnnotation
                ? async id => {
                    await onDeleteAnnotation(id)
                    setPopup(null)
                  }
                : undefined
            }
            onClose={() => setPopup(null)}
          />
        )}
      </div>
    </div>
  )
}
