import { supabase } from './supabase'
import { inferGenres, type ExternalBook } from './libraryApi'
import { addEditionToWishlist } from './collectionApi'

export async function addExternalBookToWishlist(libraryId: string, book: ExternalBook, priority = 2) {
  let editionId: string | null = null
  if (book.isbn13) {
    const { data } = await supabase.from('editions').select('id').eq('library_id', libraryId).eq('isbn_13', book.isbn13).maybeSingle()
    editionId = data?.id ?? null
  }
  if (!editionId && book.isbn10) {
    const { data } = await supabase.from('editions').select('id').eq('library_id', libraryId).eq('isbn_10', book.isbn10).maybeSingle()
    editionId = data?.id ?? null
  }

  if (!editionId) {
    const { data: existingWork } = await supabase.from('works').select('id').eq('library_id', libraryId).ilike('canonical_title', book.title).limit(1).maybeSingle()
    let workId = existingWork?.id as string | undefined
    if (!workId) {
      const genres = inferGenres(book.categories)
      const { data: work, error } = await supabase.from('works').insert({
        library_id: libraryId,
        canonical_title: book.title,
        subtitle: book.subtitle ?? null,
        description: book.description ?? null,
        primary_genre: genres[0] ?? null,
        genres,
      }).select('id').single()
      if (error) throw error
      workId = work.id
    }

    for (let index = 0; index < book.authors.length; index += 1) {
      const name = book.authors[index].trim()
      if (!name) continue
      const { data: existingAuthor } = await supabase.from('authors').select('id').eq('library_id', libraryId).ilike('name', name).limit(1).maybeSingle()
      let authorId = existingAuthor?.id as string | undefined
      if (!authorId) {
        const { data: author, error } = await supabase.from('authors').insert({ library_id: libraryId, name }).select('id').single()
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

  if (!editionId) throw new Error('No se pudo crear o recuperar la edición para la wishlist.')
  return addEditionToWishlist(libraryId, editionId, priority)
}
