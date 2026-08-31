export const readingLabel: Record<string, string> = {
  Pendiente: '⏳ Pendiente',
  Leyendo: '📖 Leyendo',
  Leído: '✅ Leído',
  Abandonado: '🫸 Abandonado',
  Relectura: '🔁 Relectura',
}

export const badgeLabel: Record<string, string> = {
  Firmado: '✍️ Firmado',
  '1ª edición': '🥇 1ª edición',
  'Ed. especial': '✨ Ed. especial',
  'Edición especial': '✨ Edición especial',
  'Edición limitada': '💎 Ed. limitada',
  Numerado: '🔢 Numerado',
  Dedicado: '💌 Dedicado',
  Descatalogado: '🕰️ Descatalogado',
  'Cantos pintados': '🎨 Cantos pintados',
  'Tapa dura': '📘 Tapa dura',
  'Primera impresión': '📰 1ª impresión',
}

export const conditionLabel: Record<string, string> = {
  Nuevo: '✨ Nuevo',
  Excelente: '🌟 Excelente',
  'Muy bueno': '👍 Muy bueno',
  Bueno: '🙂 Bueno',
  Aceptable: '👌 Aceptable',
  Dañado: '🩹 Dañado',
}

export function formatReading(value: string) {
  return readingLabel[value] ?? value
}

export function formatBadge(value: string) {
  return badgeLabel[value] ?? `🏷️ ${value}`
}

export function formatCondition(value: string) {
  return conditionLabel[value] ?? value
}
