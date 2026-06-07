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

export type PopupPayload = (SimPayload | PhasingPayload) & { px: number; py: number }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  popup: PopupPayload
  allProfiles: ProfileMeta[]
  ancestors: AncestorOut[]
  onSave: (body: UpsertAnnotationBody) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onClose: () => void
}

export default function AnnotationPopup({
  popup,
  allProfiles: _allProfiles,
  ancestors,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const sim = popup.type === 'sim' ? popup : null
  const phasing = popup.type === 'phasing' ? popup : null

  const [profileId, setProfileId] = useState<string>(
    () => sim?.pair.profile_ids[0] ?? '',
  )
  const [strand, setStrand] = useState<'maternal' | 'paternal'>(
    () => phasing?.strand ?? 'maternal',
  )
  const [ancestorId, setAncestorId] = useState<string>(
    () => phasing?.annotation.ancestor_id ?? ancestors[0]?.id ?? '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!ancestorId) return
    const ancestor = ancestors.find(a => a.id === ancestorId)
    if (!ancestor) return

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
        await onSave({
          profile_id: phasing.person.id,
          chromosome: phasing.annotation.chromosome,
          start_position: phasing.annotation.start_position,
          end_position: phasing.annotation.end_position,
          strand: phasing.strand,
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
          {sim ? 'Przypisz przodka' : 'Edytuj fazowanie'}
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

      {/* PHASING: read-only person + strand label */}
      {phasing && (
        <div className="mb-2 text-xs text-gray-500">
          {phasing.person.name} —{' '}
          {phasing.strand === 'maternal' ? 'Maternal' : 'Paternal'}
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

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

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
    </div>
  )
}
