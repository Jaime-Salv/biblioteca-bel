import { supabase } from './supabase'
import { getLibraryBooks, inferGenres, type ExternalBook } from './libraryApi'
import type { AppBook } from './models'

export type LibraryHealth = {
  total: number
  needsReview: number
  withoutLocation: number
  withoutCover: number
  withoutGenre: number
  withoutPrice: number
  activeLoans: number
  wishlist: number
}

export type LoanItem = {
  id: string
  bookCopyId: string
  borrowerName: string
  loanDate: string
  expectedReturnDate: string | null
  returnedAt: string | null
  notes: string | null
  book: AppBook | null
}

export type WishlistItem = {
  id: string
  editionId: string | null
  priority: number | null
  priceSeen: number | null
  notes: string | null
  createdAt: string
  purchasedAt: string | null
  title: string
  author: string
  coverUrl: string | null
  isbn: string | null
}

export type AuthorGroup = { name: string; count: number; books: AppBook[] }
export type SeriesGroup = { id: string; name: string; count: number; books: Array<AppBook & { seriesNumber?: number | null }> }

export async function getLibraryHealth(libraryId: string): Promise<LibraryHealth> {
  const books = await getLibraryBooks(libraryId)
  const [{ count: loans }, { count: wishlist }] = await Promise.all([
    supabase.from('loans').select('id', { count: 'exact', head: true }).eq('library_id', libraryId).is('returned_at', null),
    supabase.from('wishlist_items').select('id', { count: 'exact', head: true }).eq('library_id', libraryId).is('purchased_at', null),
  ])
  return {
    total: books.length,
    needsReview: books.filter((b) => b.needsReview).length,
    withoutLocation: books.filter((b) => !b.locationId).length,
    withoutCover: books.filter((b) => !b.coverUrl).length,
    withoutGenre: books.filter((b) => !b.genres.length).length,
    withoutPrice: books.filter((b) => b.purchasePrice == null).length,
    activeLoans: loans ?? 0,
    wishlist: wishlist ?? 0,
  }
}

export async function getNeedsReviewBooks(libraryId: string) {
  const books = await getLibraryBooks(libraryId)
  return books.filter((book) => book.needsReview || !book.locationId || !book.coverUrl || !book.genres.length)
}

export async function getLoans(libraryId: string): Promise<LoanItem[]> {
  const [books, loansRes] = await Promise.all([
    getLibraryBooks(libraryId),
    supabase.from('loans').select('*').eq('library_id', libraryId).order('loan_date', { ascending: false }),
  ])
  if (loansRes.error) throw loansRes.error
  const bookMap = new Map(books.map((b) => [b.id, b]))
  return (loansRes.data ?? []).map((row) => ({
    id: row.id,
    bookCopyId: row.book_copy_id,
    borrowerName: row.borrower_name,
    loanDate: row.loan_date,
    expectedReturnDate: row.expected_return_date,
    returnedAt: row.returned_at,
    notes: row.notes,
    book: bookMap.get(row.book_copy_id) ?? null,
  }))
}

export async function createLoan(libraryId: string, bookCopyId: string, borrowerName: string, expectedReturnDate?: string | null, notes?: string | null) {
  const name = borrowerName.trim()
  if (!name) throw new Error('Indica a quién prestas el libro.')
  const { error } = await supabase.from('loans').insert({
    library_id: libraryId,
    book_copy_id: bookCopyId,
    borrower_name: name,
    loan_date: new Date().toISOString().slice(0, 10),
    expected_return_date: expectedReturnDate || null,
    notes: notes?.trim() || null,
  })
  if (error) throw error
}

export async function returnLoan(libraryId: string, loanId: string) {
  const { error } = await supabase.from('loans').update({ returned_at: new Date().toISOString() }).eq('library_id', libraryId).eq('id', loanId)
  if (error) throw error
}

export async function getWishlist(libraryId: string): Promise<WishlistItem[]> {
  const { data: items, error } = await supabase.from('wishlist_items').select('*').eq('library_id', libraryId).order('created_at', { ascending: false })
  if (error) throw error
  const editionIds = [...new Set((items ?? []).map((x) => x.edition_id).filter(Boolean))] as string[]
  if (!editionIds.length) return (items ?? []).map((row) => ({ id: row.id, editionId: null, priority: row.priority, priceSeen: row.price_seen == null ? null : Number(row.price_seen), notes: row.notes, createdAt: row.created_at, purchasedAt: row.purchased_at, title: 'Libro pendiente', author: '', coverUrl: null, isbn: null }))

  const { data: editions, error: edError } = await supabase.from('editions').select('id,work_id,isbn_13,isbn_10,cover_url').eq('library_id', libraryId).in('id', editionIds)
  if (edError) throw edError
  const workIds = [...new Set((editions ?? []).map((e) => e.work_id))]
  const { data: works, error: workError } = await supabase.from('works').select('id,canonical_title').eq('library_id', libraryId).in('id', workIds)
  if (workError) throw workError
  const { data: links, error: linkError } = await supabase.from('work_authors').select('work_id,author_id,position').in('work_id', workIds).order('position')
  if (linkError) throw linkError
  const authorIds = [...new Set((links ?? []).map((x) => x.author_id))]
  const { data: authors, error: authorError } = authorIds.length ? await supabase.from('authors').select('id,name').eq('library_id', libraryId).in('id', authorIds) : { data: [], error: null }
  if (authorError) throw authorError
  const workById = new Map((works ?? []).map((w) => [w.id, w.canonical_title]))
  const authorById = new Map((authors ?? []).map((a) => [a.id, a.name]))
  const authorsByWork = new Map<string, string[]>()
  for (const link of links ?? []) {
    const list = authorsByWork.get(link.work_id) ?? []
    const name = authorById.get(link.author_id)
    if (name) list.push(name)
    authorsByWork.set(link.work_id, list)
  }
  const editionById = new Map((editions ?? []).map((e) => [e.id, e]))
  return (items ?? []).map((row) => {
    const ed = row.edition_id ? editionById.get(row.edition_id) : null
    return {
      id: row.id,
      editionId: row.edition_id,
      priority: row.priority,
      priceSeen: row.price_seen == null ? null : Number(row.price_seen),
      notes: row.notes,
      createdAt: row.created_at,
      purchasedAt: row.purchased_at,
      title: ed ? workById.get(ed.work_id) ?? 'Libro' : 'Libro pendiente',
      author: ed ? (authorsByWork.get(ed.work_id) ?? []).join(', ') : '',
      coverUrl: ed?.cover_url ?? null,
      isbn: ed?.isbn_13 ?? ed?.isbn_10 ?? null,
    }
  })
}

export async function addEditionToWishlist(libraryId: string, editionId: string, priority = 2, priceSeen?: number | null, notes?: string | null) {
  const { data: existing } = await supabase.from('wishlist_items').select('id').eq('library_id', libraryId).eq('edition_id', editionId).is('purchased_at', null).maybeSingle()
  if (existing) return existing
  const { data, error } = await supabase.from('wishlist_items').insert({ library_id: libraryId, edition_id: editionId, priority, price_seen: priceSeen ?? null, notes: notes?.trim() || null }).select('id').single()
  if (error) throw error
  return data
}

export async function addExternalBookToWishlist(libraryId: string, book: ExternalBook, priority = 2) {
  let editionId: string | null = null
  if (book.isbn13) {
    const { data, error } = await supabase.from('editions').select('id').eq('library_id', libraryId).eq('isbn_13', book.isbn13).maybeSingle()
    if (error) throw error
    editionId = data?.id ?? null
  }
  if (!editionId && book.isbn10) {
    const { data, error } = await supabase.from('editions').select('id').eq('library_id', libraryId).eq('isbn_10', book.isbn10).maybeSingle()
    if (error) throw error
    editionId = data?.id ?? null
  }

  if (!editionId) {
    const { data: existingWork, error: workLookupError } = await supabase.from('works').select('id').eq('library_id', libraryId).ilike('canonical_title', book.title).limit(1).maybeSingle()
    if (workLookupError) throw workLookupError
    let workId = existingWork?.id as string | undefined
    const inferredGenres = inferGenres(book.categories)
    if (!workId) {
      const { data: work, error } = await supabase.from('works').insert({
        library_id: libraryId,
        canonical_title: book.title,
        subtitle: book.subtitle ?? null,
        description: book.description ?? null,
        primary_genre: inferredGenres[0] ?? null,
        genres: inferredGenres,
      }).select('id').single()
      if (error) throw error
      workId = work.id
    }

    for (let index = 0; index < book.authors.length; index += 1) {
      const authorName = book.authors[index].trim()
      if (!authorName) continue
      const { data: existingAuthor, error: authorLookupError } = await supabase.from('authors').select('id').eq('library_id', libraryId).ilike('name', authorName).limit(1).maybeSingle()
      if (authorLookupError) throw authorLookupError
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
      external_source_id: book.sourceId || null,
      metadata_json: book.raw as any,
    }).select('id').single()
    if (editionError) throw editionError
    editionId = edition.id
  }

  return addEditionToWishlist(libraryId, editionId, priority)
}

export async function removeWishlistItem(libraryId: string, id: string) {
  const { error } = await supabase.from('wishlist_items').delete().eq('library_id', libraryId).eq('id', id)
  if (error) throw error
}

export async function markWishlistPurchased(libraryId: string, id: string) {
  const { error } = await supabase.from('wishlist_items').update({ purchased_at: new Date().toISOString() }).eq('library_id', libraryId).eq('id', id)
  if (error) throw error
}

export async function getAuthorGroups(libraryId: string): Promise<AuthorGroup[]> {
  const books = await getLibraryBooks(libraryId)
  const groups = new Map<string, AppBook[]>()
  for (const book of books) {
    const names = book.author === 'Autor desconocido' ? ['Autor desconocido'] : book.author.split(',').map((x) => x.trim()).filter(Boolean)
    for (const name of names) groups.set(name, [...(groups.get(name) ?? []), book])
  }
  return [...groups.entries()].map(([name, list]) => ({ name, count: list.length, books: list })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export async function getSeriesGroups(libraryId: string): Promise<SeriesGroup[]> {
  const books = await getLibraryBooks(libraryId)
  const { data: editions, error } = await supabase.from('editions').select('id,work_id').eq('library_id', libraryId)
  if (error) throw error
  const workIds = [...new Set((editions ?? []).map((e) => e.work_id))]
  if (!workIds.length) return []
  const { data: works, error: workError } = await supabase.from('works').select('id,series_id,series_number').eq('library_id', libraryId).in('id', workIds).not('series_id', 'is', null)
  if (workError) throw workError
  const seriesIds = [...new Set((works ?? []).map((w) => w.series_id).filter(Boolean))] as string[]
  if (!seriesIds.length) return []
  const { data: series, error: seriesError } = await supabase.from('series').select('id,name').eq('library_id', libraryId).in('id', seriesIds)
  if (seriesError) throw seriesError
  const editionWork = new Map((editions ?? []).map((e) => [e.id, e.work_id]))
  const workInfo = new Map((works ?? []).map((w) => [w.id, w]))
  const seriesName = new Map((series ?? []).map((s) => [s.id, s.name]))
  const groups = new Map<string, Array<AppBook & { seriesNumber?: number | null }>>()
  for (const book of books) {
    const workId = editionWork.get(book.editionId)
    const info = workId ? workInfo.get(workId) : null
    if (!info?.series_id) continue
    const list = groups.get(info.series_id) ?? []
    list.push({ ...book, seriesNumber: info.series_number == null ? null : Number(info.series_number) })
    groups.set(info.series_id, list)
  }
  return [...groups.entries()].map(([id, list]) => ({ id, name: seriesName.get(id) ?? 'Saga', count: list.length, books: list.sort((a, b) => (a.seriesNumber ?? 9999) - (b.seriesNumber ?? 9999)) })).sort((a, b) => b.count - a.count)
}

export async function addReadingEvent(libraryId: string, bookCopyId: string, eventType: 'started'|'finished'|'abandoned'|'restarted', rating?: number | null, notes?: string | null) {
  const cleanRating = rating == null ? null : Math.max(1, Math.min(5, Math.round(rating)))
  const { error } = await supabase.from('reading_events').insert({ library_id: libraryId, book_copy_id: bookCopyId, event_type: eventType, event_date: new Date().toISOString().slice(0, 10), rating: cleanRating, notes: notes?.trim() || null })
  if (error) throw error
}
