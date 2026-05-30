import { useAuth } from '../context/AuthContext'

export default function AppPage() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">dnaMatcher</h1>
        <p className="text-gray-600 mb-6">
          Zalogowany jako:{' '}
          <span className="font-medium">{user?.email ?? ''}</span>
        </p>
        <button
          onClick={() => void signOut()}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          Wyloguj się
        </button>
      </div>
    </div>
  )
}
