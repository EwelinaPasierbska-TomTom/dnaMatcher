import type { AncestorOut } from '../components/AncestorPanel'
import type { AnnotationOut } from '../components/ChromosomeDiagram'

interface ReportOptions {
  comparisonName: string
  chromosome: string
  date: string
  imageDataUrl: string
  annotations: AnnotationOut[]
  ancestors: AncestorOut[]
}

export function generateReportHtml(opts: ReportOptions): string {
  const { comparisonName, chromosome, date, imageDataUrl, annotations, ancestors } = opts

  const ancestorMap = Object.fromEntries(ancestors.map(a => [a.id, a]))

  const chromAnnotations = annotations.filter(a => a.chromosome === chromosome)

  const annotationsHtml = chromAnnotations.length === 0
    ? '<p style="color:#6b7280;font-style:italic">Brak adnotacji</p>'
    : `<table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
            <th style="padding:6px 10px">Nitka</th>
            <th style="padding:6px 10px">Start bp</th>
            <th style="padding:6px 10px">Koniec bp</th>
            <th style="padding:6px 10px">Przodek</th>
            <th style="padding:6px 10px">Kolor</th>
          </tr>
        </thead>
        <tbody>
          ${chromAnnotations.map(a => {
            const ancestor = a.ancestor_id ? ancestorMap[a.ancestor_id] : null
            const color = ancestor?.color ?? '#9ca3af'
            const label = ancestor?.name ?? a.ancestor_label ?? '—'
            return `<tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:5px 10px">${a.strand}</td>
              <td style="padding:5px 10px;font-family:monospace">${a.start_position.toLocaleString('pl-PL')}</td>
              <td style="padding:5px 10px;font-family:monospace">${a.end_position.toLocaleString('pl-PL')}</td>
              <td style="padding:5px 10px">${escapeHtml(label)}</td>
              <td style="padding:5px 10px">
                <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${escapeHtml(color)};vertical-align:middle"></span>
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>`

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(comparisonName)} – Chromosom ${escapeHtml(chromosome)}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 24px;
      color: #111827;
    }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 15px; font-weight: 600; margin: 28px 0 10px; color: #374151; }
    p.date { font-size: 13px; color: #6b7280; margin: 0 0 20px; }
    img { display: block; max-width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; }
    @media print {
      body { max-width: 100%; margin: 0; padding: 16px; }
      @page { margin: 1cm; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(comparisonName)} – Chromosom ${escapeHtml(chromosome)}</h1>
  <p class="date">${escapeHtml(date)}</p>

  <h2>Wizualizacja</h2>
  <img src="${imageDataUrl}" alt="Chromosom ${escapeHtml(chromosome)}">

  <h2>Adnotacje</h2>
  ${annotationsHtml}

  <script>window.onload = function() { window.focus(); window.print(); }</script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
