import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMyLibraries, type UserLibrary } from '../lib/libraryApi'
import { useAuth } from './AuthContext'

type LibraryContextValue = {
  libraries: UserLibrary[]
  activeLibrary: UserLibrary | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  setActiveLibraryId: (id: string) => void
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [libraries, setLibraries] = useState<UserLibrary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setLibraries([])
      setActiveId(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await getMyLibraries(user.id)
      setLibraries(data)
      setActiveId((current) => current && data.some((l) => l.id === current) ? current : (data[0]?.id ?? null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las bibliotecas.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { void refresh() }, [refresh])

  const activeLibrary = libraries.find((l) => l.id === activeId) ?? null
  const value = useMemo(() => ({ libraries, activeLibrary, loading, error, refresh, setActiveLibraryId: setActiveId }), [libraries, activeLibrary, loading, error, refresh])

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const value = useContext(LibraryContext)
  if (!value) throw new Error('useLibrary debe usarse dentro de LibraryProvider')
  return value
}
