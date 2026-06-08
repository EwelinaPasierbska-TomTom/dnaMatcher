import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dna } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export default function SignUpPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Imię jest wymagane.')
      return
    }
    if (!email.trim()) {
      setError('Email jest wymagany.')
      return
    }
    if (password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków.')
      return
    }
    if (password !== confirmPassword) {
      setError('Potwierdzenie hasła nie pasuje.')
      return
    }

    setLoading(true)
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    setLoading(false)

    if (authError) {
      if (authError.message.includes('User already registered')) {
        setError('Ten email jest już zarejestrowany.')
      } else {
        setError('Rejestracja nie powiodła się. Spróbuj ponownie.')
      }
      return
    }

    // When email confirmation is disabled, Supabase returns no error for duplicate
    // emails — instead the user object has identities: []. Detect this phantom user.
    if ((data?.user?.identities?.length ?? 1) === 0) {
      setError('Ten email jest już zarejestrowany.')
      return
    }

    navigate('/app')
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
            <CardTitle className="text-xl">Zarejestruj się</CardTitle>
            <CardDescription>Stwórz konto aby zacząć analizować DNA</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <Label htmlFor="name">Imię</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jan"
                  required
                />
              </div>
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
                  placeholder="Min. 8 znaków"
                  required
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword">Powtórz hasło</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Rejestrowanie…' : 'Zarejestruj się'}
              </Button>
            </form>
            <p className="mt-4 text-sm text-gray-600 text-center">
              Masz już konto?{' '}
              <Link to="/login" className="text-blue-600 hover:underline font-medium">
                Zaloguj się
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
