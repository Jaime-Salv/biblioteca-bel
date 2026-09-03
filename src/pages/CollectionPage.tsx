import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, CircleAlert, Heart, LibraryBig, RotateCcw, Search, UserRoundCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { searchExternalBooks, type ExternalBook } from '../lib/libraryApi'
import {
  addExternalBookToWishlist,
  getAuthorGroups,
  getLibraryHealth,
  getLoans,
  getNeedsReviewBooks,
  getSeriesGroups,
  getWishlist,
  returnLoan,
  removeWishlistItem,
  markWishlistPurchased,
  type AuthorGroup,
  type LibraryHealth,
  type LoanItem,
  type SeriesGroup,
  type WishlistItem,
} from '../lib/collectionApi'
import type { AppBook } from '../lib/models'

type Tab = 'health' | 'review' | 'loans' | 'wishlist' | 'authors' | 'series'

export function CollectionPage() {
  const { activeLibrary } = useLibrary()
  const [tab, setTab] = useState<Tab>('health')
  const [health, setHealth] = useState<LibraryHealth | null>(null)
  const [reviewBooks, setReviewBooks] = useState<AppBook[]>([])
  const [loans, setLoans] = useState<LoanItem[]>([])
  const [wishlist, setWishlist] = useState<WishlistItem[]>([])
  const [authors, setAuthors] = useState<AuthorGroup[]>([])
  const [series, setSeries] = useState<SeriesGroup[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wishQuery, setWishQuery] = useState('')
  const [wishResults, setWishResults] = useState<ExternalBook[]>([])
  const [wishSearching, setWishSearching] = useState(false)
  const [wishAdding, setWishAdding] = useState<string | null>(null)
  const [wishMessage, setWishMessage] = useState<string | null>(null)

  async function load() {
    if (!activeLibrary) return
    setLoading(true); setError(null)
    try {
      const [h, r, l, w, a, s] = await Promise.all([
        getLibraryHealth(activeLibrary.id),
        getNeedsReviewBooks(activeLibrary.id),
        getLoans(activeLibrary.id),
        getWishlist(activeLibrary.id),
        getAuthorGroups(activeLibrary.id),
        getSeriesGroups(activeLibrary.id),
      ])
      setHealth(h); setReviewBooks(r); setLoans(l); setWishlist(w); setAuthors(a); setSeries(s)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar la colección.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [activeLibrary])
  useEffect(() => { setQuery('') }, [tab])

  const filteredReview = useMemo(() => reviewBooks.filter((b) => `${b.title} ${b.author} ${b.isbn ?? ''}`.toLowerCase().includes(query.toLowerCase())), [reviewBooks, query])
  const filteredAuthors = useMemo(() => authors.filter((a) => a.name.toLowerCase().includes(query.toLowerCase())), [authors, query])
  const filteredSeries = useMemo(() => series.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())), [series, query])
  const activeWishlist = wishlist.filter((w) => !w.purchasedAt)

  async function markReturned(id: string) {
    if (!activeLibrary) return
    try { await returnLoan(activeLibrary.id, id); await load() } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo marcar la devolución.') }
  }

  async function removeWish(id: string) {
    if (!activeLibrary) return
    try { await removeWishlistItem(activeLibrary.id, id); await load() } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo quitar de deseos.') }
  }

  async function boughtWish(id: string) {
    if (!activeLibrary) return
    try { await markWishlistPurchased(activeLibrary.id, id); await load() } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar la wishlist.') }
  }

  async function searchWishlist(e: FormEvent) {
    e.preventDefault()
    setWishMessage(null); setError(null)
    if (wishQuery.trim().length < 2) { setWishMessage('Escribe al menos dos caracteres para buscar.'); return }
    setWishSearching(true)
    try {
      const found = await searchExternalBooks(wishQuery)
      setWishResults(found)
      if (!found.length) setWishMessage('No encontramos coincidencias. Prueba con título, autor o ISBN.')
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo buscar.') }
    finally { setWishSearching(false) }
  }

  async function addWishResult(book: ExternalBook) {
    if (!activeLibrary) return
    const key = book.sourceId || book.isbn13 || book.isbn10 || book.title
    setWishAdding(key); setWishMessage(null); setError(null)
    try {
      await addExternalBookToWishlist(activeLibrary.id, book)
      setWishMessage(`💜 “${book.title}” añadido a tu wishlist.`)
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo añadir a deseos.') }
    finally { setWishAdding(null) }
  }

  return <div className="page collection-page">
    <Link to="/more" className="back-link"><ArrowLeft size={17}/> Más</Link>
    <p className="eyebrow">COLECCIÓN</p>
    <h1>Cuida tu biblioteca</h1>
    <p className="subtitle">La parte de colección: documentación, pendientes, préstamos, deseos, autores y sagas.</p>

    <div className="filter-strip collection-tabs">
      <button className={tab==='health'?'selected':''} onClick={()=>setTab('health')}>🩺 Estado</button>
      <button className={tab==='review'?'selected':''} onClick={()=>setTab('review')}>🟡 Por completar</button>
      <button className={tab==='loans'?'selected':''} onClick={()=>setTab('loans')}>🤝 Préstamos</button>
      <button className={tab==='wishlist'?'selected':''} onClick={()=>setTab('wishlist')}>💜 Deseos</button>
      <button className={tab==='authors'?'selected':''} onClick={()=>setTab('authors')}>✍️ Autores</button>
      <button className={tab==='series'?'selected':''} onClick={()=>setTab('series')}>📚 Sagas</button>
    </div>

    {error && <div className="form-message error">{error}</div>}
    {loading && <div className="state-card">Revisando la colección…</div>}

    {!loading && tab === 'health' && health && <>
      <section className="summary-card collection-health-summary">
        <div><strong>{health.total}</strong><span>libros</span></div>
        <div><strong>{health.needsReview}</strong><span>por completar</span></div>
        <div><strong>{health.activeLoans}</strong><span>prestados</span></div>
      </section>
      <div className="collector-cards-grid collection-health-grid">
        <HealthCard icon="📍" label="Sin ubicación" value={health.withoutLocation} action={()=>setTab('review')} />
        <HealthCard icon="🖼️" label="Sin portada" value={health.withoutCover} action={()=>setTab('review')} />
        <HealthCard icon="🧭" label="Sin género" value={health.withoutGenre} action={()=>setTab('review')} />
        <HealthCard icon="💸" label="Sin precio" value={health.withoutPrice} action={()=>setTab('review')} />
        <HealthCard icon="🤝" label="Préstamos activos" value={health.activeLoans} action={()=>setTab('loans')} />
        <HealthCard icon="💜" label="En wishlist" value={health.wishlist} action={()=>setTab('wishlist')} />
      </div>
      <div className="product-rule"><CircleAlert size={18}/><p><strong>Estado de la colección:</strong> desde aquí puedes localizar rápidamente qué ejemplares necesitan información o seguimiento.</p></div>
    </>}

    {!loading && tab === 'review' && <>
      <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Título, autor o ISBN"/></label>
      <div className="review-list">
        {filteredReview.map(book => <Link to={`/books/${book.id}`} className="search-book-row" key={book.id}>
          <div className="search-cover">{book.coverUrl ? <img src={book.coverUrl} alt=""/> : '📕'}</div>
          <div><strong>{book.title}</strong><span>{book.author}</span><small>{[book.needsReview?'Ficha por completar':'',!book.locationId?'Sin ubicación':'',!book.coverUrl?'Sin portada':'',!book.genres.length?'Sin género':''].filter(Boolean).join(' · ')}</small></div>
          <span>›</span>
        </Link>)}
        {!filteredReview.length && <div className="empty-library"><CheckCircle2/><h2>Todo al día</h2><p>No hay fichas pendientes con los criterios actuales.</p></div>}
      </div>
    </>}

    {!loading && tab === 'loans' && <div className="review-list">
      {loans.filter(l=>!l.returnedAt).map(loan => <article className="search-book-row" key={loan.id}>
        <div className="search-cover">{loan.book?.coverUrl?<img src={loan.book.coverUrl} alt=""/>:'📗'}</div>
        <div><strong>{loan.book?.title ?? 'Ejemplar'}</strong><span>Prestado a {loan.borrowerName}</span><small>{loan.loanDate}{loan.expectedReturnDate?` · devolver ${loan.expectedReturnDate}`:''}</small></div>
        <button className="soft-action" onClick={()=>void markReturned(loan.id)}><RotateCcw size={15}/> Devuelto</button>
      </article>)}
      {!loans.some(l=>!l.returnedAt) && <div className="empty-library"><UserRoundCheck/><h2>Ningún préstamo activo</h2><p>Los préstamos que registres desde una ficha aparecerán aquí.</p></div>}
    </div>}

    {!loading && tab === 'wishlist' && <>
      <section className="collection-search-shell">
        <div><div className="search-badge"><Heart size={20}/></div><div><h2>Buscar para mi wishlist</h2><p>Busca por título, autor o ISBN. Guardarlo aquí no lo añade a tu biblioteca como libro poseído.</p></div></div>
        <form className="wishlist-search-form" onSubmit={searchWishlist}>
          <label><Search size={18}/><input value={wishQuery} onChange={e=>setWishQuery(e.target.value)} placeholder="Ej. Rebecca Yarros, Alas de sangre, 978…"/></label>
          <button className="primary-button" disabled={wishSearching}>{wishSearching?'Buscando…':'Buscar'}</button>
        </form>
        {wishMessage && <div className="form-message success collection-message">{wishMessage}</div>}
        {!!wishResults.length && <div className="wishlist-search-results">
          {wishResults.map((book,index)=>{
            const key=book.sourceId||book.isbn13||book.isbn10||`${book.title}-${index}`
            const already=activeWishlist.some(item=>item.isbn && (item.isbn===book.isbn13||item.isbn===book.isbn10))
            return <article className="wishlist-search-result" key={key}>
              <div className="search-cover">{book.coverUrl?<img src={book.coverUrl} alt=""/>:'📚'}</div>
              <div><strong>{book.title}</strong><span>{book.authors.join(', ')||'Autor desconocido'}</span><small>{book.publisher||'Editorial sin indicar'}{book.publicationYear?` · ${book.publicationYear}`:''}</small></div>
              <button disabled={already||wishAdding===key} onClick={()=>void addWishResult(book)}>{already?'Ya está 💜':wishAdding===key?'Añadiendo…':'Lo quiero'}</button>
            </article>
          })}
        </div>}
      </section>
      <div className="wishlist-library-title"><h2>Mis deseos</h2><span>{activeWishlist.length} guardados</span></div>
      <div className="review-list">
        {activeWishlist.map(item => <article className="search-book-row" key={item.id}>
          <div className="search-cover">{item.coverUrl?<img src={item.coverUrl} alt=""/>:'💜'}</div>
          <div><strong>{item.title}</strong><span>{item.author || 'Autor por completar'}</span><small>{item.priceSeen!=null?`${item.priceSeen.toFixed(2)} € · `:''}Prioridad {item.priority ?? 2}</small></div>
          <div className="wishlist-actions"><button className="soft-action" onClick={()=>void boughtWish(item.id)}>Comprado</button><button className="icon-button" onClick={()=>void removeWish(item.id)} aria-label="Quitar de deseos">×</button></div>
        </article>)}
        {!activeWishlist.length && <div className="empty-library"><Heart/><h2>Wishlist vacía</h2><p>Busca arriba cualquier libro que te interese y guárdalo para más adelante.</p></div>}
      </div>
    </>}

    {!loading && tab === 'authors' && <>
      <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar autor"/></label>
      <div className="collector-cards-grid collection-author-grid">{filteredAuthors.map(author => <article className="collector-stat-card" key={author.name}><span>✍️ {author.name}</span><strong>{author.count}</strong><small>{author.books.slice(0,3).map(b=>b.title).join(' · ')}</small></article>)}</div>
    </>}

    {!loading && tab === 'series' && <>
      <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar saga"/></label>
      <div className="review-list">{filteredSeries.map(group => <article className="inline-panel" key={group.id}><strong>📚 {group.name}</strong><p>{group.count} libros registrados</p><div className="forgotten-list">{group.books.map(book=><Link key={book.id} to={`/books/${book.id}`}>{book.seriesNumber!=null?`${book.seriesNumber}. `:''}{book.title}</Link>)}</div></article>)}</div>
      {!filteredSeries.length && <div className="empty-library"><LibraryBig/><h2>Aún no hay sagas clasificadas</h2><p>Aparecerán aquí cuando las obras tengan una saga asignada.</p></div>}
    </>}
  </div>
}

function HealthCard({icon,label,value,action}:{icon:string;label:string;value:number;action:()=>void}) {
  return <button className="collector-stat-card collection-health-card" onClick={action}><span>{icon} {label}</span><strong>{value}</strong><small>{value===0?'Todo correcto':'Toca para revisar'}</small></button>
}
