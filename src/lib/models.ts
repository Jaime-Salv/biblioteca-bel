export type ReadingStatus = 'pending' | 'reading' | 'read' | 'abandoned' | 'rereading'

export type AppBook = {
  id: string
  editionId: string
  internalCode: string
  title: string
  subtitle?: string | null
  author: string
  isbn?: string | null
  publisher?: string | null
  year?: number | null
  pages?: number | null
  synopsis?: string | null
  coverUrl?: string | null
  status: ReadingStatus
  condition?: string | null
  location?: string | null
  locationId?: string | null
  badges: string[]
  purchasePrice?: number | null
  estimatedValue?: number | null
  addedAt: string
  needsReview: boolean
  primaryGenre?: string | null
  genres: string[]
}

export type LibraryLocation = {
  id: string
  name: string
  type: string
  parentId: string | null
  position: number | null
  bookCount: number
}
