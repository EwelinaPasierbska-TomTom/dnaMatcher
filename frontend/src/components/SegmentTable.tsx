import { useState } from 'react'
import type { AnnotationOut, SegmentOut } from './ChromosomeDiagram'

export interface ProfileMeta {
  id: string
  name: string
  original_filename: string
}

export interface UpsertAnnotationBody {
  profile_id: string
  chromosome: string
  start_position: number
  end_position: number
  strand: 'maternal' | 'paternal'
  ancestor_label: string
}

const BADGE: Record<string, string> = {
  FULL: 'bg-green-100 text-green-800',
  HALF: 'bg-yellow-100 text-yellow-800',
  NONE: 'bg-red-100 text-red-800',
}

const STRAND_LABEL: Record<string, string> = {
  maternal: 'mat.',
  paternal: 'pat.',
}

function chromSort(a: SegmentOut, b: SegmentOut) {
  const na = parseInt(a.chromosome)
  const nb = parseInt(b.chromosome)
  if (!isNaN(na) && !isNaN(nb)) return na - nb || a.start_bp - b.start_bp
  if (!isNaN(na)) return -1
  if (!isNaN(nb)) return 1
  return a.chromosome.localeCompare(b.chromosome) || a.start_bp - b.start_bp
}

function fmt(n: number) {
  return n.toLocaleString('pl-PL')
}

function findAnnotation(
  annotations: AnnotationOut[],
  profileId: string,
  seg: SegmentOut,
): AnnotationOut | undefined {
  return annotations.find(
    (a) =>
      a.profile_id === profileId &&
      a.chromosome === seg.chromosome &&
      a.start_position === seg.start_bp &&
      a.end_position === seg.end_bp,
  )
}

function anyAnnotation(annotations: AnnotationOut[], seg: SegmentOut): AnnotationOut | undefined {
  return annotations.find(
    (a) =>
      a.chromosome === seg.chromosome &&
      a.start_position === seg.start_bp &&
      a.end_position === seg.end_bp,
  )
}

interface Props {
  segments: SegmentOut[]
  profiles?: ProfileMeta[]
  annotations?: AnnotationOut[]
  onAnnotate?: (body: UpsertAnnotationBody) => Promise<void>
  onDeleteAnnotation?: (id: string) => Promise<void>
}

export default function SegmentTable({
  segments,
  profiles = [],
  annotations = [],
  onAnnotate,
  onDeleteAnnotation,
}: Props) {
  const sorted = [...segments].sort(chromSort)
  const hasCm = sorted.some((s) => s.length_cm !== null)
  const hasDensity = sorted.some((s) => s.density !== null)
  const hasAnnotations = profiles.length > 0 && (onAnnotate !== undefined)

  const [expandedRowIdx, setExpandedRowIdx] = useState<number | null>(null)
  const [formProfileId, setFormProfileId] = useState('')
  const [formStrand, setFormStrand] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const totalCols = 7 + (hasCm ? 1 : 0) + (hasDensity ? 1 : 0) + (hasAnnotations ? 1 : 0)

  function openRow(idx: number, seg: SegmentOut) {
    if (expandedRowIdx === idx) {
      setExpandedRowIdx(null)
      return
    }
    const defaultProfileId = profiles[0]?.id ?? ''
    const existing = defaultProfileId ? findAnnotation(annotations, defaultProfileId, seg) : undefined
    setExpandedRowIdx(idx)
    setFormProfileId(defaultProfileId)
    setFormStrand(existing?.strand ?? '')
    setFormLabel(existing?.ancestor_label ?? '')
    setFormError(null)
  }

  function handleProfileChange(profileId: string, seg: SegmentOut) {
    const existing = findAnnotation(annotations, profileId, seg)
    setFormProfileId(profileId)
    setFormStrand(existing?.strand ?? '')
    setFormLabel(existing?.ancestor_label ?? '')
    setFormError(null)
  }

  async function handleSave(seg: SegmentOut) {
    if (!formProfileId || !formStrand || !formLabel.trim()) {
      setFormError('Wypełnij wszystkie pola.')
      return
    }
    if (!onAnnotate) return
    setFormSaving(true)
    setFormError(null)
    try {
      await onAnnotate({
        profile_id: formProfileId,
        chromosome: seg.chromosome,
        start_position: seg.start_bp,
        end_position: seg.end_bp,
        strand: formStrand as 'maternal' | 'paternal',
        ancestor_label: formLabel.trim(),
      })
      setExpandedRowIdx(null)
    } catch {
      setFormError('Błąd zapisu. Spróbuj ponownie.')
    } finally {
      setFormSaving(false)
    }
  }

  async function handleDelete(annotationId: string) {
    if (!onDeleteAnnotation) return
    setFormSaving(true)
    setFormError(null)
    try {
      await onDeleteAnnotation(annotationId)
      setExpandedRowIdx(null)
    } catch {
      setFormError('Błąd usunięcia. Spróbuj ponownie.')
    } finally {
      setFormSaving(false)
    }
  }

  if (sorted.length === 0) {
    return <p className="text-sm text-gray-400 italic">Brak segmentów po filtrowaniu.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="py-2 pr-4">Chr</th>
            <th className="py-2 pr-4">Start (bp)</th>
            <th className="py-2 pr-4">Koniec (bp)</th>
            <th className="py-2 pr-4">Dł. (bp)</th>
            {hasCm && <th className="py-2 pr-4">Dł. (cM)</th>}
            {hasDensity && <th className="py-2 pr-4">Gęstość (SNP/cM)</th>}
            <th className="py-2 pr-4">SNP</th>
            <th className="py-2">Typ</th>
            {hasAnnotations && <th className="py-2 pl-4">Adnotacja</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((seg, i) => {
            const isExpanded = expandedRowIdx === i
            const badge = anyAnnotation(annotations, seg)
            const existingForCurrentProfile =
              formProfileId && isExpanded
                ? findAnnotation(annotations, formProfileId, seg)
                : undefined

            return (
              <>
                <tr
                  key={i}
                  onClick={() => hasAnnotations && openRow(i, seg)}
                  className={`border-b border-gray-100 ${hasAnnotations ? 'cursor-pointer hover:bg-indigo-50' : 'hover:bg-gray-50'} ${isExpanded ? 'bg-indigo-50' : ''}`}
                >
                  <td className="py-1.5 pr-4 font-mono">{seg.chromosome}</td>
                  <td className="py-1.5 pr-4 font-mono">{fmt(seg.start_bp)}</td>
                  <td className="py-1.5 pr-4 font-mono">{fmt(seg.end_bp)}</td>
                  <td className="py-1.5 pr-4 font-mono">{fmt(seg.length_bp)}</td>
                  {hasCm && (
                    <td className="py-1.5 pr-4 font-mono">
                      {seg.length_cm !== null ? seg.length_cm.toFixed(2) : '—'}
                    </td>
                  )}
                  {hasDensity && (
                    <td className="py-1.5 pr-4 font-mono">
                      {seg.density !== null ? seg.density.toFixed(1) : '—'}
                    </td>
                  )}
                  <td className="py-1.5 pr-4 font-mono">{seg.snp_count}</td>
                  <td className="py-1.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[seg.match_type] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {seg.match_type}
                    </span>
                  </td>
                  {hasAnnotations && (
                    <td className="py-1.5 pl-4">
                      {badge ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                          {badge.ancestor_label}
                          <span className="text-indigo-500">{STRAND_LABEL[badge.strand]}</span>
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  )}
                </tr>
                {isExpanded && (
                  <tr key={`form-${i}`} className="bg-indigo-50 border-b border-indigo-100">
                    <td colSpan={totalCols} className="px-4 py-3">
                      <div className="flex flex-wrap items-end gap-3">
                        {profiles.length > 1 && (
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-500">Osoba</label>
                            <select
                              value={formProfileId}
                              onChange={(e) => handleProfileChange(e.target.value, seg)}
                              className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                              disabled={formSaving}
                            >
                              {profiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-500">Linia dziedziczenia</label>
                          <select
                            value={formStrand}
                            onChange={(e) => setFormStrand(e.target.value)}
                            required
                            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                            disabled={formSaving}
                          >
                            <option value="">— wybierz —</option>
                            <option value="maternal">Matczyna (maternal)</option>
                            <option value="paternal">Ojcowska (paternal)</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                          <label className="text-xs text-gray-500">Imię przodka</label>
                          <input
                            type="text"
                            value={formLabel}
                            onChange={(e) => setFormLabel(e.target.value)}
                            required
                            placeholder="np. Babcia Maria"
                            className="text-sm border border-gray-300 rounded px-2 py-1"
                            disabled={formSaving}
                          />
                        </div>
                        <button
                          onClick={() => void handleSave(seg)}
                          disabled={formSaving}
                          className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1 rounded"
                        >
                          {formSaving ? 'Zapisywanie…' : 'Zapisz'}
                        </button>
                        {existingForCurrentProfile && onDeleteAnnotation && (
                          <button
                            onClick={() => void handleDelete(existingForCurrentProfile.id)}
                            disabled={formSaving}
                            className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50 px-2 py-1"
                          >
                            Usuń
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedRowIdx(null)}
                          disabled={formSaving}
                          className="text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50 px-2 py-1"
                        >
                          Anuluj
                        </button>
                      </div>
                      {formError && (
                        <p className="mt-2 text-xs text-red-600">{formError}</p>
                      )}
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
