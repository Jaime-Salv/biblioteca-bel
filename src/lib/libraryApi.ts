import { supabase } from './supabase'
import type { AppBook, LibraryLocation } from './models'


type CopyRow = { id:string; internal_code:string; reading_status:string; physical_condition:string|null; location_id:string|null; purchase_item_id:string|null; needs_review:boolean; created_at:string; edition_id:string }
type EditionRow = { id:string; work_id:string; isbn_13:string|null; isbn_10:string|null; publisher:string|null; publication_year:number|null; page_count:number|null; cover_url:string|null; description:string|null }
type WorkRow = { id:string; canonical_title:string; subtitle:string|null; description:string|null; primary_genre:string|null; genres:string[]|null }
type WorkAuthorRow = { work_id:string; author_id:string; position:number }
type AuthorRow = { id:string; name:string }
type LocationRow = { id:string; parent_id:string|null; name:string; type:string }
type CopyAttributeRow = { book_copy_id:string; attribute_id:string }
type AttributeRow = { id:string; name:string; icon:string|null }
type ValuationRow = { book_copy_id:string; estimated_value:number|string; valuation_date:string; created_at:string }
type PurchaseItemRow = { id:string; final_price:number|string|null }

export type UserLibrary = {
  id: string
  name: string
  description: string | null
  currency: string
  owner_id: string
}

export async function getMyLibraries(userId: string) {
  const { data, error } = await supabase
    .from('libraries')
    .select('id,name,description,currency,owner_id,created_at')
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as UserLibrary[]
}


export type UserProfile = {
  id: string
  displayName: string
  bio: string
  avatarPath: string | null
  avatarUrl: string | null
}

export async function getProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,bio,avatar_url')
    .eq('id', userId)
    .single()
  if (error) throw error

  let signedAvatar: string | null = null
  const avatarPath = data?.avatar_url || null
  if (avatarPath) {
    const { data: signed } = await supabase.storage.from('profile-avatars').createSignedUrl(avatarPath, 60 * 60)
    signedAvatar = signed?.signedUrl ?? null
  }

  return {
    id: data.id,
    displayName: data.display_name ?? '',
    bio: data.bio ?? '',
    avatarPath,
    avatarUrl: signedAvatar,
  }
}

export async function updateProfile(userId: string, input: { displayName: string; bio: string }) {
  const displayName = input.displayName.trim()
  const bio = input.bio.trim()
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName || null, bio: bio || null, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
  const { error: authError } = await supabase.auth.updateUser({ data: { display_name: displayName || null } })
  if (authError) throw authError
}

export async function uploadProfileAvatar(userId: string, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Selecciona una imagen válida.')
  if (file.size > 5 * 1024 * 1024) throw new Error('La foto debe pesar menos de 5 MB.')
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, file, { upsert: false, contentType: file.type })
  if (uploadError) throw uploadError
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: path, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (profileError) throw profileError
  return path
}

export async function removeProfileAvatar(userId: string, avatarPath: string | null) {
  if (avatarPath) await supabase.storage.from('profile-avatars').remove([avatarPath])
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

export async function ensureProfile(userId: string, displayName?: string) {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    display_name: displayName?.trim() || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) throw error
}

export async function createLibrary(userId: string, name: string) {
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Escribe un nombre para la biblioteca.')

  const libraryId = crypto.randomUUID()
  const { error } = await supabase
    .from('libraries')
    .insert({ id: libraryId, name: cleanName, currency: 'EUR' })

  if (error) throw error

  return {
    id: libraryId,
    name: cleanName,
    description: null,
    currency: 'EUR',
    owner_id: userId,
  } as UserLibrary
}

export async function updateLibrarySettings(libraryId: string, input: { name: string; currency: string }) {
  const name = input.name.trim()
  if (!name) throw new Error('El nombre de la colección no puede estar vacío.')
  const currency = input.currency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Usa un código de moneda válido, por ejemplo EUR.')
  const { error } = await supabase.from('libraries').update({ name, currency }).eq('id', libraryId)
  if (error) throw error
}

function readingStatus(value: string): AppBook['status'] {
  if (value === 'reading' || value === 'read' || value === 'abandoned' || value === 'rereading') return value
  return 'pending'
}


export const BOOK_GENRES = [
  'Fantasía','Ciencia ficción','Romance','Misterio','Thriller','Terror','Aventura','Histórica',
  'Contemporánea','Clásicos','Juvenil','Infantil','Poesía','Teatro','Cómic / Novela gráfica',
  'Biografía / Memorias','Historia','Ciencia','Naturaleza','Ensayo','Filosofía','Psicología',
  'Economía / Empresa','Arte / Música','Viajes','Gastronomía','Otros',
] as const

export function inferGenres(categories: string[] = []): string[] {
  const text = categories.join(' ').toLowerCase()
  const rules: Array<[string, string[]]> = [
    ['Fantasía',['fantasy','fantasía','magic','magical']], ['Ciencia ficción',['science fiction','sci-fi','ciencia ficción']],
    ['Romance',['romance','love stories','romántica']], ['Misterio',['mystery','detective','misterio']],
    ['Thriller',['thriller','suspense']], ['Terror',['horror','terror']], ['Aventura',['adventure','aventura']],
    ['Histórica',['historical fiction','ficción histórica']], ['Contemporánea',['contemporary fiction','ficción contemporánea']],
    ['Clásicos',['classics','classic literature','clásicos']], ['Juvenil',['young adult','juvenile fiction','juvenil']],
    ['Infantil',['children','juvenile literature','infantil']], ['Poesía',['poetry','poesía']], ['Teatro',['drama','plays','teatro']],
    ['Cómic / Novela gráfica',['comics','graphic novels','comic']], ['Biografía / Memorias',['biography','autobiography','memoir','memorias']],
    ['Historia',['history','historia']], ['Ciencia',['science','ciencia']], ['Naturaleza',['nature','natural history','naturaleza']],
    ['Filosofía',['philosophy','filosofía']], ['Psicología',['psychology','psicología']], ['Economía / Empresa',['business','economics','management']],
    ['Arte / Música',['art','music','arte','música']], ['Viajes',['travel','viajes']], ['Gastronomía',['cooking','cookbooks','gastronomía']], ['Ensayo',['essays','social science','ensayo']],
  ]
  const found = rules.filter(([, needles]) => needles.some((n) => text.includes(n))).map(([genre]) => genre)
  return [...new Set(found)].slice(0, 4)
}

export async function getLibraryBooks(libraryId: string): Promise<AppBook[]> {
  const { data: copies, error: copiesError } = await supabase
    .from('book_copies')
    .select('id,internal_code,reading_status,physical_condition,location_id,purchase_item_id,needs_review,created_at,edition_id')
    .eq('library_id', libraryId)
    .eq('inventory_status', 'active')
    .order('created_at', { ascending: false })
  if (copiesError) throw copiesError
  if (!copies?.length) return []

  const copyRows = copies as CopyRow[]
  const editionIds = [...new Set(copyRows.map((c) => c.edition_id))]
  const locationIds = [...new Set(copyRows.map((c) => c.location_id).filter(Boolean))] as string[]
  const purchaseItemIds = [...new Set(copyRows.map((c) => c.purchase_item_id).filter(Boolean))] as string[]
  const copyIds = copyRows.map((c) => c.id)

  const [editionRes, locationsRes, attrsRes, valuationsRes, purchasesRes] = await Promise.all([
    supabase.from('editions').select('id,work_id,isbn_13,isbn_10,publisher,publication_year,page_count,cover_url,description').in('id', editionIds),
    locationIds.length ? supabase.from('locations').select('id,parent_id,name,type').eq('library_id', libraryId) : Promise.resolve({ data: [], error: null }),
    supabase.from('book_copy_attributes').select('book_copy_id,attribute_id').in('book_copy_id', copyIds),
    supabase.from('valuations').select('book_copy_id,estimated_value,valuation_date,created_at').in('book_copy_id', copyIds).order('valuation_date', { ascending: false }),
    purchaseItemIds.length ? supabase.from('purchase_items').select('id,final_price').in('id', purchaseItemIds) : Promise.resolve({ data: [], error: null }),
  ])

  for (const result of [editionRes, locationsRes, attrsRes, valuationsRes, purchasesRes]) {
    if (result.error) throw result.error
  }

  const editions = (editionRes.data ?? []) as EditionRow[]
  const workIds = [...new Set(editions.map((e) => e.work_id))]
  const { data: worksRaw, error: worksError } = await supabase
    .from('works')
    .select('id,canonical_title,subtitle,description,primary_genre,genres')
    .in('id', workIds)
  const works = (worksRaw ?? []) as WorkRow[]
  if (worksError) throw worksError

  const { data: workAuthorsRaw, error: waError } = await supabase
    .from('work_authors')
    .select('work_id,author_id,position')
    .in('work_id', workIds)
    .order('position', { ascending: true })
  const workAuthors = (workAuthorsRaw ?? []) as WorkAuthorRow[]
  if (waError) throw waError

  const authorIds = [...new Set(workAuthors.map((wa) => wa.author_id))]
  const { data: authorsRaw, error: authorsError } = authorIds.length
    ? await supabase.from('authors').select('id,name').in('id', authorIds)
    : { data: [], error: null }
  if (authorsError) throw authorsError
  const authors = (authorsRaw ?? []) as AuthorRow[]

  const attributeRows = (attrsRes.data ?? []) as CopyAttributeRow[]
  const valuationRows = (valuationsRes.data ?? []) as ValuationRow[]
  const locationRows = (locationsRes.data ?? []) as LocationRow[]
  const purchaseRows = (purchasesRes.data ?? []) as PurchaseItemRow[]
  const attributeIds = [...new Set(attributeRows.map((a) => a.attribute_id))]
  const { data: attributesRaw, error: attributeError } = attributeIds.length
    ? await supabase.from('copy_attributes').select('id,name,icon').in('id', attributeIds)
    : { data: [], error: null }
  if (attributeError) throw attributeError
  const attributes = (attributesRaw ?? []) as AttributeRow[]

  const editionById = new Map(editions.map((e) => [e.id, e]))
  const workById = new Map(works.map((w) => [w.id, w]))
  const authorById = new Map(authors.map((a) => [a.id, a.name]))
  const locationById = new Map(locationRows.map((l) => [l.id, l]))
  const attributeById = new Map(attributes.map((a) => [a.id, `${a.icon ? `${a.icon} ` : ''}${a.name}`]))
  const purchaseById = new Map(purchaseRows.map((p) => [p.id, p.final_price]))

  const authorsByWork = new Map<string, string[]>()
  for (const wa of workAuthors) {
    const arr = authorsByWork.get(wa.work_id) ?? []
    const name = authorById.get(wa.author_id)
    if (name) arr.push(name)
    authorsByWork.set(wa.work_id, arr)
  }

  const badgesByCopy = new Map<string, string[]>()
  for (const row of attributeRows) {
    const label = attributeById.get(row.attribute_id)
    if (!label) continue
    const arr = badgesByCopy.get(row.book_copy_id) ?? []
    arr.push(label)
    badgesByCopy.set(row.book_copy_id, arr)
  }

  const latestValueByCopy = new Map<string, number>()
  for (const row of valuationRows) {
    if (!latestValueByCopy.has(row.book_copy_id)) latestValueByCopy.set(row.book_copy_id, Number(row.estimated_value))
  }

  function locationPath(id: string | null) {
    if (!id) return null
    const path: string[] = []
    let current = locationById.get(id)
    let safety = 0
    while (current && safety < 8) {
      path.unshift(current.name)
      current = current.parent_id ? locationById.get(current.parent_id) : undefined
      safety += 1
    }
    return path.join(' · ') || null
  }

  return copyRows.map((copy) => {
    const edition = editionById.get(copy.edition_id)
    const work = edition ? workById.get(edition.work_id) : undefined
    return {
      id: copy.id,
      editionId: copy.edition_id,
      internalCode: copy.internal_code,
      title: work?.canonical_title ?? 'Libro sin título',
      subtitle: work?.subtitle ?? null,
      author: edition ? (authorsByWork.get(edition.work_id)?.join(', ') || 'Autor desconocido') : 'Autor desconocido',
      isbn: edition?.isbn_13 ?? edition?.isbn_10 ?? null,
      publisher: edition?.publisher ?? null,
      year: edition?.publication_year ?? null,
      pages: edition?.page_count ?? null,
      synopsis: edition?.description ?? work?.description ?? null,
      coverUrl: edition?.cover_url ?? null,
      status: readingStatus(copy.reading_status),
      condition: copy.physical_condition,
      location: locationPath(copy.location_id),
      locationId: copy.location_id,
      badges: badgesByCopy.get(copy.id) ?? [],
      purchasePrice: copy.purchase_item_id ? Number(purchaseById.get(copy.purchase_item_id) ?? 0) : null,
      estimatedValue: latestValueByCopy.get(copy.id) ?? null,
      addedAt: copy.created_at,
      needsReview: copy.needs_review,
      primaryGenre: work?.primary_genre ?? null,
      genres: Array.isArray(work?.genres) ? work.genres : [],
    }
  })
}

export async function getLocations(libraryId: string): Promise<LibraryLocation[]> {
  const [{ data: locations, error }, { data: copies, error: copiesError }] = await Promise.all([
    supabase.from('locations').select('id,name,type,parent_id,position').eq('library_id', libraryId).order('position', { ascending: true }),
    supabase.from('book_copies').select('location_id').eq('library_id', libraryId).eq('inventory_status', 'active'),
  ])
  if (error) throw error
  if (copiesError) throw copiesError
  const counts = new Map<string, number>()
  for (const copy of copies ?? []) if (copy.location_id) counts.set(copy.location_id, (counts.get(copy.location_id) ?? 0) + 1)
  return (locations ?? []).map((loc) => ({
    id: loc.id,
    name: loc.name,
    type: loc.type,
    parentId: loc.parent_id,
    position: loc.position,
    bookCount: counts.get(loc.id) ?? 0,
  }))
}

export async function createLocation(libraryId: string, input: { name: string; type: string; parentId?: string | null }) {
  const { data, error } = await supabase.from('locations').insert({
    library_id: libraryId,
    name: input.name.trim(),
    type: input.type,
    parent_id: input.parentId ?? null,
  }).select('id,name,type,parent_id,position').single()
  if (error) throw error
  return data
}

export type ExternalBook = {
  source?: 'google_books' | 'open_library' | 'manual'
  sourceId: string
  title: string
  subtitle?: string | null
  authors: string[]
  publisher?: string | null
  publishedDate?: string | null
  publicationYear?: number | null
  pageCount?: number | null
  description?: string | null
  language?: string | null
  isbn10?: string | null
  isbn13?: string | null
  coverUrl?: string | null
  categories: string[]
  raw: unknown
}

export async function lookupGoogleBooksByIsbn(isbnInput: string): Promise<ExternalBook | null> {
  const isbn = isbnInput.replace(/[^0-9Xx]/g, '').toUpperCase()
  if (isbn.length !== 10 && isbn.length !== 13) throw new Error('Introduce un ISBN-10 o ISBN-13 válido.')

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) throw new Error('Tu sesión ha caducado. Cierra sesión y vuelve a entrar.')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
  const response = await fetch(`${supabaseUrl}/functions/v1/lookup-book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': publishableKey,
    },
    body: JSON.stringify({ isbn }),
  })

  let data: any = null
  try { data = await response.json() } catch { /* handled below */ }

  if (!response.ok) {
    if (response.status === 401) throw new Error('Tu sesión no es válida. Cierra sesión y vuelve a entrar.')
    throw new Error(data?.error || `No hemos podido consultar el libro (error ${response.status}).`)
  }
  if (data?.apiVersion !== 4) throw new Error('La app no está conectando con la versión actual del buscador. Recarga la página.')
  if (!data?.found || !data?.book) return null

  const book = data.book
  const secureImage = typeof book.coverUrl === 'string' ? book.coverUrl.replace(/^http:\/\//, 'https://') : null
  const description = typeof book.description === 'string'
    ? book.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    : null

  return {
    source: data?.provider === 'open_library' ? 'open_library' : 'google_books',
    sourceId: book.externalId || '',
    title: book.title || 'Sin título',
    subtitle: book.subtitle || null,
    authors: Array.isArray(book.authors) ? book.authors : [],
    publisher: book.publisher || null,
    publishedDate: book.publicationDate || null,
    publicationYear: Number.isFinite(book.publicationYear) ? book.publicationYear : null,
    pageCount: Number.isFinite(book.pageCount) ? book.pageCount : null,
    description,
    language: book.language || null,
    isbn10: book.isbn10 || null,
    isbn13: book.isbn13 || (isbn.length === 13 ? isbn : null),
    coverUrl: secureImage,
    categories: Array.isArray(book.categories) ? book.categories : [],
    raw: book.metadata ?? book,
  }
}

export async function addExternalBookToLibrary(libraryId: string, book: ExternalBook) {
  let editionId: string | null = null
  if (book.isbn13) {
    const { data } = await supabase.from('editions').select('id').eq('library_id', libraryId).eq('isbn_13', book.isbn13).maybeSingle()
    editionId = data?.id ?? null
  }

  if (!editionId) {
    const { data: existingWork } = await supabase.from('works').select('id').eq('library_id', libraryId).ilike('canonical_title', book.title).limit(1).maybeSingle()
    let workId = existingWork?.id as string | undefined
    if (!workId) {
      const inferredGenres = inferGenres(book.categories)
      const { data: work, error } = await supabase.from('works').insert({ library_id: libraryId, canonical_title: book.title, subtitle: book.subtitle ?? null, description: book.description ?? null, primary_genre: inferredGenres[0] ?? null, genres: inferredGenres }).select('id').single()
      if (error) throw error
      workId = work.id
    }

    const inferredGenres = inferGenres(book.categories)
    if (inferredGenres.length) {
      await supabase.from('works').update({ primary_genre: inferredGenres[0], genres: inferredGenres })
        .eq('library_id', libraryId).eq('id', workId).is('primary_genre', null)
    }

    for (let index = 0; index < book.authors.length; index += 1) {
      const authorName = book.authors[index]
      const { data: existingAuthor } = await supabase.from('authors').select('id').eq('library_id', libraryId).ilike('name', authorName).limit(1).maybeSingle()
      let authorId = existingAuthor?.id as string | undefined
      if (!authorId) {
        const { data: author, error } = await supabase.from('authors').insert({ library_id: libraryId, name: authorName }).select('id').single()
        if (error) throw error
        authorId = author.id
      }
      const { error: linkError } = await supabase.from('work_authors').upsert({ work_id: workId, author_id: authorId, role: 'author', position: index }, { onConflict: 'work_id,author_id,role' })
      if (linkError) throw linkError
    }

    const normalizedDate = book.publishedDate && /^\d{4}-\d{2}-\d{2}$/.test(book.publishedDate) ? book.publishedDate : null
    const { data: edition, error: editionError } = await supabase.from('editions').insert({
      library_id: libraryId,
      work_id: workId,
      isbn_10: book.isbn10 ?? null,
      isbn_13: book.isbn13 ?? null,
      publisher: book.publisher ?? null,
      publication_date: normalizedDate,
      publication_year: book.publicationYear ?? null,
      language: book.language ?? null,
      page_count: book.pageCount ?? null,
      cover_url: book.coverUrl ?? null,
      description: book.description ?? null,
      external_source: book.source ?? 'manual',
      external_source_id: book.sourceId,
      metadata_json: book.raw as any,
    }).select('id').single()
    if (editionError) throw editionError
    editionId = edition.id
  }

  const internalCode = `LIB-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`
  const { data: copy, error: copyError } = await supabase.from('book_copies').insert({
    library_id: libraryId,
    edition_id: editionId,
    internal_code: internalCode,
    reading_status: 'pending',
    inventory_status: 'active',
    needs_review: true,
  }).select('id,internal_code').single()
  if (copyError) throw copyError
  return copy
}


export async function searchExternalBooks(queryInput: string): Promise<ExternalBook[]> {
  const query = queryInput.trim()
  if (query.length < 2) throw new Error('Escribe al menos 2 caracteres.')
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) throw new Error('Tu sesión ha caducado. Cierra sesión y vuelve a entrar.')
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
  const response = await fetch(`${supabaseUrl}/functions/v1/search-books`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': publishableKey,
    },
    body: JSON.stringify({ query }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'No se pudo buscar el libro.')
  const provider: ExternalBook['source'] = data?.provider === 'open_library' ? 'open_library' : 'google_books'
  return (Array.isArray(data?.results) ? data.results : []).map((book: any) => ({
    source: provider,
    sourceId: book.externalId || '',
    title: book.title || 'Sin título',
    subtitle: book.subtitle || null,
    authors: Array.isArray(book.authors) ? book.authors : [],
    publisher: book.publisher || null,
    publishedDate: book.publicationDate || null,
    publicationYear: Number.isFinite(book.publicationYear) ? book.publicationYear : null,
    pageCount: Number.isFinite(book.pageCount) ? book.pageCount : null,
    description: typeof book.description === 'string' ? book.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null,
    language: book.language || null,
    isbn10: book.isbn10 || null,
    isbn13: book.isbn13 || null,
    coverUrl: typeof book.coverUrl === 'string' ? book.coverUrl.replace(/^http:\/\//, 'https://') : null,
    categories: Array.isArray(book.categories) ? book.categories : [],
    raw: book.metadata ?? book,
  }))
}

function cleanIsbn(isbnInput: string) {
  return isbnInput.replace(/[^0-9Xx]/g, '').toUpperCase()
}

export async function captureIsbnToLibrary(libraryId: string, isbnInput: string, locationId?: string | null) {
  const isbn = cleanIsbn(isbnInput)
  if (isbn.length !== 10 && isbn.length !== 13) throw new Error('Introduce un ISBN-10 o ISBN-13 válido.')

  const isbnColumn = isbn.length === 13 ? 'isbn_13' : 'isbn_10'
  const { data: existingEdition, error: editionLookupError } = await supabase
    .from('editions')
    .select('id,work_id')
    .eq('library_id', libraryId)
    .eq(isbnColumn, isbn)
    .maybeSingle()
  if (editionLookupError) throw editionLookupError

  let editionId = existingEdition?.id as string | undefined
  let workId = existingEdition?.work_id as string | undefined

  if (!editionId || !workId) {
    const { data: work, error: workError } = await supabase.from('works').insert({
      library_id: libraryId,
      canonical_title: `ISBN ${isbn}`,
      description: 'Ejemplar capturado. Metadatos pendientes de completar.',
    }).select('id').single()
    if (workError) throw workError
    workId = work.id

    const { data: edition, error: editionError } = await supabase.from('editions').insert({
      library_id: libraryId,
      work_id: workId,
      isbn_10: isbn.length === 10 ? isbn : null,
      isbn_13: isbn.length === 13 ? isbn : null,
      external_source: 'captured_isbn',
      metadata_json: { captured_isbn: isbn },
    }).select('id').single()
    if (editionError) throw editionError
    editionId = edition.id
  }

  const internalCode = `LIB-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`
  const { data: copy, error: copyError } = await supabase.from('book_copies').insert({
    library_id: libraryId,
    edition_id: editionId,
    internal_code: internalCode,
    reading_status: 'pending',
    inventory_status: 'active',
    needs_review: true,
    location_id: locationId ?? null,
  }).select('id,internal_code,edition_id').single()
  if (copyError) throw copyError
  return { ...copy, isbn, workId }
}

export async function enrichCapturedBook(libraryId: string, copyId: string, book: ExternalBook) {
  const { data: copy, error: copyError } = await supabase.from('book_copies')
    .select('edition_id').eq('library_id', libraryId).eq('id', copyId).single()
  if (copyError) throw copyError
  const { data: edition, error: editionError } = await supabase.from('editions')
    .select('id,work_id').eq('library_id', libraryId).eq('id', copy.edition_id).single()
  if (editionError) throw editionError

  const inferredGenres = inferGenres(book.categories)
  const { error: workUpdateError } = await supabase.from('works').update({
    canonical_title: book.title,
    subtitle: book.subtitle ?? null,
    description: book.description ?? null,
    primary_genre: inferredGenres[0] ?? null,
    genres: inferredGenres,
  }).eq('library_id', libraryId).eq('id', edition.work_id)
  if (workUpdateError) throw workUpdateError

  const normalizedDate = book.publishedDate && /^\d{4}-\d{2}-\d{2}$/.test(book.publishedDate) ? book.publishedDate : null
  const { error: editionUpdateError } = await supabase.from('editions').update({
    isbn_10: book.isbn10 ?? null,
    isbn_13: book.isbn13 ?? null,
    publisher: book.publisher ?? null,
    publication_date: normalizedDate,
    publication_year: book.publicationYear ?? null,
    language: book.language ?? null,
    page_count: book.pageCount ?? null,
    cover_url: book.coverUrl ?? null,
    description: book.description ?? null,
    external_source: book.source ?? 'manual',
    external_source_id: book.sourceId || null,
    metadata_json: book.raw as any,
  }).eq('library_id', libraryId).eq('id', edition.id)
  if (editionUpdateError) throw editionUpdateError

  for (let index = 0; index < book.authors.length; index += 1) {
    const authorName = book.authors[index].trim()
    if (!authorName) continue
    const { data: existingAuthor } = await supabase.from('authors').select('id')
      .eq('library_id', libraryId).ilike('name', authorName).limit(1).maybeSingle()
    let authorId = existingAuthor?.id as string | undefined
    if (!authorId) {
      const { data: author, error } = await supabase.from('authors').insert({ library_id: libraryId, name: authorName }).select('id').single()
      if (error) throw error
      authorId = author.id
    }
    const { error: linkError } = await supabase.from('work_authors').upsert({
      work_id: edition.work_id,
      author_id: authorId,
      role: 'author',
      position: index,
    }, { onConflict: 'work_id,author_id,role' })
    if (linkError) throw linkError
  }

  const { error: reviewError } = await supabase.from('book_copies').update({ needs_review: false })
    .eq('library_id', libraryId).eq('id', copyId)
  if (reviewError) throw reviewError
}

export async function addManualBookToLibrary(libraryId: string, input: {
  title: string
  author?: string
  isbn?: string
  publisher?: string
  publicationYear?: number | null
  pageCount?: number | null
}) {
  const title = input.title.trim()
  if (!title) throw new Error('Escribe el título del libro.')
  const isbn = input.isbn ? cleanIsbn(input.isbn) : ''
  if (isbn && isbn.length !== 10 && isbn.length !== 13) throw new Error('El ISBN debe tener 10 o 13 caracteres.')
  return addExternalBookToLibrary(libraryId, {
    source: 'manual',
    sourceId: '',
    title,
    subtitle: null,
    authors: input.author?.trim() ? [input.author.trim()] : [],
    publisher: input.publisher?.trim() || null,
    publishedDate: null,
    publicationYear: input.publicationYear ?? null,
    pageCount: input.pageCount ?? null,
    description: null,
    language: null,
    isbn10: isbn.length === 10 ? isbn : null,
    isbn13: isbn.length === 13 ? isbn : null,
    coverUrl: null,
    categories: [],
    raw: { manual: true },
  })
}

export async function updateBookDetails(libraryId: string, copyId: string, input: {
  title: string
  subtitle?: string | null
  authors?: string[]
  isbn?: string | null
  publisher?: string | null
  publicationYear?: number | null
  pageCount?: number | null
  description?: string | null
  coverUrl?: string | null
  readingStatus: 'pending' | 'reading' | 'read' | 'abandoned' | 'rereading'
  physicalCondition?: string | null
  locationId?: string | null
  primaryGenre?: string | null
  genres?: string[]
}) {
  const title = input.title.trim()
  if (!title) throw new Error('El título no puede estar vacío.')

  const isbn = input.isbn ? cleanIsbn(input.isbn) : ''
  if (isbn && isbn.length !== 10 && isbn.length !== 13) {
    throw new Error('El ISBN debe tener 10 o 13 caracteres.')
  }

  const { data: copy, error: copyError } = await supabase
    .from('book_copies')
    .select('edition_id')
    .eq('library_id', libraryId)
    .eq('id', copyId)
    .single()
  if (copyError) throw copyError

  const { data: edition, error: editionError } = await supabase
    .from('editions')
    .select('id,work_id')
    .eq('library_id', libraryId)
    .eq('id', copy.edition_id)
    .single()
  if (editionError) throw editionError

  const description = input.description?.trim() || null
  const { error: workError } = await supabase.from('works').update({
    canonical_title: title,
    subtitle: input.subtitle?.trim() || null,
    description,
    primary_genre: input.primaryGenre?.trim() || null,
    genres: [...new Set((input.genres ?? []).map((g) => g.trim()).filter(Boolean))],
  }).eq('library_id', libraryId).eq('id', edition.work_id)
  if (workError) throw workError

  const { error: editionUpdateError } = await supabase.from('editions').update({
    isbn_10: isbn.length === 10 ? isbn : null,
    isbn_13: isbn.length === 13 ? isbn : null,
    publisher: input.publisher?.trim() || null,
    publication_year: input.publicationYear ?? null,
    page_count: input.pageCount ?? null,
    description,
    cover_url: input.coverUrl?.trim() || null,
  }).eq('library_id', libraryId).eq('id', edition.id)
  if (editionUpdateError) throw editionUpdateError

  const authorNames = (input.authors ?? []).map((name) => name.trim()).filter(Boolean)
  const { error: removeAuthorsError } = await supabase.from('work_authors')
    .delete().eq('work_id', edition.work_id).eq('role', 'author')
  if (removeAuthorsError) throw removeAuthorsError

  for (let index = 0; index < authorNames.length; index += 1) {
    const authorName = authorNames[index]
    const { data: existingAuthor, error: authorLookupError } = await supabase.from('authors')
      .select('id').eq('library_id', libraryId).ilike('name', authorName).limit(1).maybeSingle()
    if (authorLookupError) throw authorLookupError

    let authorId = existingAuthor?.id as string | undefined
    if (!authorId) {
      const { data: author, error: authorError } = await supabase.from('authors')
        .insert({ library_id: libraryId, name: authorName }).select('id').single()
      if (authorError) throw authorError
      authorId = author.id
    }

    const { error: linkError } = await supabase.from('work_authors').insert({
      work_id: edition.work_id,
      author_id: authorId,
      role: 'author',
      position: index,
    })
    if (linkError) throw linkError
  }

  const { error: copyUpdateError } = await supabase.from('book_copies').update({
    reading_status: input.readingStatus,
    physical_condition: input.physicalCondition || null,
    location_id: input.locationId || null,
    needs_review: false,
  }).eq('library_id', libraryId).eq('id', copyId)
  if (copyUpdateError) throw copyUpdateError
}

export type CollectorAttributeState = {
  id: string
  name: string
  icon: string | null
  selected: boolean
  valueText: string
  notes: string
}

export type BookCollectorDetails = {
  purchase: {
    purchaseId: string | null
    purchaseItemId: string | null
    price: number | null
    seller: string
    date: string
    orderNumber: string
    ticketName: string | null
    ticketUrl: string | null
  }
  attributes: CollectorAttributeState[]
  valuations: { id:string; value:number; date:string; source:string|null; notes:string|null }[]
}

export async function getBookCollectorDetails(libraryId: string, copyId: string): Promise<BookCollectorDetails> {
  const { data: copy, error: copyError } = await supabase.from('book_copies')
    .select('purchase_item_id').eq('library_id', libraryId).eq('id', copyId).single()
  if (copyError) throw copyError

  let purchase = { purchaseId:null as string|null, purchaseItemId:null as string|null, price:null as number|null, seller:'', date:'', orderNumber:'', ticketName:null as string|null, ticketUrl:null as string|null }
  if (copy.purchase_item_id) {
    const { data: item, error: itemError } = await supabase.from('purchase_items').select('id,purchase_id,final_price').eq('id', copy.purchase_item_id).single()
    if (itemError) throw itemError
    const { data: p, error: pError } = await supabase.from('purchases').select('id,purchase_date,seller_name,order_number').eq('library_id', libraryId).eq('id', item.purchase_id).single()
    if (pError) throw pError
    purchase = {
      purchaseId: p.id,
      purchaseItemId: item.id,
      price: item.final_price == null ? null : Number(item.final_price),
      seller: p.seller_name ?? '',
      date: p.purchase_date ?? '',
      orderNumber: p.order_number ?? '',
      ticketName: null,
      ticketUrl: null,
    }
    const { data: links } = await supabase.from('purchase_documents').select('document_id').eq('purchase_id', p.id).limit(1)
    if (links?.[0]?.document_id) {
      const { data: doc } = await supabase.from('documents').select('storage_path,original_filename').eq('library_id', libraryId).eq('id', links[0].document_id).maybeSingle()
      if (doc?.storage_path) {
        const { data: signed } = await supabase.storage.from('book-documents').createSignedUrl(doc.storage_path, 60 * 30)
        purchase.ticketName = doc.original_filename ?? 'Ticket de compra'
        purchase.ticketUrl = signed?.signedUrl ?? null
      }
    }
  }

  const { data: attrs, error: attrsError } = await supabase.from('copy_attributes')
    .select('id,name,icon').eq('library_id', libraryId).order('name')
  if (attrsError) throw attrsError
  const { data: selected, error: selectedError } = await supabase.from('book_copy_attributes')
    .select('attribute_id,value_text,notes').eq('book_copy_id', copyId)
  if (selectedError) throw selectedError
  const selectedMap = new Map<string, { attribute_id:string; value_text?:string|null; notes?:string|null }>((selected ?? []).map((r:any) => [String(r.attribute_id), r]))
  const attributes = (attrs ?? []).map((a:any) => ({
    id:a.id, name:a.name, icon:a.icon,
    selected:selectedMap.has(a.id),
    valueText:selectedMap.get(a.id)?.value_text ?? '',
    notes:selectedMap.get(a.id)?.notes ?? '',
  }))

  const { data: vals, error: valsError } = await supabase.from('valuations')
    .select('id,estimated_value,valuation_date,source,notes').eq('library_id', libraryId).eq('book_copy_id', copyId).order('valuation_date', { ascending:false })
  if (valsError) throw valsError
  return {
    purchase,
    attributes,
    valuations:(vals ?? []).map((v:any) => ({ id:v.id, value:Number(v.estimated_value), date:v.valuation_date, source:v.source, notes:v.notes })),
  }
}

export async function saveBookPurchase(libraryId: string, copyId: string, editionId: string, input: { price:number|null; seller:string; date:string; orderNumber:string }) {
  const cleanSeller = input.seller.trim() || null
  const cleanOrder = input.orderNumber.trim() || null
  const price = input.price != null && Number.isFinite(input.price) ? Math.max(0,input.price) : null
  const { data: copy, error: copyError } = await supabase.from('book_copies').select('purchase_item_id').eq('library_id',libraryId).eq('id',copyId).single()
  if (copyError) throw copyError

  if (copy.purchase_item_id) {
    const { data: item, error:itemError } = await supabase.from('purchase_items').select('id,purchase_id').eq('id',copy.purchase_item_id).single()
    if (itemError) throw itemError
    const { error:pError } = await supabase.from('purchases').update({
      purchase_date:input.date || null, seller_name:cleanSeller, order_number:cleanOrder, total_amount:price, updated_at:new Date().toISOString(),
    }).eq('library_id',libraryId).eq('id',item.purchase_id)
    if (pError) throw pError
    const { error:iError } = await supabase.from('purchase_items').update({ unit_price:price, final_price:price }).eq('id',item.id)
    if (iError) throw iError
    return { purchaseId:item.purchase_id, purchaseItemId:item.id }
  }

  const purchaseId = crypto.randomUUID()
  const itemId = crypto.randomUUID()
  const { error:pError } = await supabase.from('purchases').insert({
    id:purchaseId, library_id:libraryId, purchase_date:input.date || null, seller_name:cleanSeller, total_amount:price, currency:'EUR', order_number:cleanOrder,
  })
  if (pError) throw pError
  const { error:iError } = await supabase.from('purchase_items').insert({
    id:itemId, purchase_id:purchaseId, edition_id:editionId, quantity:1, unit_price:price, final_price:price,
  })
  if (iError) throw iError
  const { error:cError } = await supabase.from('book_copies').update({ purchase_item_id:itemId }).eq('library_id',libraryId).eq('id',copyId)
  if (cError) throw cError
  return { purchaseId, purchaseItemId:itemId }
}

export async function uploadPurchaseTicket(libraryId: string, purchaseId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_')
  const storagePath = `${libraryId}/purchases/${purchaseId}/${crypto.randomUUID()}-${safeName}`
  const { error:uploadError } = await supabase.storage.from('book-documents').upload(storagePath,file,{ contentType:file.type || undefined, upsert:false })
  if (uploadError) throw uploadError
  const documentId = crypto.randomUUID()
  const type = file.type === 'application/pdf' ? 'invoice' : 'receipt'
  const { error:docError } = await supabase.from('documents').insert({ id:documentId, library_id:libraryId, storage_path:storagePath, document_type:type, original_filename:file.name, mime_type:file.type || null })
  if (docError) throw docError
  const { error:linkError } = await supabase.from('purchase_documents').insert({ purchase_id:purchaseId, document_id:documentId })
  if (linkError) throw linkError
  return documentId
}

export async function saveCollectorAttributes(copyId: string, states: CollectorAttributeState[]) {
  const selected = states.filter(s => s.selected)
  const unselected = states.filter(s => !s.selected)
  if (unselected.length) {
    const { error } = await supabase.from('book_copy_attributes').delete().eq('book_copy_id',copyId).in('attribute_id',unselected.map(s=>s.id))
    if (error) throw error
  }
  for (const state of selected) {
    const { error } = await supabase.from('book_copy_attributes').upsert({
      book_copy_id:copyId, attribute_id:state.id, value_text:state.valueText.trim() || null, notes:state.notes.trim() || null,
    }, { onConflict:'book_copy_id,attribute_id' })
    if (error) throw error
  }
}

export async function addBookValuation(libraryId:string, copyId:string, value:number, source?:string|null, notes?:string|null) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Introduce un valor válido.')
  const { error } = await supabase.from('valuations').insert({
    library_id:libraryId, book_copy_id:copyId, estimated_value:value, valuation_date:new Date().toISOString().slice(0,10), source:source?.trim() || null, notes:notes?.trim() || null,
  })
  if (error) throw error
}

export async function estimateBookValueByIsbn(isbn:string) {
  const { data:sessionData, error:sessionError } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (sessionError || !token) throw new Error('Tu sesión ha caducado.')
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/estimate-book-value`, {
    method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}`, apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, body:JSON.stringify({isbn}),
  })
  const data = await response.json().catch(()=>null)
  if (!response.ok) throw new Error(data?.error || 'No se pudo estimar el valor.')
  return data as { found:boolean; value?:number; currency?:string; source?:string; note?:string; reason?:string }
}

export async function getCollectionInsights(libraryId:string) {
  const { data:copies, error:copyError } = await supabase.from('book_copies').select('id,purchase_item_id,edition_id,reading_status,location_id,created_at').eq('library_id',libraryId).eq('inventory_status','active')
  if (copyError) throw copyError
  const copyRows=(copies??[]) as any[]
  const ids=copyRows.map((c:any)=>c.id)
  const editionIds=[...new Set(copyRows.map((c:any)=>c.edition_id))]
  const purchaseItemIds=copyRows.map((c:any)=>c.purchase_item_id).filter(Boolean)
  const [linksRes, valsRes, purchaseItemsRes, editionsRes] = await Promise.all([
    ids.length ? supabase.from('book_copy_attributes').select('book_copy_id,attribute_id').in('book_copy_id',ids) : Promise.resolve({data:[],error:null}),
    ids.length ? supabase.from('valuations').select('book_copy_id,estimated_value,valuation_date').in('book_copy_id',ids).order('valuation_date',{ascending:false}) : Promise.resolve({data:[],error:null}),
    purchaseItemIds.length ? supabase.from('purchase_items').select('id,final_price').in('id',purchaseItemIds) : Promise.resolve({data:[],error:null}),
    editionIds.length ? supabase.from('editions').select('id,work_id,page_count').in('id',editionIds) : Promise.resolve({data:[],error:null}),
  ])
  if (linksRes.error || valsRes.error || purchaseItemsRes.error || editionsRes.error) throw (linksRes.error || valsRes.error || purchaseItemsRes.error || editionsRes.error)
  const attrIds=[...new Set((linksRes.data??[]).map((r:any)=>r.attribute_id))]
  const workIds=[...new Set((editionsRes.data??[]).map((e:any)=>e.work_id))]
  const [attrsRes, worksRes] = await Promise.all([
    attrIds.length ? supabase.from('copy_attributes').select('id,name').in('id',attrIds) : Promise.resolve({data:[],error:null}),
    workIds.length ? supabase.from('works').select('id,primary_genre,genres').in('id',workIds) : Promise.resolve({data:[],error:null}),
  ])
  if (attrsRes.error || worksRes.error) throw (attrsRes.error || worksRes.error)
  const nameById=new Map<string,string>((attrsRes.data??[]).map((a:any)=>[String(a.id),String(a.name).toLowerCase()]))
  const counts:Record<string,number>={}
  for (const link of linksRes.data??[]) { const name=nameById.get((link as any).attribute_id); if (name) counts[name]=(counts[name]??0)+1 }
  const latest=new Map<string,number>()
  for (const v of valsRes.data??[]) if (!latest.has((v as any).book_copy_id)) latest.set((v as any).book_copy_id,Number((v as any).estimated_value))
  const totalValue=[...latest.values()].reduce((a,b)=>a+b,0)
  const totalSpent=(purchaseItemsRes.data??[]).reduce((a:number,p:any)=>a+Number(p.final_price??0),0)
  const editionById=new Map((editionsRes.data??[]).map((e:any)=>[e.id,e]))
  const workById=new Map((worksRes.data??[]).map((w:any)=>[w.id,w]))
  const genreCounts:Record<string,number>={}
  const genreReadCounts:Record<string,number>={}
  let classifiedBooks=0, totalPages=0, readPages=0, locatedBooks=0
  for (const copy of copyRows) {
    const edition=editionById.get(copy.edition_id) as any
    if (edition?.page_count) { totalPages+=Number(edition.page_count); if(copy.reading_status==='read') readPages+=Number(edition.page_count) }
    if (copy.location_id) locatedBooks+=1
    const work=edition ? workById.get(edition.work_id) as any : null
    const genres=Array.isArray(work?.genres) && work.genres.length ? work.genres : (work?.primary_genre ? [work.primary_genre] : [])
    if (genres.length) classifiedBooks+=1
    const main=work?.primary_genre || genres[0]
    if (main) { genreCounts[main]=(genreCounts[main]??0)+1; if(copy.reading_status==='read') genreReadCounts[main]=(genreReadCounts[main]??0)+1 }
  }
  return {
    counts, totalValue, totalSpent, valuedBooks:latest.size, purchasedBooks:purchaseItemIds.length,
    genreCounts, genreReadCounts, classifiedBooks, totalPages, readPages, locatedBooks,
  }
}
