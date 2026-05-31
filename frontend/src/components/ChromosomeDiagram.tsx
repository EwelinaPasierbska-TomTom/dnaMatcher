// Human genome reference lengths (hg38), in base pairs
const HG38_LENGTHS: Record<string, number> = {
  '1': 248956422, '2': 242193529, '3': 198295559, '4': 190214555,
  '5': 181538259, '6': 170805979, '7': 159345973, '8': 145138636,
  '9': 138394717, '10': 133797422, '11': 135086622, '12': 133275309,
  '13': 114364328, '14': 107043718, '15': 101991189, '16': 90338345,
  '17': 83257441, '18': 80373285, '19': 58617616, '20': 64444167,
  '21': 46709983, '22': 50818468, 'X': 156040895, 'Y': 57227415,
}

const COLORS: Record<string, string> = {
  FULL: '#22c55e',
  HALF: '#eab308',
  NONE: '#ef4444',
}

export interface SegmentOut {
  chromosome: string
  match_type: string
  start_bp: number
  end_bp: number
  snp_count: number
  start_cm: number | null
  end_cm: number | null
  length_bp: number
  length_cm: number | null
}

interface Props {
  segments: SegmentOut[]
  chromosomeLengths?: Record<string, number>
}

export default function ChromosomeDiagram({ segments, chromosomeLengths }: Props) {
  const lengths = chromosomeLengths ?? HG38_LENGTHS

  // Collect chromosomes that have segments, in natural order
  const chromsWithData = [
    ...new Set(segments.map((s) => s.chromosome)),
  ].sort((a, b) => {
    const numA = parseInt(a)
    const numB = parseInt(b)
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB
    if (!isNaN(numA)) return -1
    if (!isNaN(numB)) return 1
    return a.localeCompare(b)
  })

  if (chromsWithData.length === 0) return null

  const BAR_WIDTH = 400
  const BAR_HEIGHT = 14
  const ROW_GAP = 8
  const LABEL_WIDTH = 32
  const ROW_HEIGHT = BAR_HEIGHT + ROW_GAP
  const SVG_HEIGHT = chromsWithData.length * ROW_HEIGHT + 4

  return (
    <svg
      width={LABEL_WIDTH + BAR_WIDTH + 8}
      height={SVG_HEIGHT}
      className="block"
      aria-label="Diagram chromosomów"
    >
      {chromsWithData.map((chrom, rowIndex) => {
        const chromLen = lengths[chrom] ?? 1
        const y = rowIndex * ROW_HEIGHT + 2
        const chromSegs = segments.filter((s) => s.chromosome === chrom)

        return (
          <g key={chrom}>
            {/* label */}
            <text
              x={LABEL_WIDTH - 4}
              y={y + BAR_HEIGHT / 2 + 4}
              textAnchor="end"
              fontSize={10}
              fill="#6b7280"
            >
              {chrom}
            </text>
            {/* background track */}
            <rect
              x={LABEL_WIDTH}
              y={y}
              width={BAR_WIDTH}
              height={BAR_HEIGHT}
              fill="#e5e7eb"
              rx={3}
            />
            {/* segments */}
            {chromSegs.map((seg, si) => {
              const x = LABEL_WIDTH + (seg.start_bp / chromLen) * BAR_WIDTH
              const w = Math.max(1, ((seg.end_bp - seg.start_bp) / chromLen) * BAR_WIDTH)
              return (
                <rect
                  key={si}
                  x={x}
                  y={y}
                  width={w}
                  height={BAR_HEIGHT}
                  fill={COLORS[seg.match_type] ?? '#9ca3af'}
                  rx={2}
                >
                  <title>
                    {`Chr${chrom}: ${seg.start_bp.toLocaleString()}–${seg.end_bp.toLocaleString()} bp | ${seg.match_type} | ${seg.snp_count} SNPs`}
                  </title>
                </rect>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
