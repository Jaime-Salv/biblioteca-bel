import { useEffect, useState } from 'react'
import { DatabaseBackup, Download, FileSpreadsheet, LogOut, Save, Settings, UserRound, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLibrary } from '../context/LibraryContext'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { getLibraryBooks, updateLibrarySettings } from '../lib/libraryApi'

type Panel = 'members' | 'settings' | null

function downloadFile(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function MorePage() {
  const [panel, setPanel] = useState<Panel>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const { signOut, user } = useAuth()
  const { activeLibrary, refresh } = useLibrary()
  const [name, setName] = useState(activeLibrary?.name ?? '')
  const [currency, setCurrency] = useState(activeLibrary?.currency ?? 'EUR')

  useEffect(() => {
    setName(activeLibrary?.name ?? '')
    setCurrency(activeLibrary?.currency ?? 'EUR')
  }, [activeLibrary])

  async function exportCsv() {
    if (!activeLibrary) return
    setBusy('csv'); setMessage(null)
    try {
      const books = await getLibraryBooks(activeLibrary.id)
      const headers = ['Código','Título','Autor','ISBN','Editorial','Año','Páginas','Estado','Ubicación','Género principal','Géneros','Precio pagado','Valor estimado','Características','Añadido']
      const rows = books.map((b) => [b.internalCode,b.title,b.author,b.isbn,b.publisher,b.year,b.pages,b.status,b.location,b.primaryGenre,b.genres.join(' | '),b.purchasePrice,b.estimatedValue,b.badges.join(' | '),b.addedAt])
      const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')
      downloadFile(`${activeLibrary.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-coleccion.csv`, csv, 'text/csv;charset=utf-8')
      setMessage(`CSV creado con ${books.length} libros.`)
    } catch (err) { setMessage(err instanceof Error ? err.message : 'No se pudo exportar la colección.') }
    finally { setBusy(null) }
  }

  async function backup() {
    if (!activeLibrary) return
    setBusy('backup'); setMessage(null)
    try {
      const books = await getLibraryBooks(activeLibrary.id)
      downloadFile(`${activeLibrary.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-copia.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), library: activeLibrary, books }, null, 2), 'application/json')
      setMessage(`Copia de datos creada con ${books.length} libros. Los archivos privados permanecen protegidos en Supabase.`)
    } catch (err) { setMessage(err instanceof Error ? err.message : 'No se pudo crear la copia.') }
    finally { setBusy(null) }
  }

  async function saveSettings() {
    if (!activeLibrary) return
    setBusy('settings'); setMessage(null)
    try {
      await updateLibrarySettings(activeLibrary.id, { name, currency })
      await refresh()
      setMessage('Configuración guardada.')
    } catch (err) { setMessage(err instanceof Error ? err.message : 'No se pudo guardar la configuración.') }
    finally { setBusy(null) }
  }

  return <div className="page"><p className="eyebrow">AJUSTES</p><h1>Más</h1><p className="subtitle">Gestiona tu cuenta y tu colección.</p>
    <Link to="/profile" className="account-card profile-account-link"><ProfileAvatar userId={user?.id} fallback={user?.email}/><div><strong>Mi perfil</strong><span>{user?.email}</span></div><UserRound size={19}/></Link>
    <div className="settings-list">
      <button onClick={()=>setPanel(panel==='members'?null:'members')}><Users size={20}/><span>Cuenta y acceso</span><span>›</span></button>
      <button onClick={()=>void exportCsv()} disabled={!!busy}><FileSpreadsheet size={20}/><span>{busy==='csv'?'Preparando CSV…':'Exportar colección a CSV'}</span><Download size={16}/></button>
      <button onClick={()=>void backup()} disabled={!!busy}><DatabaseBackup size={20}/><span>{busy==='backup'?'Creando copia…':'Copia de seguridad de datos'}</span><Download size={16}/></button>
      <button onClick={()=>setPanel(panel==='settings'?null:'settings')}><Settings size={20}/><span>Configuración</span><span>›</span></button>
    </div>
    {panel==='members'&&<div className="inline-panel settings-panel"><strong>Cuenta con acceso</strong><p>{user?.email}</p><small>Eres propietario de esta colección. La colaboración con invitaciones requiere activar el flujo de correo transaccional antes de abrirlo a terceros.</small></div>}
    {panel==='settings'&&<div className="inline-panel settings-panel settings-form"><strong>Configuración de la colección</strong><label>Nombre<input value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></label><label>Moneda<select value={currency} onChange={e=>setCurrency(e.target.value)}><option value="EUR">EUR · Euro</option><option value="USD">USD · Dólar</option><option value="GBP">GBP · Libra</option></select></label><button className="primary-button" onClick={()=>void saveSettings()} disabled={busy==='settings'}><Save size={16}/>{busy==='settings'?'Guardando…':'Guardar ajustes'}</button></div>}
    {message&&<div className="form-message success">{message}</div>}
    <button className="logout-button" onClick={()=>void signOut()}><LogOut size={18}/> Cerrar sesión</button>
  </div>
}
