import { MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AppBook } from '../lib/models'

const readingLabels = {
  pending: '⏳ Pendiente', reading: '📖 Leyendo', read: '✅ Leído', abandoned: '🫸 Abandonado', rereading: '🔁 Relectura'
} as const

export function BookCard({ book }: { book: AppBook }) {
  return <Link to={`/books/${book.id}`} className="book-card" aria-label={`Abrir ${book.title}`}>
    <div className="cover-wrap">
      {book.coverUrl ? <img src={book.coverUrl} alt={`Portada de ${book.title}`} className="book-cover" /> : <div className="cover-fallback"><strong>{book.title}</strong><span>{book.author}</span></div>}
      <span className={`reading-pill ${book.status}`}>{readingLabels[book.status]}</span>
    </div>
    <div className="book-info">
      <h3>{book.title}</h3><p className="author">{book.author}</p>
      {book.badges.length ? <div className="badge-row">{book.badges.slice(0,2).map((badge)=><span key={badge}>{badge}</span>)}</div> : null}
      {book.location ? <p className="location"><MapPin size={13}/> {book.location}</p> : null}
    </div>
  </Link>
}
