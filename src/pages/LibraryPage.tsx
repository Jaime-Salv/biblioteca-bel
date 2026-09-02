import { useEffect, useMemo, useState } from 'react'
import { Filter, Search, Shuffle, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { BookCard } from '../components/BookCard'
import { useLibrary } from '../context/LibraryContext'
import { getLibraryBooks } from '../lib/libraryApi'
import { getCustomCoverUrls } from '../lib/coverPhotoApi'
import type { AppBook } from '../lib/models'

const filters = [
  ['all','📚 Todos'],['pending','⏳ Pendientes'],['reading','📖 Leyendo'],['read','✅ Leídos'],['special','✨ Especiales']
] as const

export function LibraryPage(){
 const {activeLibrary}=useLibrary(); const {user}=useAuth(); const [books,setBooks]=useState<AppBook[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null); const [query,setQuery]=useState(''); const [filter,setFilter]=useState('all'); const [surprise,setSurprise]=useState<AppBook|null>(null); const [advanced,setAdvanced]=useState(false)
 useEffect(()=>{let active=true;setLoading(true);setError(null);getLibraryBooks(activeLibrary!.id).then(async d=>{try{const custom=await getCustomCoverUrls(d.map(b=>b.id));return d.map(book=>custom.has(book.id)?{...book,coverUrl:custom.get(book.id)}:book)}catch{return d}}).then(d=>{if(active)setBooks(d)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[activeLibrary])
 const visible=useMemo(()=>books.filter(b=>{const text=`${b.title} ${b.author} ${b.isbn??''} ${b.publisher??''} ${b.location??''} ${b.badges.join(' ')}`.toLowerCase(); const q=text.includes(query.toLowerCase()); const f=filter==='all'||filter==='special'&&b.badges.length>0||b.status===filter; return q&&f}),[books,query,filter])
 const read=books.filter(b=>b.status==='read').length; const value=books.reduce((a,b)=>a+(b.estimatedValue??0),0); const reading=books.filter(b=>b.status==='reading'); const recent=books.slice(0,3); const forgotten=books.filter(b=>b.status==='pending').sort((a,b)=>a.addedAt.localeCompare(b.addedAt)).slice(0,2)
 function surpriseMe(){const pool=books.filter(b=>b.status==='pending'); const source=pool.length?pool:books; if(source.length)setSurprise(source[Math.floor(Math.random()*source.length)])}
 return <div className="page library-page"><header className="hero-header"><div><p className="eyebrow">MI COLECCIÓN</p><h1>{activeLibrary?.name}</h1><p className="subtitle">Tu colección, localizada y protegida.</p></div><Link to="/profile" className="avatar-link" aria-label="Abrir mi perfil"><ProfileAvatar userId={user?.id} fallback={user?.email}/></Link></header>
 <section className="summary-card"><div><strong>{books.length}</strong><span>libros</span></div><div><strong>{read}</strong><span>leídos</span></div><div><strong>{value.toLocaleString('es-ES',{style:'currency',currency:activeLibrary?.currency??'EUR',maximumFractionDigits:0})}</strong><span>valor registrado</span></div></section>
 {loading&&<div className="state-card">Cargando tu colección…</div>}{error&&<div className="form-message error">{error}</div>}
 {!loading&&!error&&books.length===0&&<section className="empty-library"><div>📚</div><h2>Tu biblioteca está esperando</h2><p>Empieza escaneando tu primer libro o creando tus estanterías.</p><a href="/scan" className="primary-button">Añadir primer libro</a></section>}
 {books.length>0&&<><button className="surprise-button" onClick={surpriseMe}><Shuffle size={18}/> 🎲 Sorpréndeme</button>{surprise&&<section className="surprise-card"><span>✨ Tu elección de hoy</span><strong>{surprise.title}</strong><p>{surprise.author}{surprise.pages?` · ${surprise.pages} páginas`:''}</p><button onClick={()=>setSurprise(null)}>Cerrar</button></section>}
 {reading.length>0&&<section className="library-feature-block"><div className="section-heading compact"><div><h2>📖 Sigue leyendo</h2><p>Lo que tienes entre manos ahora mismo</p></div></div><div className="horizontal-books">{reading.map(b=><BookCard key={b.id} book={b}/>)}</div></section>}
 {recent.length>0&&<section className="library-feature-block"><div className="section-heading compact"><div><h2>✨ Últimas adquisiciones</h2><p>Lo último que se ha unido a tu colección</p></div></div><div className="horizontal-books">{recent.map(b=><BookCard key={b.id} book={b}/>)}</div></section>}
 {forgotten.length>0&&<section className="forgotten-card"><div><span>⏳</span><strong>Llevan demasiado esperando</strong><p>Quizá hoy sea su día.</p></div><div className="forgotten-list">{forgotten.map(b=><span key={b.id}>{b.title}</span>)}</div></section>}
 <div className="search-row"><label className="search-box"><Search size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Título, autor, ISBN..."/></label><button className={`icon-button ${advanced?'active-button':''}`} onClick={()=>setAdvanced(v=>!v)}><Filter size={20}/></button></div>
 {advanced&&<div className="inline-panel"><strong>Filtros avanzados</strong><p>Los activaremos con editorial, ubicación, estado físico, año y valor cuando haya datos suficientes.</p></div>}
 <div className="filter-strip">{filters.map(([key,label])=><button key={key} className={filter===key?'selected':''} onClick={()=>setFilter(key)}>{label}</button>)}</div>
 <section className="section-heading"><div><h2>Toda tu biblioteca</h2><p>{visible.length} resultados</p></div><button><Sparkles size={16}/> Recientes</button></section>
 <div className="book-grid">{visible.map(b=><BookCard key={b.id} book={b}/>)}</div></>}</div>
}
