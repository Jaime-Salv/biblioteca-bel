import { FormEvent, useState } from 'react'
import { ArrowRight, BookOpen, LibraryBig, ShieldCheck, Sparkles } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLibrary } from '../../context/LibraryContext'
import { createLibrary, ensureProfile } from '../../lib/libraryApi'

export function OnboardingPage() {
  const { user } = useAuth()
  const { refresh } = useLibrary()
  const defaultName = user?.user_metadata?.display_name ? `Biblioteca de ${user.user_metadata.display_name}` : 'Mi Biblioteca'
  const [name, setName] = useState(defaultName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      await ensureProfile(user.id, typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : undefined)
      await createLibrary(user.id, name)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la biblioteca.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="onboarding-page">
    <section className="onboarding-card">
      <div className="onboarding-icon"><LibraryBig size={30}/></div>
      <p className="eyebrow">PRIMER PASO</p>
      <h1>Crea tu biblioteca</h1>
      <p className="subtitle">Será el espacio privado donde guardarás tus libros, estanterías, compras, tickets y progresos.</p>
      <form onSubmit={submit} className="onboarding-form">
        <label>Nombre de la colección<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Mi Biblioteca" autoFocus /></label>
        {error && <div className="form-message error">{error}</div>}
        <button className="auth-submit" disabled={loading}><BookOpen size={18}/>{loading ? 'Creando…' : 'Crear biblioteca'}<ArrowRight size={17}/></button>
      </form>
      <div className="onboarding-benefits">
        <span><ShieldCheck size={17}/> Privada por defecto</span>
        <span><Sparkles size={17}/> Totalmente personalizable</span>
      </div>
    </section>
  </div>
}
