import { BookOpen, LibraryBig, MoreHorizontal, ScanLine, Sparkles } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const items = [
  { to: '/library', label: 'Biblioteca', icon: LibraryBig },
  { to: '/shelves', label: 'Estanterías', icon: BookOpen },
  { to: '/scan', label: 'Escanear', icon: ScanLine, primary: true },
  { to: '/stats', label: 'Descubre', icon: Sparkles },
  { to: '/more', label: 'Más', icon: MoreHorizontal },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {items.map(({ to, label, icon: Icon, primary }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${primary ? 'primary' : ''}`}
        >
          <span className="nav-icon"><Icon size={primary ? 25 : 21} strokeWidth={1.9} /></span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
