import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dna, LogOut, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Dna className="w-10 h-10 text-blue-600" />
            <h1 className="text-4xl font-bold text-gray-900">dnaMatcher</h1>
          </div>
          <p className="text-lg text-gray-600">Analizuj i porównuj segmenty DNA</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <span className="text-sm text-gray-500">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="w-4 h-4 mr-1" />
              Wyloguj się
            </Button>
          </div>
        </div>

        {/* New comparison button */}
        <div className="flex justify-center mb-8">
          <Button size="lg" onClick={() => navigate('/compare')}>
            <Plus className="w-5 h-5 mr-2" />
            Nowe porównanie
          </Button>
        </div>

        {/* Comparisons list */}
        {error && <p className="text-red-600 text-sm text-center mb-4">{error}</p>}

        {loading ? (
          <div className="text-center py-12">
            <Dna className="w-12 h-12 text-gray-300 mx-auto mb-4 animate-spin" />
            <p className="text-gray-500">Ładowanie…</p>
          </div>
        ) : comparisons.length === 0 && !error ? (
          <div className="text-center py-12">
            <Dna className="w-24 h-24 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-500 mb-2">Brak porównań</h3>
            <p className="text-gray-400">Kliknij &quot;Nowe porównanie&quot; aby zacząć.</p>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">Historia porównań</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {comparisons.map((c) => (
                <Card
                  key={c.id}
                  className="border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => navigate(`/results/${c.id}`)}
                >
                  <CardHeader>
                    <CardTitle className="text-xl">{c.name}</CardTitle>
                    <CardDescription>
                      {new Date(c.created_at).toLocaleDateString('pl-PL')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-500">{c.person_names.join(' · ')}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
