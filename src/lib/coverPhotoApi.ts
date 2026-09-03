import { supabase } from './supabase'

export type BookPhotoType = 'cover' | 'back_cover' | 'signature' | 'dedication' | 'numbering' | 'condition' | 'detail' | 'other'
export type BookPhoto = { id: string; documentId: string; type: BookPhotoType; position: number; url: string; name: string | null }

export async function getCustomCoverUrls(copyIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!copyIds.length) return result

  const { data: links, error: linksError } = await supabase
    .from('book_copy_photos')
    .select('book_copy_id,document_id,created_at')
    .in('book_copy_id', copyIds)
    .eq('photo_type', 'cover')
    .order('created_at', { ascending: false })
  if (linksError) throw linksError
  if (!links?.length) return result

  const latestByCopy = new Map<string, string>()
  for (const link of links) if (!latestByCopy.has(link.book_copy_id)) latestByCopy.set(link.book_copy_id, link.document_id)

  const documentIds = [...new Set(latestByCopy.values())]
  const { data: documents, error: documentsError } = await supabase.from('documents').select('id,storage_path').in('id', documentIds)
  if (documentsError) throw documentsError
  const pathByDocument = new Map((documents ?? []).map((document) => [document.id, document.storage_path]))
  const paths = [...new Set([...latestByCopy.values()].map((id) => pathByDocument.get(id)).filter(Boolean))] as string[]
  if (!paths.length) return result

  const { data: signed, error: signedError } = await supabase.storage.from('book-photos').createSignedUrls(paths, 60 * 60)
  if (signedError) throw signedError
  const urlByPath = new Map((signed ?? []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl as string]))
  for (const [copyId, documentId] of latestByCopy) {
    const path = pathByDocument.get(documentId)
    const url = path ? urlByPath.get(path) : null
    if (url) result.set(copyId, url)
  }
  return result
}

export async function getCustomCoverUrl(copyId: string): Promise<string | null> {
  return (await getCustomCoverUrls([copyId])).get(copyId) ?? null
}

export async function getBookPhotos(copyId: string): Promise<BookPhoto[]> {
  const { data: links, error } = await supabase.from('book_copy_photos')
    .select('id,document_id,photo_type,position,created_at')
    .eq('book_copy_id', copyId).order('position').order('created_at')
  if (error) throw error
  if (!links?.length) return []
  const documentIds = links.map((x) => x.document_id)
  const { data: docs, error: docError } = await supabase.from('documents').select('id,storage_path,original_filename').in('id', documentIds)
  if (docError) throw docError
  const docMap = new Map((docs ?? []).map((d) => [d.id, d]))
  const paths = (docs ?? []).map((d) => d.storage_path)
  const { data: signed, error: signedError } = await supabase.storage.from('book-photos').createSignedUrls(paths, 60 * 60)
  if (signedError) throw signedError
  const urlMap = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
  return links.map((link) => {
    const doc = docMap.get(link.document_id)
    return {
      id: link.id,
      documentId: link.document_id,
      type: link.photo_type as BookPhotoType,
      position: link.position,
      url: doc ? (urlMap.get(doc.storage_path) ?? '') : '',
      name: doc?.original_filename ?? null,
    }
  }).filter((x) => x.url)
}

async function uploadPhoto(libraryId: string, copyId: string, file: File, photoType: BookPhotoType, position = 0) {
  if (!file.type.startsWith('image/')) throw new Error('Selecciona o haz una fotografía válida.')
  if (file.size > 12 * 1024 * 1024) throw new Error('La fotografía debe pesar menos de 12 MB.')
  const ext = (file.name.split('.').pop() || file.type.split('/')[1] || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const storagePath = `${libraryId}/books/${copyId}/${photoType}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`
  const { error: uploadError } = await supabase.storage.from('book-photos').upload(storagePath, file, { upsert: false, contentType: file.type || 'image/jpeg' })
  if (uploadError) throw uploadError

  const { data: document, error: documentError } = await supabase.from('documents').insert({
    library_id: libraryId,
    storage_path: storagePath,
    document_type: 'photo',
    original_filename: file.name || `${photoType}.${ext}`,
    mime_type: file.type || 'image/jpeg',
    notes: `Foto del ejemplar: ${photoType}`,
  }).select('id').single()
  if (documentError) { await supabase.storage.from('book-photos').remove([storagePath]); throw documentError }

  const { data: link, error: linkError } = await supabase.from('book_copy_photos').insert({
    book_copy_id: copyId,
    document_id: document.id,
    photo_type: photoType,
    position,
  }).select('id').single()
  if (linkError) {
    await supabase.from('documents').delete().eq('id', document.id)
    await supabase.storage.from('book-photos').remove([storagePath])
    throw linkError
  }
  return { linkId: link.id, documentId: document.id, storagePath }
}

export async function uploadBookPhoto(libraryId: string, copyId: string, file: File, photoType: BookPhotoType) {
  const result = await uploadPhoto(libraryId, copyId, file, photoType, Date.now())
  const { data: signed, error } = await supabase.storage.from('book-photos').createSignedUrl(result.storagePath, 60 * 60)
  if (error) throw error
  return signed.signedUrl
}

export async function uploadBookCoverPhoto(libraryId: string, copyId: string, file: File) {
  const result = await uploadPhoto(libraryId, copyId, file, 'cover', 0)
  const { data: oldLinks } = await supabase.from('book_copy_photos').select('id,document_id').eq('book_copy_id', copyId).eq('photo_type', 'cover').neq('document_id', result.documentId)
  if (oldLinks?.length) {
    const oldDocumentIds = oldLinks.map((link) => link.document_id)
    const { data: oldDocuments } = await supabase.from('documents').select('id,storage_path').in('id', oldDocumentIds)
    const oldPaths = (oldDocuments ?? []).map((item) => item.storage_path).filter(Boolean)
    if (oldPaths.length) await supabase.storage.from('book-photos').remove(oldPaths)
    await supabase.from('book_copy_photos').delete().in('id', oldLinks.map((link) => link.id))
    await supabase.from('documents').delete().in('id', oldDocumentIds)
  }
  const { data: signed, error: signedError } = await supabase.storage.from('book-photos').createSignedUrl(result.storagePath, 60 * 60)
  if (signedError) throw signedError
  return signed.signedUrl
}

export async function deleteBookPhoto(photo: BookPhoto) {
  const { data: doc, error: docError } = await supabase.from('documents').select('storage_path').eq('id', photo.documentId).single()
  if (docError) throw docError
  const { error: storageError } = await supabase.storage.from('book-photos').remove([doc.storage_path])
  if (storageError) throw storageError
  const { error: linkError } = await supabase.from('book_copy_photos').delete().eq('id', photo.id)
  if (linkError) throw linkError
  const { error: documentError } = await supabase.from('documents').delete().eq('id', photo.documentId)
  if (documentError) throw documentError
}
