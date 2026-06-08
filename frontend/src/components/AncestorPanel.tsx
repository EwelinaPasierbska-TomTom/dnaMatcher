import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'

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
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-sm h-8"
                disabled={saving}
                aria-label="Imię przodka"
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
                <Button
                  size="sm"
                  onClick={() => void handleUpdate()}
                  disabled={saving}
                >
                  Zapisz
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditId(null); setFormError(null) }}
                  disabled={saving}
                >
                  Anuluj
                </Button>
              </div>
              {formError && (
                <p className="text-xs text-red-600">{formError}</p>
              )}
            </li>
          ) : (
            <li key={a.id} className="flex items-center gap-2 group">
              <span
                className="inline-block w-4 h-4 rounded-full flex-shrink-0 border border-gray-200"
                style={{ backgroundColor: a.color }}
              />
              <span className="text-sm text-gray-700 flex-1 truncate">{a.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startEdit(a)}
                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                title="Edytuj"
                aria-label={`Edytuj ${a.name}`}
              >
                <Pencil className="w-3 h-3" />
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (window.confirm(`Usunąć przodka "${a.name}"? Wszystkie powiązane adnotacje zostaną usunięte.`))
                    void onDelete(a.id)
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                title="Usuń"
                aria-label={`Usuń ${a.name}`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <div className="space-y-2 rounded-md bg-gray-50 p-2">
          <Input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Imię przodka"
            className="text-sm h-8"
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
            <Button
              size="sm"
              onClick={() => void handleAdd()}
              disabled={saving || !addName.trim()}
            >
              Dodaj
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setAdding(false); setAddName(''); setFormError(null) }}
              disabled={saving}
            >
              Anuluj
            </Button>
          </div>
          {formError && (
            <p className="text-xs text-red-600">{formError}</p>
          )}
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdding(true)}
          className="text-blue-600 hover:text-blue-800 w-full justify-start px-0"
        >
          + Dodaj przodka
        </Button>
      )}
    </div>
  )
}
