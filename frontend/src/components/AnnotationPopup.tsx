import { useState } from 'react'
import type { AncestorOut } from './AncestorPanel'
import type { AnnotationOut } from './ChromosomeDiagram'
import type { ProfileMeta, UpsertAnnotationBody } from './SegmentTable'
import type { PairResult } from './ChromosomCanvas'

// ---------------------------------------------------------------------------
// Payload types — exported so ChromosomCanvas can type HitTarget.payload
// ---------------------------------------------------------------------------

export interface SimPayload {
  type: 'sim'
  pair: PairResult
  chromosome: string
  start_bp: number
  end_bp: number
}

export interface PhasingPayload {
  type: 'phasing'
  annotation: AnnotationOut
  person: ProfileMeta
  strand: 'maternal' | 'paternal'
}

export interface PhasingTrackPayload {
  type: 'phasing-track'
  person: ProfileMeta
  chromosome: string
  strand: 'maternal' | 'paternal'
  approxBp: number
}

export type PopupPayload =
  | (SimPayload & { px: number; py: number })
  | (PhasingPayload & { px: number; py: number })
  | (PhasingTrackPayload & { px: number; py: number })

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  popup: PopupPayload
  ancestors: AncestorOut[]
  onSave: (body: UpsertAnnotationBody) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onClose: () => void
}

export default function AnnotationPopup({
  popup,
  ancestors,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const sim = popup.type === 'sim' ? popup : null
  const phasing = popup.type === 'phasing' ? popup : null
  const track = popup.type === 'phasing-track' ? popup : null

  const [profileId, setProfileId] = useState<string>(
    () => sim?.pair.profile_ids[0] ?? '',
  )
  const [strand, setStrand] = useState<'maternal' | 'paternal'>(
    () => phasing?.strand ?? track?.strand ?? 'maternal',
  )
  const [ancestorId, setAncestorId] = useState<string>(
    () => phasing?.annotation.ancestor_id ?? ancestors[0]?.id ?? '',
  )
  const [startBp, setStartBp] = useState<number>(
    () => phasing?.annotation.start_position ?? track?.approxBp ?? 0,
  )
  const [endBp, setEndBp] = useState<number>(
    () => phasing?.annotation.end_position ?? (track ? track.approxBp + 1 : 0),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!ancestorId) return
    const ancestor = ancestors.find(a => a.id === ancestorId)
    if (!ancestor) {
      setError('Wybrany przodek nie istnieje. Wybierz innego.')
      return
    }
    if ((phasing || track) && startBp >= endBp) {
      setError('Start musi być mniejszy niż koniec.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      if (sim) {
        await onSave({
          profile_id: profileId,
          chromosome: sim.chromosome,
          start_position: sim.start_bp,
          end_position: sim.end_bp,
          strand,
          ancestor_id: ancestor.id,
          ancestor_label: ancestor.name,
        })
      } else if (phasing) {
        const posChanged =
          startBp !== phasing.annotation.start_position ||
          endBp !== phasing.annotation.end_position
        await onSave({
          profile_id: phasing.person.id,
          chromosome: phasing.annotation.chromosome,
          start_position: startBp,
          end_position: endBp,
          strand: phasing.strand,
          ancestor_id: ancestor.id,
          ancestor_label: ancestor.name,
        })
        if (posChanged && onDelete) {
          await onDelete(phasing.annotation.id)
        }
      } else if (track) {
        await onSave({
          profile_id: track.person.id,
          chromosome: track.chromosome,
          start_position: startBp,
          end_position: endBp,
          strand: track.strand,
          ancestor_id: ancestor.id,
          ancestor_label: ancestor.name,
        })
      }
      onClose()
    } catch {
      setError('Nie udało się zapisać.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete || !phasing) return
    if (!window.confirm('Usunąć adnotację?')) return
    setSaving(true)
    setError(null)
    try {
      await onDelete(phasing.annotation.id)
      onClose()
    } catch {
      setError('Nie udało się usunąć.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="absolute z-20 min-w-48 rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
      style={{ left: popup.px + 8, top: popup.py - 8 }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">
          {sim ? 'Przypisz przodka' : track ? 'Nowa adnotacja' : 'Edytuj fazowanie'}
        </span>
        <button onClick={onClose} className="ml-2 text-xs text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      {/* SIM: person picker + strand toggle */}
      {sim && (
        <>
          <div className="mb-2">
            <label className="mb-1 block text-xs text-gray-500">Osoba</label>
            <select
              value={profileId}
              onChange={e => setProfileId(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              disabled={saving}
            >
              {sim.pair.profile_ids.map((id, i) => (
                <option key={id} value={id}>
                  {sim.pair.person_names[i]}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-2">
            <label className="mb-1 block text-xs text-gray-500">Nić</label>
            <div className="flex gap-1">
              {(['maternal', 'paternal'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStrand(s)}
                  disabled={saving}
                  className={`flex-1 rounded border px-2 py-1 text-xs transition-colors ${
                    strand === s
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s === 'maternal' ? 'Maternal' : 'Paternal'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* PHASING edit: read-only person + strand label */}
      {phasing && (
        <div className="mb-2 text-xs text-gray-500">
          {phasing.person.name} —{' '}
          {phasing.strand === 'maternal' ? 'Maternal' : 'Paternal'}
        </div>
      )}

      {/* PHASING-TRACK: read-only person + strand label */}
      {track && (
        <div className="mb-2 text-xs text-gray-500">
          {track.person.name} —{' '}
          {track.strand === 'maternal' ? 'Maternal' : 'Paternal'}
        </div>
      )}

      {/* Position fields (phasing edit and phasing-track only) */}
      {(phasing || track) && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Start bp</label>
            <input
              type="number"
              value={startBp}
              onChange={e => setStartBp(Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              disabled={saving}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">End bp</label>
            <input
              type="number"
              value={endBp}
              onChange={e => setEndBp(Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              disabled={saving}
            />
          </div>
        </div>
      )}

      {/* Ancestor picker */}
      <div className="mb-3">
        <label className="mb-1 block text-xs text-gray-500">Przodek</label>
        {ancestors.length === 0 ? (
          <p className="text-xs italic text-gray-400">
            Brak przodków — dodaj w panelu bocznym.
          </p>
        ) : (
          <select
            value={ancestorId}
            onChange={e => setAncestorId(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            disabled={saving}
          >
            {ancestors.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving || !ancestorId || ancestors.length === 0}
          className="flex-1 rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? '…' : 'Zapisz'}
        </button>
        {phasing && onDelete && (
          <button
            onClick={() => void handleDelete()}
            disabled={saving}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
          >
            Usuń
          </button>
        )}
        <button
          onClick={onClose}
          disabled={saving}
          className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          Anuluj
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
