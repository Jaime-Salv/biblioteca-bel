import { useEffect, useState } from 'react'
import { getProfile, type UserProfile } from '../lib/libraryApi'

export function ProfileAvatar({ userId, fallback, size = 44 }: { userId?: string; fallback?: string; size?: number }) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  useEffect(() => {
    if (!userId) return
    let active = true
    getProfile(userId).then((p) => active && setProfile(p)).catch(() => {})
    return () => { active = false }
  }, [userId])

  const initials = (profile?.displayName || fallback || '👤').trim().slice(0, 2).toUpperCase()
  return (
    <span className="profile-avatar" style={{ width: size, height: size }} aria-label="Foto de perfil">
      {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="Foto de perfil" /> : <span>{initials}</span>}
    </span>
  )
}
