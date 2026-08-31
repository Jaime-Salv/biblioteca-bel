import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ExternalLink, Save, Sparkles, Upload } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import {
  addBookValuation,
  estimateBookValueByIsbn,
  getBookCollectorDetails,
  getLibraryBooks,
  getLocations,
  saveBookPurchase,
  saveCollectorAttributes,
  updateBookDetails,
  BOOK_GENRES,
  uploadPurchaseTicket,
  type BookCollectorDetails,
  type CollectorAttributeState,
} from '../lib/libraryApi'
import type { AppBook, LibraryLocation, ReadingStatus } from '../lib/models'

const readingOptions: { value: ReadingStatus; label: string }[] = [
  { value: 'pending', label: '⏳ Pendiente' }, { value: 'reading', label: '📖 Leyendo' }, { value: 'read', label: '✅ Leído' }, { value: 'abandoned', label: '🫸 Abandonado' }, { value: 'rereading', label: '🔁 Relectura' },
]
const conditionOptions = [
  { value: '', label: '✨ Sin indicar' }, { value: 'new', label: '🆕 Nuevo' }, { value: 'excellent', label: '🌟 Excelente' }, { value: 'very_good', label: '💫 Muy bueno' }, { value: 'good', label: '👍 Bueno' }, { value: 'acceptable', label: '🙂 Aceptable' }, { value: 'damaged', label: '🩹 Dañado' },
]

type EditState = { title:string; subtitle:string; authors:string; isbn:string; publisher:string; year:string; pages:string; synopsis:string; coverUrl:string; status:ReadingStatus; condition:string; locationId:string; primaryGenre:string; genres:string[] }
type PurchaseState = { price:string; seller:string; date:string; orderNumber:string }
function stateFromBook(book:AppBook):EditState { return { title:book.title, subtitle:book.subtitle??'', authors:book.author==='Autor desconocido'?'':book.author, isbn:book.isbn??'', publisher:book.publisher??'', year:book.year!=null?String(book.year):'', pages:book.pages!=null?String(book.pages):'', synopsis:book.synopsis??'', coverUrl:book.coverUrl??'', status:book.status, condition:book.condition??'', locationId:book.locationId??'', primaryGenre:book.primaryGenre??'', genres:book.genres??[] } }
function purchaseState(details:BookCollectorDetails|null):PurchaseState { return { price:details?.purchase.price!=null?String(details.purchase.price):'', seller:details?.purchase.seller??'', date:details?.purchase.date??'', orderNumber:details?.purchase.orderNumber??'' } }

const detailLabels:Record<string,string> = {
  'Firmado':'¿Por quién está firmado?', 'Numerado':'Ej. 184/500', 'Dedicado':'¿A quién / qué dedicatoria?', 'Primera impresión':'Detalles de impresión', 'Primera edición':'Detalles de edición',
}

export function BookDetailPage(){
  const {id}=useParams(); const{activeLibrary}=useLibrary()
  const[book,setBook]=useState<AppBook|null>(null); const[locations,setLocations]=useState<LibraryLocation[]>([]); const[collector,setCollector]=useState<BookCollectorDetails|null>(null)
  const[loading,setLoading]=useState(true); const[saving,setSaving]=useState(false); const[error,setError]=useState<string|null>(null); const[saved,setSaved]=useState(false)
  const[form,setForm]=useState<EditState|null>(null); const[purchase,setPurchase]=useState<PurchaseState>({price:'',seller:'',date:'',orderNumber:''}); const[attributes,setAttributes]=useState<CollectorAttributeState[]>([])
  const[ticket,setTicket]=useState<File|null>(null); const[valuation,setValuation]=useState(''); const[valuationNote,setValuationNote]=useState(''); const[estimating,setEstimating]=useState(false); const[estimateMessage,setEstimateMessage]=useState<string|null>(null)

  async function load(){ if(!activeLibrary||!id)return; setLoading(true); try{ const[books,locs,details]=await Promise.all([getLibraryBooks(activeLibrary.id),getLocations(activeLibrary.id),getBookCollectorDetails(activeLibrary.id,id)]); const found=books.find(b=>b.id===id)??null; setBook(found); setLocations(locs); setCollector(details); setPurchase(purchaseState(details)); setAttributes(details.attributes); if(found)setForm(stateFromBook(found)) }catch(err){setError(err instanceof Error?err.message:'No se pudo cargar la ficha.')}finally{setLoading(false)} }
  useEffect(()=>{void load()},[activeLibrary,id])
  const locationOptions=useMemo(()=>locations.map(l=>({id:l.id,label:l.name})),[locations])
  const isDirty=useMemo(()=>{ if(!book||!form)return false; const base=JSON.stringify(stateFromBook(book)); const pBase=JSON.stringify(purchaseState(collector)); const aBase=JSON.stringify(collector?.attributes??[]); return JSON.stringify(form)!==base||JSON.stringify(purchase)!==pBase||JSON.stringify(attributes)!==aBase||!!ticket },[book,form,purchase,attributes,collector,ticket])

  function toggleAttribute(attrId:string){ setAttributes(prev=>prev.map(a=>a.id===attrId?{...a,selected:!a.selected}:a)) }
  function patchAttribute(attrId:string,patch:Partial<CollectorAttributeState>){ setAttributes(prev=>prev.map(a=>a.id===attrId?{...a,...patch}:a)) }

  function toggleGenre(genre:string){
    if(!form)return
    const exists=form.genres.includes(genre)
    const next=exists?form.genres.filter(g=>g!==genre):[...form.genres,genre]
    const primary=exists&&form.primaryGenre===genre?(next[0]??''):(form.primaryGenre||genre)
    setForm({...form,genres:next,primaryGenre:primary})
  }

  async function save(e?:FormEvent){ e?.preventDefault(); if(!activeLibrary||!book||!form)return; setSaving(true);setError(null);setSaved(false); try{
    await updateBookDetails(activeLibrary.id,book.id,{title:form.title,subtitle:form.subtitle||null,authors:form.authors.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean),isbn:form.isbn||null,publisher:form.publisher||null,publicationYear:form.year?Number(form.year):null,pageCount:form.pages?Number(form.pages):null,description:form.synopsis||null,coverUrl:form.coverUrl||null,readingStatus:form.status,physicalCondition:form.condition||null,locationId:form.locationId||null,primaryGenre:form.primaryGenre||null,genres:form.genres})
    const price=purchase.price.trim()===''?null:Number(purchase.price.replace(',','.'))
    const purchaseResult=await saveBookPurchase(activeLibrary.id,book.id,book.editionId,{price,seller:purchase.seller,date:purchase.date,orderNumber:purchase.orderNumber})
    if(ticket) await uploadPurchaseTicket(activeLibrary.id,purchaseResult.purchaseId,ticket)
    await saveCollectorAttributes(book.id,attributes)
    await load(); setTicket(null); setSaved(true); window.setTimeout(()=>setSaved(false),2500)
  }catch(err){setError(err instanceof Error?err.message:'No se pudo guardar la ficha.')}finally{setSaving(false)} }

  async function addManualValuation(){ if(!activeLibrary||!book||!valuation.trim())return; setError(null); try{await addBookValuation(activeLibrary.id,book.id,Number(valuation.replace(',','.')),'Valoración manual',valuationNote);setValuation('');setValuationNote('');await load()}catch(err){setError(err instanceof Error?err.message:'No se pudo guardar la valoración.')} }
  async function estimateValue(){ if(!activeLibrary||!book||!form?.isbn)return; setEstimating(true);setEstimateMessage(null);setError(null); try{const result=await estimateBookValueByIsbn(form.isbn); if(result.found&&result.value!=null){await addBookValuation(activeLibrary.id,book.id,result.value,result.source??'Fuente externa',result.note??null);setEstimateMessage(`✨ Referencia encontrada: ${result.value.toFixed(2)} ${result.currency??'€'}.`);await load()}else setEstimateMessage('No hay un precio público fiable para esta edición. Puedes añadir una valoración manual.') }catch(err){setError(err instanceof Error?err.message:'No se pudo estimar el valor.')}finally{setEstimating(false)} }

  if(loading)return <div className="page"><div className="state-card">Cargando ficha…</div></div>
  if(!book||!form)return <div className="page"><Link to="/library" className="back-link"><ArrowLeft size={17}/> Biblioteca</Link><div className="empty-library"><div>📕</div><h2>No encontramos este ejemplar</h2></div></div>

  const latestValue=collector?.valuations[0]?.value ?? book.estimatedValue ?? null
  return <form className="page lively-book-page" onSubmit={save}>
    <div className="detail-topbar lively-topbar"><Link to="/library" className="back-link"><ArrowLeft size={17}/> Biblioteca</Link><div className="live-edit-note">✏️ Editable directamente</div></div>
    {saved&&<div className="form-message success floating-success"><Check size={15}/> Cambios guardados</div>}{error&&<div className="form-message error">{error}</div>}

    <section className="collector-hero"><div className="collector-cover-wrap"><div className="collector-cover">{form.coverUrl?<img src={form.coverUrl} alt={`Portada de ${form.title||'libro'}`}/>:<div className="cover-fallback"><span>📚</span><strong>{form.title||'Sin portada'}</strong></div>}</div><label className="cover-url-field">🖼️ Portada<input value={form.coverUrl} onChange={e=>setForm({...form,coverUrl:e.target.value})} placeholder="Pega una URL de portada"/></label></div>
      <div className="collector-main-info"><p className="eyebrow">📘 {book.internalCode}</p><input className="title-live-input" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><input className="subtitle-live-input" value={form.subtitle} onChange={e=>setForm({...form,subtitle:e.target.value})} placeholder="Añadir subtítulo…"/><label className="author-live-field">✍️<input value={form.authors} onChange={e=>setForm({...form,authors:e.target.value})} placeholder="Autor o autores"/></label>
      <div className="collector-chips"><label className="chip-select reading-chip"><span>📖</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value as ReadingStatus})}>{readingOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label><label className="chip-select condition-chip"><span>🌟</span><select value={form.condition} onChange={e=>setForm({...form,condition:e.target.value})}>{conditionOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>{book.needsReview&&<span className="review-pill">🟡 Ficha por completar</span>}</div></div></section>

    <section className="collector-section"><div className="collector-section-heading"><div className="section-emoji">🏠</div><div><h2>Mi ejemplar</h2><p>Tu copia física, no solo el libro.</p></div></div><div className="collector-cards-grid"><label className="collector-field-card"><span>📍 Ubicación</span><select value={form.locationId} onChange={e=>setForm({...form,locationId:e.target.value})}><option value="">Sin ubicación</option>{locationOptions.map(l=><option key={l.id} value={l.id}>{l.label}</option>)}</select></label><div className="collector-stat-card"><span>💸 Precio pagado</span><strong>{purchase.price?`${purchase.price} €`:'Sin registrar'}</strong><small>Se edita justo debajo.</small></div><div className="collector-stat-card"><span>💎 Valor orientativo</span><strong>{latestValue!=null?`${latestValue.toFixed(2)} €`:'Sin valorar'}</strong><small>{collector?.valuations[0]?.source??'Añade o busca una referencia.'}</small></div></div></section>

    <section className="collector-section genre-editor-section"><div className="collector-section-heading"><div className="section-emoji">🧭</div><div><h2>Géneros y ADN lector</h2><p>Elige uno o varios. Esto alimenta tu perfil en Descubre.</p></div></div><div className="genre-editor-summary"><label><span>⭐ Género principal</span><select value={form.primaryGenre} onChange={e=>{const value=e.target.value;setForm({...form,primaryGenre:value,genres:value&&!form.genres.includes(value)?[value,...form.genres]:form.genres})}}><option value="">Sin clasificar</option>{BOOK_GENRES.map(g=><option key={g} value={g}>{g}</option>)}</select></label><div><span>🧬 Seleccionados</span><strong>{form.genres.length?`${form.genres.length} géneros`:'Aún ninguno'}</strong></div></div><div className="genre-chip-editor">{BOOK_GENRES.map(g=><button type="button" key={g} className={form.genres.includes(g)?'active':''} onClick={()=>toggleGenre(g)}>{form.genres.includes(g)?'✓ ':''}{g}</button>)}</div></section>

    <section className="collector-section"><div className="collector-section-heading"><div className="section-emoji">✨</div><div><h2>Características de colección</h2><p>Marca lo que hace especial a este ejemplar.</p></div></div><div className="attribute-toggle-grid">{attributes.map(a=><div key={a.id} className={`attribute-toggle-card ${a.selected?'active':''}`}><button type="button" onClick={()=>toggleAttribute(a.id)}><span>{a.icon||'🏷️'}</span><strong>{a.name}</strong><em>{a.selected?'Sí':'No'}</em></button>{a.selected&&detailLabels[a.name]&&<input value={a.valueText} onChange={e=>patchAttribute(a.id,{valueText:e.target.value})} placeholder={detailLabels[a.name]}/>}</div>)}</div></section>

    <section className="collector-section"><div className="collector-section-heading"><div className="section-emoji">💸</div><div><h2>Compra</h2><p>Cuándo, dónde y cuánto te costó.</p></div></div><div className="purchase-grid"><label><span>💶 Precio pagado</span><input inputMode="decimal" value={purchase.price} onChange={e=>setPurchase({...purchase,price:e.target.value})} placeholder="29,95"/></label><label><span>🏪 Dónde lo compraste</span><input value={purchase.seller} onChange={e=>setPurchase({...purchase,seller:e.target.value})} placeholder="Librería, web, particular…"/></label><label><span>📅 Fecha</span><input type="date" value={purchase.date} onChange={e=>setPurchase({...purchase,date:e.target.value})}/></label><label><span>🧾 Nº pedido</span><input value={purchase.orderNumber} onChange={e=>setPurchase({...purchase,orderNumber:e.target.value})} placeholder="Opcional"/></label></div><div className="ticket-panel"><label className="ticket-upload"><Upload size={17}/><span>{ticket?ticket.name:'Añadir ticket o factura'}</span><input type="file" accept="image/*,application/pdf" onChange={e=>setTicket(e.target.files?.[0]??null)}/></label>{collector?.purchase.ticketUrl&&<a href={collector.purchase.ticketUrl} target="_blank" rel="noreferrer" className="ticket-link"><ExternalLink size={15}/> {collector.purchase.ticketName||'Ver ticket guardado'}</a>}</div></section>

    <section className="collector-section"><div className="collector-section-heading"><div className="section-emoji">💎</div><div><h2>Valor de mercado</h2><p>Historial de referencias, siempre con fecha y fuente.</p></div></div><div className="valuation-actions"><button type="button" className="secondary-wide market-button" onClick={estimateValue} disabled={estimating||!form.isbn}><Sparkles size={16}/>{estimating?'Buscando referencia…':'Buscar valor orientativo por ISBN'}</button>{estimateMessage&&<p className="valuation-note">{estimateMessage}</p>}<div className="manual-valuation"><input inputMode="decimal" value={valuation} onChange={e=>setValuation(e.target.value)} placeholder="Valor estimado €"/><input value={valuationNote} onChange={e=>setValuationNote(e.target.value)} placeholder="Fuente o nota (opcional)"/><button type="button" className="primary-button" onClick={addManualValuation}>Guardar valoración</button></div></div>{collector?.valuations.length?<div className="valuation-history">{collector.valuations.slice(0,5).map(v=><div key={v.id}><span>📈 {v.date}</span><strong>{v.value.toFixed(2)} €</strong><small>{v.source||'Sin fuente'}{v.notes?` · ${v.notes}`:''}</small></div>)}</div>:<p className="muted-mini">Aún no hay valoraciones guardadas.</p>}</section>

    <section className="collector-section"><div className="collector-section-heading"><div className="section-emoji">🏷️</div><div><h2>Edición</h2><p>Los datos de esta edición concreta.</p></div></div><div className="edition-bubbles-grid"><label className="edition-bubble"><span>🔢 ISBN</span><input value={form.isbn} onChange={e=>setForm({...form,isbn:e.target.value})}/></label><label className="edition-bubble"><span>🏢 Editorial</span><input value={form.publisher} onChange={e=>setForm({...form,publisher:e.target.value})}/></label><label className="edition-bubble"><span>🗓️ Año</span><input inputMode="numeric" value={form.year} onChange={e=>setForm({...form,year:e.target.value})}/></label><label className="edition-bubble"><span>📄 Páginas</span><input inputMode="numeric" value={form.pages} onChange={e=>setForm({...form,pages:e.target.value})}/></label></div></section>
    <section className="collector-section synopsis-section"><div className="collector-section-heading"><div className="section-emoji">📖</div><div><h2>Sinopsis</h2><p>Siempre editable.</p></div></div><textarea className="synopsis-live-textarea" rows={8} value={form.synopsis} onChange={e=>setForm({...form,synopsis:e.target.value})}/></section>

    <div className={`lively-save-bar ${isDirty?'has-changes':''}`}><div><strong>{isDirty?'✨ Tienes cambios sin guardar':'✅ Todo al día'}</strong><span>{isDirty?'Ficha, compra, ticket o atributos han cambiado.':'Puedes tocar cualquier bloque directamente.'}</span></div><button className="primary-button" type="submit" disabled={!isDirty||saving}><Save size={17}/>{saving?'Guardando…':'Guardar cambios'}</button></div>
  </form>
}
