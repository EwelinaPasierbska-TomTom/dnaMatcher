import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Dna } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (authError) {
      if (authError.message.includes('Invalid login credentials')) {
        setError('Nieprawidłowy email lub hasło.')
      } else if (authError.message.includes('Email not confirmed')) {
        setError('Potwierdź adres email przed logowaniem.')
      } else {
        setError('Logowanie nie powiodło się. Spróbuj ponownie.')
      }
    }
    // On success, onAuthStateChange in AuthContext fires → App redirects to /app automatically
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Dna className="w-10 h-10 text-blue-600" />
            <h1 className="text-4xl font-bold text-gray-900">dnaMatcher</h1>
          </div>
          <p className="text-lg text-gray-600">Analizuj i porównuj segmenty DNA</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Zaloguj się</CardTitle>
            <CardDescription>Podaj swój email i hasło aby kontynuować</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="twoj@email.pl"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Hasło</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Logowanie…' : 'Zaloguj się'}
              </Button>
            </form>
            <p className="mt-4 text-sm text-gray-600 text-center">
              Nie masz konta?{' '}
              <Link to="/signup" className="text-blue-600 hover:underline font-medium">
                Zarejestruj się
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
