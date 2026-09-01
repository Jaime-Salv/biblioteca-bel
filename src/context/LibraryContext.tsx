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
  const { user, loading: authLoading } = useAuth()
  const [libraries, setLibraries] = useState<UserLibrary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loadingLibraries, setLoadingLibraries] = useState(true)
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (authLoading) return

    if (!user) {
      setLibraries([])
      setActiveId(null)
      setLoadedForUserId(null)
      setLoadingLibraries(false)
      setError(null)
      return
    }

    setLoadingLibraries(true)
    setError(null)
    try {
      const data = await getMyLibraries(user.id)
      setLibraries(data)
      setActiveId((current) => {
        if (current && data.some((library) => library.id === current)) return current

        const savedId = window.localStorage.getItem(`biblioteca-bel:active-library:${user.id}`)
        if (savedId && data.some((library) => library.id === savedId)) return savedId

        return data[0]?.id ?? null
      })
      setLoadedForUserId(user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las bibliotecas.')
      setLoadedForUserId(user.id)
    } finally {
      setLoadingLibraries(false)
    }
  }, [authLoading, user])

  useEffect(() => { void refresh() }, [refresh])

  const activeLibrary = libraries.find((library) => library.id === activeId) ?? null
  const loading = authLoading || loadingLibraries || (!!user && loadedForUserId !== user.id)

  const setActiveLibraryId = useCallback((id: string) => {
    setActiveId(id)
    if (user) window.localStorage.setItem(`biblioteca-bel:active-library:${user.id}`, id)
  }, [user])

  useEffect(() => {
    if (user && activeLibrary) {
      window.localStorage.setItem(`biblioteca-bel:active-library:${user.id}`, activeLibrary.id)
    }
  }, [user, activeLibrary])

  const value = useMemo(() => ({ libraries, activeLibrary, loading, error, refresh, setActiveLibraryId }), [libraries, activeLibrary, loading, error, refresh, setActiveLibraryId])

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const value = useContext(LibraryContext)
  if (!value) throw new Error('useLibrary debe usarse dentro de LibraryProvider')
  return value
}
