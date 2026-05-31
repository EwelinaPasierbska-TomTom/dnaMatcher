import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'

interface Person {
  name: string
  file: File | null
}

const emptyPerson = (): Person => ({ name: '', file: null })

export default function ComparePage() {
  const navigate = useNavigate()
  const [sessionName, setSessionName] = useState('')
  const [persons, setPersons] = useState<Person[]>([emptyPerson(), emptyPerson()])
  const [minSnp, setMinSnp] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updatePerson(index: number, field: keyof Person, value: string | File | null) {
    setPersons((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  function addPerson() {
    if (persons.length < 3) setPersons((prev) => [...prev, emptyPerson()])
  }

  function removePerson(index: number) {
    if (persons.length > 2) setPersons((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!sessionName.trim()) {
      setError('Podaj nazwę porównania.')
      return
    }
    if (persons.some((p) => !p.name.trim())) {
      setError('Podaj imię dla każdej osoby.')
      return
    }
    if (persons.some((p) => !p.file)) {
      setError('Wybierz plik CSV dla każdej osoby.')
      return
    }

    const formData = new FormData()
    formData.append('name', sessionName.trim())
    formData.append('min_snp_count', String(minSnp))
    persons.forEach((p) => {
      formData.append('person_names', p.name.trim())
      formData.append('files', p.file as File)
    })

    setLoading(true)
    try {
      const res = await apiFetch('/api/comparisons', { method: 'POST', body: formData })
      const data: unknown = await res.json()
      if (!res.ok) {
        const msg = (data as { detail?: string }).detail ?? 'Błąd serwera.'
        setError(msg)
        return
      }
      navigate(`/results/${(data as { id: string }).id}`)
    } catch {
      setError('Nie udało się połączyć z serwerem.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Nowe porównanie</h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nazwa porównania
            </label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-4">
            {persons.map((p, i) => (
              <div key={i} className="border border-gray-200 rounded-md p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Osoba {i + 1}</span>
                  {persons.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removePerson(i)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Usuń
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Imię"
                    value={p.name}
                    onChange={(e) => updatePerson(i, 'name', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => updatePerson(i, 'file', e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
              </div>
            ))}
          </div>

          {persons.length < 3 && (
            <button
              type="button"
              onClick={addPerson}
              className="w-full border border-dashed border-gray-300 text-gray-500 rounded-md py-2 text-sm hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Dodaj osobę
            </button>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimalny próg SNP (filtr segmentów)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={minSnp}
              onChange={(e) => setMinSnp(Number(e.target.value))}
              className="w-32 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {loading ? 'Przetwarzanie…' : 'Porównaj'}
          </button>
        </form>
      </div>
    </div>
  )
}
