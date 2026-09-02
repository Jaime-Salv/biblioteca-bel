import { supabase } from './supabase'

export type IsbnOwnership = {
  isbn: string
  count: number
  title: string | null
  copies: Array<{ id: string; internalCode: string; locationId: string | null }>
}

function cleanIsbn(value: string) {
  return value.replace(/[^0-9Xx]/g, '').toUpperCase()
}

export async function getIsbnOwnership(libraryId: string, isbnInput: string): Promise<IsbnOwnership> {
  const isbn = cleanIsbn(isbnInput)
  if (isbn.length !== 10 && isbn.length !== 13) return { isbn, count: 0, title: null, copies: [] }

  const column = isbn.length === 13 ? 'isbn_13' : 'isbn_10'
  const { data: editions, error: editionError } = await supabase
    .from('editions')
    .select('id,work_id')
    .eq('library_id', libraryId)
    .eq(column, isbn)
  if (editionError) throw editionError
  if (!editions?.length) return { isbn, count: 0, title: null, copies: [] }

  const editionIds = editions.map((edition) => edition.id)
  const { data: copies, error: copiesError } = await supabase
    .from('book_copies')
    .select('id,internal_code,location_id')
    .eq('library_id', libraryId)
    .in('edition_id', editionIds)
    .eq('inventory_status', 'active')
    .order('created_at', { ascending: true })
  if (copiesError) throw copiesError

  const firstWorkId = editions[0]?.work_id
  let title: string | null = null
  if (firstWorkId) {
    const { data: work } = await supabase
      .from('works')
      .select('canonical_title')
      .eq('library_id', libraryId)
      .eq('id', firstWorkId)
      .maybeSingle()
    title = work?.canonical_title ?? null
  }

  const normalizedCopies = (copies ?? []).map((copy) => ({
    id: copy.id,
    internalCode: copy.internal_code,
    locationId: copy.location_id,
  }))

  return { isbn, count: normalizedCopies.length, title, copies: normalizedCopies }
}
