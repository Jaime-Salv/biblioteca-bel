import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, BedDouble, BookOpen, Check, DoorOpen, GripVertical, Home, Plus, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { assignBookToFurniture, createLocation, getBooksForShelves, getLocations, saveFurnitureBookOrder } from '../lib/libraryApi'
import type { AppBook, LibraryLocation } from '../lib/models'

const furnitureTypes = [
  { value:'bookcase', label:'Estantería', icon:'📚' },
  { value:'cabinet', label:'Armario', icon:'🚪' },
  { value:'drawer', label:'Cajonera', icon:'🗄️' },
  { value:'shelf', label:'Balda', icon:'🪵' },
  { value:'display_case', label:'Vitrina', icon:'💎' },
  { value:'box', label:'Caja', icon:'📦' },
] as const

function furnitureMeta(type:string) { return furnitureTypes.find(item=>item.value===type) ?? { value:type, label:'Mueble', icon:'🪑' } }

export function ShelvesPage() {
  const { activeLibrary } = useLibrary()
  const [locations,setLocations] = useState<LibraryLocation[]>([])
  const [books,setBooks] = useState<AppBook[]>([])
  const [roomId,setRoomId] = useState<string|null>(null)
  const [furnitureId,setFurnitureId] = useState<string|null>(null)
  const [dialog,setDialog] = useState<'room'|'furniture'|'books'|null>(null)
  const [name,setName] = useState('')
  const [furnitureType,setFurnitureType] = useState('bookcase')
  const [query,setQuery] = useState('')
  const [dragged,setDragged] = useState<string|null>(null)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState<string|null>(null)
  const [error,setError] = useState<string|null>(null)

  async function load() {
    if (!activeLibrary) return
    try {
      const [nextLocations,nextBooks] = await Promise.all([getLocations(activeLibrary.id),getBooksForShelves(activeLibrary.id)])
      setLocations(nextLocations); setBooks(nextBooks); setError(null)
    } catch (err) { setError(err instanceof Error?err.message:'No se pudo cargar la organización.') }
  }
  useEffect(()=>{void load()},[activeLibrary])

  const rooms = useMemo(()=>locations.filter(l=>!l.parentId&&(l.type==='room'||l.type==='property')),[locations])
  const room = rooms.find(r=>r.id===roomId)??null
  const furniture = useMemo(()=>locations.filter(l=>l.parentId===roomId),[locations,roomId])
  const selectedFurniture = furniture.find(f=>f.id===furnitureId)??null
  const placedBooks = useMemo(()=>books.filter(b=>b.locationId===furnitureId).sort((a,b)=>(a.shelfPosition??9999)-(b.shelfPosition??9999)||a.internalCode.localeCompare(b.internalCode)),[books,furnitureId])
  const availableBooks = useMemo(()=>books.filter(b=>b.locationId!==furnitureId&&`${b.title} ${b.author} ${b.isbn??''}`.toLowerCase().includes(query.toLowerCase())),[books,furnitureId,query])

  function closeDialog(){setDialog(null);setName('');setQuery('');setMessage(null);setError(null)}

  async function createRoom(e:FormEvent){e.preventDefault();if(!activeLibrary||!name.trim())return;setSaving(true);try{const created=await createLocation(activeLibrary.id,{name,type:'room'});await load();setRoomId(created.id);closeDialog()}catch(err){setError(err instanceof Error?err.message:'No se pudo crear la habitación.')}finally{setSaving(false)}}
  async function createFurniture(e:FormEvent){e.preventDefault();if(!activeLibrary||!roomId||!name.trim())return;setSaving(true);try{const created=await createLocation(activeLibrary.id,{name,type:furnitureType,parentId:roomId});await load();setFurnitureId(created.id);closeDialog()}catch(err){setError(err instanceof Error?err.message:'No se pudo crear el mueble.')}finally{setSaving(false)}}

  async function placeBook(book:AppBook){if(!activeLibrary||!furnitureId)return;setSaving(true);try{await assignBookToFurniture(activeLibrary.id,book.id,furnitureId,placedBooks.length);await load();setMessage(`“${book.title}” colocado en ${selectedFurniture?.name}.`)}catch(err){setError(err instanceof Error?err.message:'No se pudo colocar el libro.')}finally{setSaving(false)}}
  async function removeBook(book:AppBook){if(!activeLibrary)return;setSaving(true);try{await assignBookToFurniture(activeLibrary.id,book.id,null,0);await load()}catch(err){setError(err instanceof Error?err.message:'No se pudo retirar el libro.')}finally{setSaving(false)}}

  async function persistOrder(next:AppBook[]){if(!activeLibrary)return;setBooks(current=>current.map(book=>{const index=next.findIndex(item=>item.id===book.id);return index<0?book:{...book,shelfPosition:index}}));try{await saveFurnitureBookOrder(activeLibrary.id,next.map(b=>b.id))}catch(err){setError(err instanceof Error?err.message:'No se pudo guardar el orden.')}}
  function moveBook(id:string,direction:-1|1){const index=placedBooks.findIndex(b=>b.id===id);const target=index+direction;if(index<0||target<0||target>=placedBooks.length)return;const next=[...placedBooks];[next[index],next[target]]=[next[target],next[index]];void persistOrder(next)}
  function dropBook(event:DragEvent,id:string){event.preventDefault();if(!dragged||dragged===id)return;const from=placedBooks.findIndex(b=>b.id===dragged);const to=placedBooks.findIndex(b=>b.id===id);if(from<0||to<0)return;const next=[...placedBooks];const [moving]=next.splice(from,1);next.splice(to,0,moving);setDragged(null);void persistOrder(next)}

  if (room && selectedFurniture) return <div className="page spatial-page">
    <button className="back-chip" onClick={()=>setFurnitureId(null)}><ArrowLeft size={16}/> {room.name}</button>
    <div className="furniture-title"><div><span>{furnitureMeta(selectedFurniture.type).icon}</span><div><p className="eyebrow">{furnitureMeta(selectedFurniture.type).label.toUpperCase()}</p><h1>{selectedFurniture.name}</h1></div></div><button className="primary-button" onClick={()=>setDialog('books')}><Plus size={17}/> Colocar libros</button></div>
    <p className="subtitle">Arrastra las portadas para reproducir el orden físico del mueble.</p>
    <section className={`visual-furniture ${selectedFurniture.type}`}>
      <div className="furniture-top"/><div className="book-row-visual">
        {placedBooks.map((book,index)=><article key={book.id} draggable onDragStart={()=>setDragged(book.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>dropBook(e,book.id)} className="shelf-book" title={`${index+1}. ${book.title}`}>
          <GripVertical size={13}/><Link to={`/books/${book.id}`}>{book.coverUrl?<img src={book.coverUrl} alt={`Portada de ${book.title}`}/>:<div className="mini-cover"><strong>{book.title}</strong><small>{book.author}</small></div>}</Link>
          <div className="shelf-book-controls"><button onClick={()=>moveBook(book.id,-1)} disabled={index===0} aria-label="Mover a la izquierda"><ArrowLeft/></button><button onClick={()=>moveBook(book.id,1)} disabled={index===placedBooks.length-1} aria-label="Mover a la derecha"><ArrowRight/></button><button onClick={()=>void removeBook(book)} aria-label="Quitar del mueble"><X/></button></div>
        </article>)}
        {!placedBooks.length&&<button className="empty-furniture" onClick={()=>setDialog('books')}><BookOpen/><strong>Este mueble está vacío</strong><span>Coloca aquí tu primer libro</span></button>}
      </div><div className="furniture-shelf"/><div className="furniture-base"/>
    </section>
    <div className="order-legend"><span>{placedBooks.length} libros</span><span>Ordenados de izquierda a derecha</span></div>
    {(message||error)&&<div className={`form-message ${error?'error':'success'}`}>{message||error}</div>}
    {dialog==='books'&&<div className="spatial-modal"><div className="spatial-modal-card"><button className="modal-close" onClick={closeDialog}><X/></button><p className="eyebrow">COLOCAR EN {selectedFurniture.name.toUpperCase()}</p><h2>Elige libros</h2><label className="book-picker-search"><Search/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar título, autor o ISBN"/></label><div className="book-picker-list">{availableBooks.map(book=><button key={book.id} onClick={()=>void placeBook(book)} disabled={saving}><div>{book.coverUrl?<img src={book.coverUrl} alt=""/>:<span>📖</span>}</div><span><strong>{book.title}</strong><small>{book.author}{book.location?` · Ahora en ${book.location}`:' · Sin colocar'}</small></span><Plus/></button>)}</div>{!availableBooks.length&&<p className="picker-empty">No quedan libros que coincidan con esta búsqueda.</p>}</div></div>}
  </div>

  if (room) return <div className="page spatial-page">
    <button className="back-chip" onClick={()=>setRoomId(null)}><ArrowLeft size={16}/> Habitaciones</button>
    <div className="room-hero"><div className="room-icon"><DoorOpen/></div><div><p className="eyebrow">HABITACIÓN</p><h1>{room.name}</h1><p className="subtitle">Elige un mueble o crea uno nuevo.</p></div></div>
    <div className="furniture-grid">{furniture.map(item=>{const meta=furnitureMeta(item.type);return <button key={item.id} className={`furniture-card ${item.type}`} onClick={()=>setFurnitureId(item.id)}><span className="furniture-emoji">{meta.icon}</span><strong>{item.name}</strong><small>{meta.label} · {item.bookCount} libros</small><div className="mini-furniture-preview">{books.filter(b=>b.locationId===item.id).slice(0,7).map(b=>b.coverUrl?<img key={b.id} src={b.coverUrl} alt=""/>:<i key={b.id}/>)}</div></button>})}<button className="add-space-card" onClick={()=>setDialog('furniture')}><Plus/><strong>Añadir mueble</strong><small>Estantería, armario, cajón…</small></button></div>
    {!furniture.length&&<div className="empty-library"><div>🪑</div><h2>La habitación está vacía</h2><p>Añade tantos muebles como tengas en la realidad.</p><button className="primary-button" onClick={()=>setDialog('furniture')}><Plus/> Crear primer mueble</button></div>}
    {dialog==='furniture'&&<div className="spatial-modal"><form className="spatial-modal-card" onSubmit={createFurniture}><button type="button" className="modal-close" onClick={closeDialog}><X/></button><p className="eyebrow">NUEVO MUEBLE</p><h2>¿Qué tienes en {room.name}?</h2><label>Nombre<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Ej. Librería de roble"/></label><div className="furniture-type-picker">{furnitureTypes.map(item=><button type="button" key={item.value} className={furnitureType===item.value?'selected':''} onClick={()=>setFurnitureType(item.value)}><span>{item.icon}</span><strong>{item.label}</strong>{furnitureType===item.value&&<Check/>}</button>)}</div><button className="primary-button" disabled={saving}>{saving?'Creando…':'Crear mueble'}</button>{error&&<div className="form-message error">{error}</div>}</form></div>}
  </div>

  return <div className="page spatial-page"><p className="eyebrow">TU CASA · TU BIBLIOTECA</p><h1>Habitaciones</h1><p className="subtitle">Recrea dónde vive cada libro y encuentra cualquier ejemplar de un vistazo.</p>
    <div className="rooms-grid">{rooms.map(item=><button key={item.id} className="room-card" onClick={()=>setRoomId(item.id)}><div className="room-card-visual"><Home/><span>{locations.filter(l=>l.parentId===item.id).length} muebles</span></div><strong>{item.name}</strong><small>{locations.filter(l=>l.parentId===item.id).reduce((sum,f)=>sum+f.bookCount,0)} libros colocados</small></button>)}<button className="add-space-card room-add" onClick={()=>setDialog('room')}><Plus/><strong>Añadir habitación</strong><small>Salón, dormitorio, estudio…</small></button></div>
    {!rooms.length&&<div className="empty-library"><div>🏠</div><h2>Empieza por tu primera habitación</h2><p>Después podrás llenarla con muebles y colocar las portadas en el mismo orden que tus libros reales.</p><button className="primary-button" onClick={()=>setDialog('room')}><Plus/> Crear habitación</button></div>}
    {error&&<div className="form-message error">{error}</div>}
    {dialog==='room'&&<div className="spatial-modal"><form className="spatial-modal-card" onSubmit={createRoom}><button type="button" className="modal-close" onClick={closeDialog}><X/></button><div className="modal-hero-icon"><BedDouble/></div><p className="eyebrow">NUEVA HABITACIÓN</p><h2>¿Dónde guardas tus libros?</h2><label>Nombre<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Ej. Salón, dormitorio, estudio…"/></label><button className="primary-button" disabled={saving}>{saving?'Creando…':'Crear habitación'}</button>{error&&<div className="form-message error">{error}</div>}</form></div>}
  </div>
}
