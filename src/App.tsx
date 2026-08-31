import { Navigate, Route, Routes } from 'react-router-dom'
import { LibraryPage } from './pages/LibraryPage'
import { ShelvesPage } from './pages/ShelvesPage'
import { ScannerPage } from './pages/ScannerPage'
import { StatsPage } from './pages/StatsPage'
import { MorePage } from './pages/MorePage'
import { ProfilePage } from './pages/ProfilePage'
import { BookDetailPage } from './pages/BookDetailPage'
import { BottomNav } from './components/BottomNav'
import { useAuth } from './context/AuthContext'
import { useLibrary } from './context/LibraryContext'
import { AuthPage } from './pages/auth/AuthPage'
import { OnboardingPage } from './pages/auth/OnboardingPage'
import { LoadingScreen } from './components/LoadingScreen'

export default function App() {
  const { user, loading: authLoading } = useAuth()
  const { activeLibrary, loading: libraryLoading } = useLibrary()

  if (authLoading) return <LoadingScreen />
  if (!user) return <AuthPage />
  if (libraryLoading) return <LoadingScreen />
  if (!activeLibrary) return <OnboardingPage />

  return (
    <div className="app-shell">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/books/:id" element={<BookDetailPage />} />
          <Route path="/shelves" element={<ShelvesPage />} />
          <Route path="/scan" element={<ScannerPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
