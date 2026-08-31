import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, Check, ImagePlus, Save, Trash2, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getProfile, removeProfileAvatar, updateProfile, uploadProfileAvatar, type UserProfile } from '../lib/libraryApi'

export function ProfilePage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function load() {
    if (!user) return
    const data = await getProfile(user.id)
    setProfile(data)
    setName(data.displayName || (typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : ''))
    setBio(data.bio)
  }

  useEffect(() => { void load() }, [user?.id])

  const initials = useMemo(() => (name || user?.email || 'U').trim().slice(0, 2).toUpperCase(), [name, user?.email])

  async function save() {
    if (!user) return
    setSaving(true); setMessage(null)
    try {
      await updateProfile(user.id, { displayName: name, bio })
      await load()
      setMessage('✅ Perfil actualizado')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo guardar el perfil') }
    finally { setSaving(false) }
  }

  async function chooseAvatar(file?: File) {
    if (!user || !file) return
    setUploading(true); setMessage(null)
    try {
      await uploadProfileAvatar(user.id, file)
      await load()
      setMessage('✨ Nueva foto de perfil guardada')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo subir la foto') }
    finally { setUploading(false) }
  }

  async function removeAvatar() {
    if (!user) return
    setUploading(true); setMessage(null)
    try {
      await removeProfileAvatar(user.id, profile?.avatarPath ?? null)
      await load()
      setMessage('Foto eliminada')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo eliminar la foto') }
    finally { setUploading(false) }
  }

  return <div className="page profile-page">
    <div className="profile-page-top"><Link to="/more" className="back-chip"><ArrowLeft size={16}/> Volver</Link><span>👤 TU PERFIL</span></div>
    <section className="profile-hero-card">
      <div className="profile-photo-editor">
        <div className="profile-photo-xl">{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="Tu foto de perfil"/> : <span>{initials}</span>}</div>
        <button type="button" className="profile-camera-button" onClick={()=>inputRef.current?.click()} aria-label="Cambiar foto"><Camera size={18}/></button>
        <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void chooseAvatar(e.target.files?.[0])}/>
      </div>
      <div className="profile-hero-copy"><span>ASÍ TE VERÁS EN TU BIBLIOTECA</span><h1>{name || 'Tu nombre'}</h1><p>{bio || 'Añade unas palabras sobre qué lees, qué coleccionas o qué te hace disfrutar de los libros.'}</p></div>
    </section>

    <section className="profile-edit-card">
      <div className="profile-section-title"><UserRound size={20}/><div><h2>Tu identidad lectora</h2><p>Haz que la biblioteca se sienta realmente tuya.</p></div></div>
      <label className="profile-field"><span>✨ Nombre visible</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Cómo quieres aparecer" maxLength={80}/></label>
      <label className="profile-field"><span>💬 Sobre mí</span><textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="Ej.: Fantasía, clásicos y ediciones bonitas. Siempre buscando la siguiente joya." maxLength={280}/><small>{bio.length}/280</small></label>
      <div className="profile-photo-actions"><button className="secondary-button profile-action" onClick={()=>inputRef.current?.click()} disabled={uploading}><ImagePlus size={17}/>{uploading?'Subiendo…':'Cambiar foto'}</button>{profile?.avatarPath&&<button className="ghost-danger" onClick={()=>void removeAvatar()} disabled={uploading}><Trash2 size={16}/> Quitar foto</button>}</div>
    </section>

    {message&&<div className="profile-message">{message}</div>}
    <div className="profile-save-bar"><div><Check size={17}/><span>Los cambios se reflejarán en toda la app</span></div><button className="primary-button" onClick={()=>void save()} disabled={saving}><Save size={17}/>{saving?'Guardando…':'Guardar perfil'}</button></div>
  </div>
}
