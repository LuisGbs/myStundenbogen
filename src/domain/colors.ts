/** Gut unterscheidbare Projektfarben (funktionieren in Hell und Dunkel). */
export const PROJECT_COLORS = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#9333ea',
  '#0891b2',
  '#dc2626',
  '#ca8a04',
  '#db2777',
  '#4f46e5',
  '#059669',
]

/** Nächste Farbe, die noch am seltensten vergeben ist. */
export function nextProjectColor(usedColors: string[]): string {
  const counts = PROJECT_COLORS.map((c) => usedColors.filter((u) => u.toLowerCase() === c).length)
  const min = Math.min(...counts)
  return PROJECT_COLORS[counts.indexOf(min)]
}
