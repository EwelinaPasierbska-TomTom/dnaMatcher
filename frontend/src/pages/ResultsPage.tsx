import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Dna, Trash2 } from 'lucide-react'
import AncestorPanel, { type AncestorOut } from '../components/AncestorPanel'
import ChromosomCanvas, { type ChromosomCanvasHandle, type PairResult } from '../components/ChromosomCanvas'
import { generateReportHtml } from '../lib/reportHtml'
import type { AnnotationOut } from '../components/ChromosomeDiagram'
import { type ProfileMeta, type UpsertAnnotationBody } from '../components/SegmentTable'
import { apiFetch } from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog'

interface ComparisonData {
  id: string
  name: string
  created_at: string
  profiles: ProfileMeta[]
  pairs: PairResult[]
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
  const canvasRef = useRef<ChromosomCanvasHandle>(null)
  const [exportOpen, setExportOpen] = useState(false)

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
            a.end_position === saved.end_position &&
            a.strand === saved.strand
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

  async function executeDelete() {
    setDeleting(true)
    try {
      const res = await apiFetch(`/api/comparisons/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        setDeleting(false)
        setError('Nie udało się usunąć porównania.')
        return
      }
      navigate('/app')
    } catch {
      setDeleting(false)
      setError('Nie udało się usunąć porównania.')
    }
  }

  const exportChroms = useMemo(
    () =>
      data
        ? [
            ...new Set(
              data.pairs.flatMap(p => p.segments.map(s => s.chromosome)),
            ),
          ].sort((a, b) => {
            const na = parseInt(a, 10), nb = parseInt(b, 10)
            if (!isNaN(na) && !isNaN(nb)) return na - nb
            if (!isNaN(na)) return -1
            if (!isNaN(nb)) return 1
            return a.localeCompare(b)
          })
        : [],
    [data],
  )

  async function handleExport(chromosome: string): Promise<void> {
    setExportOpen(false)
    if (!data) return
    const canvas = canvasRef.current
    if (!canvas) return
    const imageDataUrl = await canvas.getChromosomeReport(chromosome)
    if (!imageDataUrl) return
    const date = new Date().toLocaleDateString('pl-PL', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
    const html = generateReportHtml({
      comparisonName: data.name,
      chromosome,
      date,
      imageDataUrl,
      annotations,
      ancestors,
    })
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Dna className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="text-lg text-gray-600">Ładowanie…</span>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <p className="text-red-600">{error ?? 'Błąd ładowania.'}</p>
      </div>
    )
  }

  const date = new Date(data.created_at).toLocaleDateString('pl-PL', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-10 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex gap-6 items-start">
          {/* main content */}
          <div className="flex-1 min-w-0 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
                <p className="text-sm text-gray-500 mt-1">{date}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => navigate('/app')}>
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Powrót
                </Button>

                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExportOpen(v => !v)}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Eksportuj
                  </Button>
                  {exportOpen && exportChroms.length > 0 && (
                    <div
                      className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded border border-gray-200 bg-white shadow-lg"
                      onMouseLeave={() => setExportOpen(false)}
                    >
                      {exportChroms.map(chrom => (
                        <button
                          key={chrom}
                          className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => void handleExport(chrom)}
                        >
                          Chromosom {chrom}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={deleting}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      {deleting ? 'Usuwanie…' : 'Usuń porównanie'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Usuń porównanie</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tej operacji nie można cofnąć. Porównanie „{data.name}" zostanie trwale usunięte.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Anuluj</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void executeDelete()}>
                        Usuń
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            <Card>
              <CardContent className="p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Diagram chromosomów
                </h3>
                <ChromosomCanvas
                  ref={canvasRef}
                  pairs={data.pairs}
                  allProfiles={data.profiles}
                  annotations={annotations}
                  ancestors={ancestors}
                  onAnnotate={handleUpsertAnnotation}
                  onDeleteAnnotation={handleDeleteAnnotation}
                />
              </CardContent>
            </Card>
          </div>

          {/* sidebar */}
          <div className="w-60 flex-shrink-0 sticky top-10">
            <AncestorPanel
              ancestors={ancestors}
              onAdd={async (name, color) => { await handleCreateAncestor(name, color) }}
              onUpdate={handleUpdateAncestor}
              onDelete={handleDeleteAncestor}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
