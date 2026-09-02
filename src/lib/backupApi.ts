import { getLibraryBooks, type UserLibrary } from './libraryApi'
import { supabase } from './supabase'

type BackupFile = { name: string; data: Uint8Array }

type BackupResult = {
  fileName: string
  books: number
  documents: number
  missingDocuments: number
}

const encoder = new TextEncoder()

function sanitizeName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 120) || 'archivo'
}

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'biblioteca'
}

function jsonBytes(value: unknown) {
  return encoder.encode(JSON.stringify(value, null, 2))
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function u16(value: number) {
  const out = new Uint8Array(2)
  new DataView(out.buffer).setUint16(0, value, true)
  return out
}

function u32(value: number) {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value >>> 0, true)
  return out
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear())
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = (year - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate()
  return { time, day }
}

function buildZip(files: BackupFile[]) {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  const stamp = dosDateTime()

  for (const file of files) {
    const name = encoder.encode(file.name.replace(/^\/+/, ''))
    const crc = crc32(file.data)
    const localHeader = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.day),
      u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), name,
    ])
    localParts.push(localHeader, file.data)

    const centralHeader = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.day),
      u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name,
    ])
    centralParts.push(centralHeader)
    offset += localHeader.length + file.data.length
  }

  const local = concat(localParts)
  const central = concat(centralParts)
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(local.length), u16(0),
  ])
  return new Blob([local, central, end], { type: 'application/zip' })
}

async function rows(table: string, libraryId: string) {
  const query = supabase.from(table).select('*')
  const { data, error } = table === 'libraries'
    ? await query.eq('id', libraryId)
    : await query.eq('library_id', libraryId)
  if (error) throw error
  return data ?? []
}

async function relatedRows(table: string, column: string, ids: string[]) {
  if (!ids.length) return []
  const { data, error } = await supabase.from(table).select('*').in(column, ids)
  if (error) throw error
  return data ?? []
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 3000)
}

export async function createCompleteLibraryBackup(library: UserLibrary): Promise<BackupResult> {
  const libraryId = library.id
  const exportedAt = new Date().toISOString()
  const books = await getLibraryBooks(libraryId)

  const [libraries, members, series, works, authors, editions, locations, stores, purchases, copies, attributes, movements, documents, valuations, readingEvents, loans, wishlist] = await Promise.all([
    rows('libraries', libraryId), rows('library_members', libraryId), rows('series', libraryId), rows('works', libraryId),
    rows('authors', libraryId), rows('editions', libraryId), rows('locations', libraryId), rows('stores', libraryId),
    rows('purchases', libraryId), rows('book_copies', libraryId), rows('copy_attributes', libraryId), rows('location_movements', libraryId),
    rows('documents', libraryId), rows('valuations', libraryId), rows('reading_events', libraryId), rows('loans', libraryId), rows('wishlist_items', libraryId),
  ])

  const workIds = works.map((row: any) => row.id as string)
  const purchaseIds = purchases.map((row: any) => row.id as string)
  const copyIds = copies.map((row: any) => row.id as string)

  const [workAuthors, purchaseItems, copyAttributes, purchaseDocuments, copyPhotos] = await Promise.all([
    relatedRows('work_authors', 'work_id', workIds),
    relatedRows('purchase_items', 'purchase_id', purchaseIds),
    relatedRows('book_copy_attributes', 'book_copy_id', copyIds),
    relatedRows('purchase_documents', 'purchase_id', purchaseIds),
    relatedRows('book_copy_photos', 'book_copy_id', copyIds),
  ])

  const completeData = {
    backupFormat: 'biblioteca-bel-portable-backup',
    version: 2,
    exportedAt,
    library,
    tables: {
      libraries, library_members: members, series, works, authors, work_authors: workAuthors, editions, locations, stores,
      purchases, purchase_items: purchaseItems, book_copies: copies, copy_attributes: attributes,
      book_copy_attributes: copyAttributes, location_movements: movements, documents,
      purchase_documents: purchaseDocuments, book_copy_photos: copyPhotos, valuations,
      reading_events: readingEvents, loans, wishlist_items: wishlist,
    },
  }

  const headers = ['Código','Título','Autor','ISBN','Editorial','Año','Páginas','Estado','Ubicación','Género principal','Géneros','Precio pagado','Valor estimado','Características','Añadido']
  const bookRows = books.map((b) => [b.internalCode,b.title,b.author,b.isbn,b.publisher,b.year,b.pages,b.status,b.location,b.primaryGenre,b.genres.join(' | '),b.purchasePrice,b.estimatedValue,b.badges.join(' | '),b.addedAt])
  const csv = '\uFEFF' + [headers, ...bookRows].map((row) => row.map(csvCell).join(';')).join('\r\n')

  const files: BackupFile[] = [
    { name: 'datos/biblioteca-completa.json', data: jsonBytes(completeData) },
    { name: 'datos/coleccion.csv', data: encoder.encode(csv) },
  ]

  const photoDocumentIds = new Set(copyPhotos.map((row: any) => row.document_id as string))
  let downloadedDocuments = 0
  const missing: Array<{ id: string; path: string; reason: string }> = []

  for (const document of documents as any[]) {
    const bucket = photoDocumentIds.has(document.id) || document.document_type === 'photo' ? 'book-photos' : 'book-documents'
    const { data, error } = await supabase.storage.from(bucket).download(document.storage_path)
    if (error || !data) {
      missing.push({ id: document.id, path: document.storage_path, reason: error?.message ?? 'No se pudo descargar' })
      continue
    }
    const bytes = new Uint8Array(await data.arrayBuffer())
    const original = sanitizeName(document.original_filename || document.storage_path.split('/').pop() || document.id)
    const folder = bucket === 'book-photos' ? 'archivos/fotos' : 'archivos/documentos'
    files.push({ name: `${folder}/${document.id.slice(0,8)}-${original}`, data: bytes })
    downloadedDocuments += 1
  }

  const readme = [
    'BIBLIOTECA BEL — COPIA DE SEGURIDAD PORTÁTIL',
    '',
    `Biblioteca: ${library.name}`,
    `Generada: ${exportedAt}`,
    `Ejemplares: ${books.length}`,
    `Archivos incluidos: ${downloadedDocuments}`,
    `Archivos no descargados: ${missing.length}`,
    '',
    'CONTENIDO',
    '- datos/biblioteca-completa.json: copia estructurada de todas las tablas de la colección.',
    '- datos/coleccion.csv: inventario legible por Excel, LibreOffice y otras hojas de cálculo.',
    '- archivos/documentos/: tickets, facturas y documentos privados.',
    '- archivos/fotos/: fotografías propias asociadas a ejemplares, incluidas las portadas hechas con la cámara.',
    missing.length ? '- datos/archivos-no-incluidos.json: archivos que no pudieron descargarse y su ruta original.' : '',
    '',
    'Esta copia está diseñada para conservar los datos fuera de Supabase. Guarda el ZIP en un lugar seguro.',
  ].filter(Boolean).join('\r\n')
  files.push({ name: 'README.txt', data: encoder.encode(readme) })
  if (missing.length) files.push({ name: 'datos/archivos-no-incluidos.json', data: jsonBytes(missing) })

  const date = exportedAt.slice(0, 10)
  const fileName = `${slug(library.name)}-backup-${date}.zip`
  triggerDownload(buildZip(files), fileName)
  return { fileName, books: books.length, documents: downloadedDocuments, missingDocuments: missing.length }
}
