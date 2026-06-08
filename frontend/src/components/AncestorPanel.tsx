import { useState } from 'react'

export interface AncestorOut {
  id: string
  name: string
  color: string
  created_at: string
}

export const ANCESTOR_COLORS: string[] = [
  '#fdba74', // orange-300
  '#d8b4fe', // purple-300
  '#67e8f9', // cyan-300
  '#86efac', // green-300
  '#fcd34d', // amber-300
  '#fca5a5', // red-300
  '#a5b4fc', // indigo-300
  '#5eead4', // teal-300
]

interface Props {
  ancestors: AncestorOut[]
  onAdd: (name: string, color: string) => Promise<void>
  onUpdate: (id: string, name: string, color: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export default function AncestorPanel({ ancestors, onAdd, onUpdate, onDelete }: Props) {
  const [addName, setAddName] = useState('')
  const [addColor, setAddColor] = useState(ANCESTOR_COLORS[0])
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleAdd() {
    if (!addName.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      await onAdd(addName.trim(), addColor)
      setAddName('')
      setAddColor(ANCESTOR_COLORS[0])
      setAdding(false)
    } catch {
      setFormError('Nie udało się dodać przodka. Sprawdź czy nazwa jest unikalna.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(a: AncestorOut) {
    setEditId(a.id)
    setEditName(a.name)
    setEditColor(a.color)
  }

  async function handleUpdate() {
    if (!editId || !editName.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      await onUpdate(editId, editName.trim(), editColor)
      setEditId(null)
    } catch {
      setFormError('Nie udało się zaktualizować przodka. Sprawdź czy nazwa jest unikalna.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Przodkowie
      </h2>

      {ancestors.length === 0 && !adding && (
        <p className="text-xs text-gray-400 italic">Brak przodków. Dodaj pierwszego.</p>
      )}

      <ul className="space-y-2">
        {ancestors.map((a) =>
          editId === a.id ? (
            <li key={a.id} className="space-y-2 rounded-md bg-gray-50 p-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                disabled={saving}
              />
              <div className="flex flex-wrap gap-1">
                {ANCESTOR_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditColor(c)}
                    className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: editColor === c ? '#1f2937' : 'transparent',
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleUpdate()}
                  disabled={saving}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-2 py-1 rounded"
                >
                  Zapisz
                </button>
                <button
                  onClick={() => { setEditId(null); setFormError(null) }}
                  disabled={saving}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
                >
                  Anuluj
                </button>
              </div>
              {formError && (
                <p className="text-xs text-red-600">{formError}</p>
              )}
            </li>
          ) : (
            <li key={a.id} className="flex items-center gap-2 group">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: a.color }}
              />
              <span className="text-sm text-gray-700 flex-1 truncate">{a.name}</span>
              <button
                onClick={() => startEdit(a)}
                className="text-xs text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity px-1"
                title="Edytuj"
              >
                ✎
              </button>
              <button
                onClick={() => { if (window.confirm(`Usunąć przodka "${a.name}"? Wszystkie powiązane adnotacje zostaną usunięte.`)) void onDelete(a.id) }}
                className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity px-1"
                title="Usuń"
              >
                ×
              </button>
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <div className="space-y-2 rounded-md bg-gray-50 p-2">
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Imię przodka"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            disabled={saving}
            autoFocus
          />
          <div className="flex flex-wrap gap-1">
            {ANCESTOR_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setAddColor(c)}
                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: addColor === c ? '#1f2937' : 'transparent',
                }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void handleAdd()}
              disabled={saving || !addName.trim()}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-2 py-1 rounded"
            >
              Dodaj
            </button>
            <button
              onClick={() => { setAdding(false); setAddName(''); setFormError(null) }}
              disabled={saving}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              Anuluj
            </button>
          </div>
          {formError && (
            <p className="text-xs text-red-600">{formError}</p>
          )}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          + Dodaj przodka
        </button>
      )}
    </div>
  )
}
