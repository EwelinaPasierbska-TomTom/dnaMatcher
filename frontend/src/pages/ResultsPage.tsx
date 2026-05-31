import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ChromosomeDiagram, { type SegmentOut } from '../components/ChromosomeDiagram'
import SegmentTable from '../components/SegmentTable'
import { apiFetch } from '../lib/api'

interface PairResult {
  profile_ids: string[]
  person_names: string[]
  segments: SegmentOut[]
}

interface ComparisonData {
  id: string
  name: string
  created_at: string
  pairs: PairResult[]
}

function PairSection({ pair, defaultOpen }: { pair: PairResult; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const label =
    pair.person_names.length === 2
      ? `${pair.person_names[0]} vs ${pair.person_names[1]}`
      : pair.person_names.join(' vs ') + ' (3-way)'

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
        <div className="p-5 space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Diagram chromosomów
            </h3>
            <ChromosomeDiagram segments={pair.segments} />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Segmenty ({pair.segments.length})
            </h3>
            <SegmentTable segments={pair.segments} />
          </div>
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

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch(`/api/comparisons/${id}`)
        if (res.status === 404) {
          setError('Porównanie nie znalezione.')
          return
        }
        if (!res.ok) {
          setError('Nie udało się załadować wyników.')
          return
        }
        setData((await res.json()) as ComparisonData)
      } catch {
        setError('Nie udało się połączyć z serwerem.')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  async function handleDelete() {
    if (!confirm('Usunąć to porównanie?')) return
    setDeleting(true)
    try {
      await apiFetch(`/api/comparisons/${id}`, { method: 'DELETE' })
      navigate('/app')
    } catch {
      setDeleting(false)
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
      <div className="max-w-4xl mx-auto space-y-6">
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

        <div className="space-y-3">
          {data.pairs.map((pair, i) => (
            <PairSection key={i} pair={pair} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </div>
  )
}
