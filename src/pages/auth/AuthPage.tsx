import { FormEvent, useState } from 'react'
import { BookOpen, Eye, EyeOff, LogIn, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Mode = 'login' | 'signup'

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
      } else {
        if (name.trim().length < 2) throw new Error('Escribe cómo quieres que te llamemos.')
        if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        })
        if (authError) throw authError
        if (!data.session) {
          setMessage('Cuenta creada. Revisa tu correo para confirmar la dirección y después inicia sesión.')
          setMode('login')
          setPassword('')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la operación.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div className="brand-mark"><BookOpen size={28}/></div>
        <span className="eyebrow">TU COLECCIÓN, A TU MANERA</span>
        <h1>Tu biblioteca física,<br/>por fin organizada.</h1>
        <p>Registra, localiza y disfruta tu colección de libros. Desde las estanterías hasta las ediciones que hacen cada ejemplar especial.</p>
        <div className="auth-pills"><span>📚 Inventario</span><span>✨ Coleccionismo</span><span>🗄️ Ubicación</span><span>🏆 Logros</span></div>
      </section>

      <section className="auth-card">
        <div className="auth-tabs">
          <button className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(null); setMessage(null) }}>Entrar</button>
          <button className={mode === 'signup' ? 'selected' : ''} onClick={() => { setMode('signup'); setError(null); setMessage(null) }}>Crear cuenta</button>
        </div>
        <div className="auth-heading">
          <h2>{mode === 'login' ? 'Qué alegría verte de nuevo' : 'Empieza tu colección'}</h2>
          <p>{mode === 'login' ? 'Entra para continuar donde lo dejaste.' : 'Crear la cuenta solo lleva un momento.'}</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && <label>Nombre<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" required /></label>}
          <label>Correo electrónico<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required /></label>
          <label>Contraseña<div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required /><button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
          {error && <div className="form-message error">{error}</div>}
          {message && <div className="form-message success">{message}</div>}
          <button className="auth-submit" disabled={loading}>{mode === 'login' ? <LogIn size={18}/> : <UserPlus size={18}/>} {loading ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear mi cuenta'}</button>
        </form>
      </section>
    </div>
  )
}
