import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AncestorPanel, { type AncestorOut } from '../components/AncestorPanel'
import ChromosomCanvas, { type PairResult } from '../components/ChromosomCanvas'
import type { AnnotationOut } from '../components/ChromosomeDiagram'
import SegmentTable, { type ProfileMeta, type UpsertAnnotationBody } from '../components/SegmentTable'
import { apiFetch } from '../lib/api'

interface ComparisonData {
  id: string
  name: string
  created_at: string
  profiles: ProfileMeta[]
  pairs: PairResult[]
}

interface PairSectionProps {
  pair: PairResult
  defaultOpen: boolean
  profiles: ProfileMeta[]
  annotations: AnnotationOut[]
  ancestors: AncestorOut[]
  onAnnotate: (body: UpsertAnnotationBody) => Promise<void>
  onDeleteAnnotation: (id: string) => Promise<void>
  onCreateAncestor: (name: string, color: string) => Promise<AncestorOut>
}

function PairSection({
  pair,
  defaultOpen,
  profiles,
  annotations,
  ancestors,
  onAnnotate,
  onDeleteAnnotation,
  onCreateAncestor,
}: PairSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const label =
    pair.person_names.length === 2
      ? `${pair.person_names[0]} vs ${pair.person_names[1]}`
      : pair.person_names.join(' vs ') + ' (3-way)'

  const pairProfiles = profiles.filter((p) => pair.profile_ids.includes(p.id))

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="font-medium text-gray-800">{label}</span>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Segmenty ({pair.segments.length})
          </h3>
          <SegmentTable
            segments={pair.segments}
            profiles={pairProfiles}
            annotations={annotations}
            ancestors={ancestors}
            onAnnotate={onAnnotate}
            onDeleteAnnotation={onDeleteAnnotation}
            onCreateAncestor={onCreateAncestor}
          />
        </div>
      )}
    </div>
  )
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ComparisonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [annotations, setAnnotations] = useState<AnnotationOut[]>([])
  const [ancestors, setAncestors] = useState<AncestorOut[]>([])

  useEffect(() => {
    void (async () => {
      try {
        const [compRes, annRes, ancRes] = await Promise.all([
          apiFetch(`/api/comparisons/${id}`),
          apiFetch(`/api/comparisons/${id}/annotations`),
          apiFetch('/api/ancestors'),
        ])

        if (compRes.status === 404) {
          setError('Porównanie nie znalezione.')
          return
        }
        if (!compRes.ok) {
          setError('Nie udało się załadować wyników.')
          return
        }
        setData((await compRes.json()) as ComparisonData)

        if (!annRes.ok || !ancRes.ok) {
          setError('Nie udało się załadować danych. Odśwież stronę.')
          return
        }
        setAnnotations((await annRes.json()) as AnnotationOut[])
        setAncestors((await ancRes.json()) as AncestorOut[])
      } catch {
        setError('Nie udało się połączyć z serwerem.')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  async function handleUpsertAnnotation(body: UpsertAnnotationBody): Promise<void> {
    const res = await apiFetch(`/api/comparisons/${id}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = (await res.json()) as { detail?: string }
      throw new Error(err.detail ?? 'Błąd zapisu.')
    }
    const saved = (await res.json()) as AnnotationOut
    setAnnotations((prev) => {
      const filtered = prev.filter(
        (a) =>
          !(
            a.profile_id === saved.profile_id &&
            a.chromosome === saved.chromosome &&
            a.start_position === saved.start_position &&
            a.end_position === saved.end_position
          ),
      )
      return [...filtered, saved]
    })
  }

  async function handleDeleteAnnotation(annotationId: string): Promise<void> {
    const res = await apiFetch(`/api/annotations/${annotationId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Błąd usunięcia.')
    setAnnotations((prev) => prev.filter((a) => a.id !== annotationId))
  }

  async function handleCreateAncestor(name: string, color: string): Promise<AncestorOut> {
    const res = await apiFetch('/api/ancestors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    if (!res.ok) {
      const err = (await res.json()) as { detail?: string }
      throw new Error(err.detail ?? 'Błąd tworzenia przodka.')
    }
    const created = (await res.json()) as AncestorOut
    setAncestors((prev) => [...prev, created])
    return created
  }

  async function handleUpdateAncestor(id: string, name: string, color: string): Promise<void> {
    const res = await apiFetch(`/api/ancestors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    if (!res.ok) throw new Error('Błąd aktualizacji przodka.')
    const updated = (await res.json()) as AncestorOut
    setAncestors((prev) => prev.map((a) => (a.id === id ? updated : a)))
  }

  async function handleDeleteAncestor(id: string): Promise<void> {
    const res = await apiFetch(`/api/ancestors/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Błąd usunięcia przodka.')
    setAncestors((prev) => prev.filter((a) => a.id !== id))
    // CASCADE removed DB annotations — clean up local state too
    setAnnotations((prev) => prev.filter((a) => a.ancestor_id !== id))
  }

  async function handleDelete() {
    if (!confirm('Usunąć to porównanie?')) return
    setDeleting(true)
    try {
      await apiFetch(`/api/comparisons/${id}`, { method: 'DELETE' })
      navigate('/app')
    } catch {
      setDeleting(false)
      setError('Nie udało się usunąć porównania.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Ładowanie…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600">{error ?? 'Błąd ładowania.'}</p>
      </div>
    )
  }

  const date = new Date(data.created_at).toLocaleDateString('pl-PL', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex gap-6 items-start">
          {/* main content */}
          <div className="flex-1 min-w-0 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
                <p className="text-sm text-gray-500 mt-1">{date}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/app')}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Powrót
                </button>
                <button
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Usuwanie…' : 'Usuń porównanie'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Diagram chromosomów
              </h3>
              <ChromosomCanvas
                pairs={data.pairs}
                allProfiles={data.profiles}
                annotations={annotations}
                ancestors={ancestors}
              />
            </div>

            <div className="space-y-3">
              {data.pairs.map((pair, i) => (
                <PairSection
                  key={i}
                  pair={pair}
                  defaultOpen={i === 0}
                  profiles={data.profiles}
                  annotations={annotations}
                  ancestors={ancestors}
                  onAnnotate={handleUpsertAnnotation}
                  onDeleteAnnotation={handleDeleteAnnotation}
                  onCreateAncestor={handleCreateAncestor}
                />
              ))}
            </div>
          </div>

          {/* sidebar */}
          <div className="w-60 flex-shrink-0 sticky top-10">
            <AncestorPanel
              ancestors={ancestors}
              onAdd={handleCreateAncestor}
              onUpdate={handleUpdateAncestor}
              onDelete={handleDeleteAncestor}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
