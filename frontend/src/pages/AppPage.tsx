import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

interface ComparisonSummary {
  id: string
  name: string
  created_at: string
  person_names: string[]
}

export default function AppPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [comparisons, setComparisons] = useState<ComparisonSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch('/api/comparisons')
        if (res.ok) {
          setComparisons((await res.json()) as ComparisonSummary[])
        } else {
          setError('Nie udało się załadować historii porównań.')
        }
      } catch {
        setError('Nie udało się połączyć z serwerem.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">dnaMatcher</h1>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
          <button
            onClick={() => void signOut()}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Wyloguj się
          </button>
        </div>

        {/* New comparison */}
        <button
          onClick={() => navigate('/compare')}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          + Nowe porównanie
        </button>

        {/* History */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Historia porównań
          </h2>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Ładowanie…</p>
          ) : comparisons.length === 0 && !error ? (
            <div className="bg-white rounded-lg shadow px-6 py-10 text-center">
              <p className="text-gray-400">
                Brak porównań. Kliknij &quot;Nowe porównanie&quot; aby zacząć.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {comparisons.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/results/${c.id}`)}
                  className="w-full bg-white rounded-lg shadow px-6 py-4 text-left hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{c.name}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleDateString('pl-PL')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{c.person_names.join(' · ')}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
