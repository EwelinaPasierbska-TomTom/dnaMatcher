import type { SegmentOut } from './ChromosomeDiagram'

const BADGE: Record<string, string> = {
  FULL: 'bg-green-100 text-green-800',
  HALF: 'bg-yellow-100 text-yellow-800',
  NONE: 'bg-red-100 text-red-800',
}

function chromSort(a: SegmentOut, b: SegmentOut) {
  const na = parseInt(a.chromosome)
  const nb = parseInt(b.chromosome)
  if (!isNaN(na) && !isNaN(nb)) return na - nb || a.start_bp - b.start_bp
  if (!isNaN(na)) return -1
  if (!isNaN(nb)) return 1
  return a.chromosome.localeCompare(b.chromosome) || a.start_bp - b.start_bp
}

function fmt(n: number) {
  return n.toLocaleString('pl-PL')
}

interface Props {
  segments: SegmentOut[]
}

export default function SegmentTable({ segments }: Props) {
  const sorted = [...segments].sort(chromSort)
  const hasCm = sorted.some((s) => s.length_cm !== null)

  if (sorted.length === 0) {
    return <p className="text-sm text-gray-400 italic">Brak segmentów po filtrowaniu.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="py-2 pr-4">Chr</th>
            <th className="py-2 pr-4">Start (bp)</th>
            <th className="py-2 pr-4">Koniec (bp)</th>
            <th className="py-2 pr-4">Dł. (bp)</th>
            {hasCm && <th className="py-2 pr-4">Dł. (cM)</th>}
            <th className="py-2 pr-4">SNP</th>
            <th className="py-2">Typ</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((seg, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-1.5 pr-4 font-mono">{seg.chromosome}</td>
              <td className="py-1.5 pr-4 font-mono">{fmt(seg.start_bp)}</td>
              <td className="py-1.5 pr-4 font-mono">{fmt(seg.end_bp)}</td>
              <td className="py-1.5 pr-4 font-mono">{fmt(seg.length_bp)}</td>
              {hasCm && (
                <td className="py-1.5 pr-4 font-mono">
                  {seg.length_cm !== null ? seg.length_cm.toFixed(2) : '—'}
                </td>
              )}
              <td className="py-1.5 pr-4 font-mono">{seg.snp_count}</td>
              <td className="py-1.5">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[seg.match_type] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {seg.match_type}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
