import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'
import { Barcode, Camera, Check, ChevronRight, Keyboard, ListPlus, PencilLine, Search, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import {
  addExternalBookToLibrary,
  addManualBookToLibrary,
  captureIsbnToLibrary,
  enrichCapturedBook,
  getLocations,
  lookupGoogleBooksByIsbn,
  searchExternalBooks,
  type ExternalBook,
} from '../lib/libraryApi'
import { getIsbnOwnership, type IsbnOwnership } from '../lib/duplicateApi'
import type { LibraryLocation } from '../lib/models'

type Mode = 'home' | 'scan' | 'search' | 'manual' | 'inventory'
type InventoryItem = { isbn: string; code: string; status: 'identified' | 'review' | 'working' }

export function ScannerPage() {
  const { activeLibrary } = useLibrary()
  const [mode, setMode] = useState<Mode>('home')
  const [isbn, setIsbn] = useState('')
  const [scannedIsbn, setScannedIsbn] = useState('')
  const [result, setResult] = useState<ExternalBook | null>(null)
  const [ownership, setOwnership] = useState<IsbnOwnership | null>(null)
  const [addedCopyId, setAddedCopyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ExternalBook[]>([])
  const [locations, setLocations] = useState<LibraryLocation[]>([])
  const [inventoryLocation, setInventoryLocation] = useState<string>('')
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [manual, setManual] = useState({ title: '', author: '', isbn: '', publisher: '', year: '', pages: '' })
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerControls = useRef<IScannerControls | null>(null)
  const scanLocked = useRef(false)
  const lastInventoryScan = useRef<{ isbn: string; at: number }>({ isbn: '', at: 0 })
  const [cameraActive, setCameraActive] = useState(false)

  useEffect(() => {
    if (!activeLibrary) return
    getLocations(activeLibrary.id).then(setLocations).catch(() => setLocations([]))
  }, [activeLibrary])

  const counts = useMemo(() => ({
    identified: inventory.filter((x) => x.status === 'identified').length,
    review: inventory.filter((x) => x.status === 'review').length,
  }), [inventory])

  function resetMessages() { setError(null); setMessage(null); setAddedCopyId(null) }
  function stopCamera() { scannerControls.current?.stop(); scannerControls.current = null; setCameraActive(false); scanLocked.current = false }
  function go(next: Mode) { stopCamera(); resetMessages(); setResult(null); setScannedIsbn(''); setOwnership(null); setMode(next) }

  async function confirmDuplicate(isbnValue: string, known?: IsbnOwnership | null) {
    if (!activeLibrary) return false
    const info = known ?? await getIsbnOwnership(activeLibrary.id, isbnValue)
    if (!info.count) return true
    const label = info.title ? `“${info.title}”` : `ISBN ${info.isbn}`
    return window.confirm(`Ya tienes ${info.count} ${info.count === 1 ? 'ejemplar' : 'ejemplares'} de ${label}.\n\n¿Quieres añadir otro ejemplar igualmente?`)
  }

  useEffect(() => () => scannerControls.current?.stop(), [])

  useEffect(() => {
    if (mode !== 'inventory') return
    const timer = window.setTimeout(() => { void startCamera() }, 120)
    return () => window.clearTimeout(timer)
  }, [mode])

  async function startCamera() {
    resetMessages(); setResult(null); setScannedIsbn(''); setOwnership(null); scanLocked.current = false
    if (!navigator.mediaDevices?.getUserMedia) { setError('Este navegador no permite usar la cámara. Prueba Chrome, Edge o Safari mediante HTTPS.'); return }
    if (!videoRef.current) { setError('La cámara todavía no está lista. Inténtalo de nuevo.'); return }
    try {
      setCameraActive(true)
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      scannerControls.current = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current,
        (scanResult) => {
          if (!scanResult) return
          const detected = scanResult.getText().replace(/[^0-9Xx]/g, '').toUpperCase()
          if (detected.length !== 10 && detected.length !== 13) return

          if (mode === 'inventory') {
            const now = Date.now()
            if (lastInventoryScan.current.isbn === detected && now - lastInventoryScan.current.at < 1800) return
            lastInventoryScan.current = { isbn: detected, at: now }
            void processInventoryIsbn(detected)
            return
          }

          if (scanLocked.current) return
          scanLocked.current = true
          stopCamera()
          setIsbn(detected)
          void identifyIsbn(detected)
        },
      )
    } catch (err) {
      stopCamera()
      setError(err instanceof Error && err.name === 'NotAllowedError' ? 'Necesitamos permiso para usar la cámara.' : 'No se pudo abrir la cámara. Comprueba los permisos y que ninguna otra app la esté usando.')
    }
  }

  async function captureAndIdentify(input: string, locationId?: string | null) {
    if (!activeLibrary) throw new Error('No hay una biblioteca activa.')
    const captured = await captureIsbnToLibrary(activeLibrary.id, input, locationId)
    let found: ExternalBook | null = null
    try { found = await lookupGoogleBooksByIsbn(captured.isbn) } catch { found = null }
    if (found) {
      try { await enrichCapturedBook(activeLibrary.id, captured.id, found) } catch { /* queda en revisión */ }
    }
    return { captured, found }
  }

  async function processInventoryIsbn(value: string) {
    if (!activeLibrary) return
    const pendingIsbn = value.replace(/[^0-9Xx]/g, '').toUpperCase()
    if (pendingIsbn.length !== 10 && pendingIsbn.length !== 13) return
    setIsbn('')
    setError(null)
    try {
      const existing = await getIsbnOwnership(activeLibrary.id, pendingIsbn)
      if (existing.count && !(await confirmDuplicate(pendingIsbn, existing))) {
        setMessage(`ISBN ${pendingIsbn} omitido: ya estaba en tu biblioteca.`)
        return
      }
    } catch {
      // Si falla la comprobación, no bloqueamos el inventario.
    }
    const temp: InventoryItem = { isbn: pendingIsbn, code: 'Guardando…', status: 'working' }
    setInventory((old) => [temp, ...old])
    try {
      const { captured, found } = await captureAndIdentify(pendingIsbn, inventoryLocation || null)
      setInventory((old) => old.map((x) => x === temp ? { isbn: captured.isbn, code: captured.internal_code, status: found ? 'identified' : 'review' } : x))
    } catch (err) {
      setInventory((old) => old.filter((x) => x !== temp))
      setError(err instanceof Error ? err.message : 'No se pudo guardar este ISBN.')
    }
  }

  async function identifyIsbn(value: string) {
    resetMessages(); setResult(null); setScannedIsbn(''); setOwnership(null); setLoading(true)
    const clean = value.replace(/[^0-9Xx]/g, '').toUpperCase()
    if (clean.length !== 10 && clean.length !== 13) {
      setError('Introduce un ISBN-10 o ISBN-13 válido.'); setLoading(false); return
    }
    try {
      const [found, existing] = await Promise.all([
        lookupGoogleBooksByIsbn(clean),
        activeLibrary ? getIsbnOwnership(activeLibrary.id, clean).catch(() => null) : Promise.resolve(null),
      ])
      setScannedIsbn(clean)
      setResult(found)
      setOwnership(existing)
      if (existing?.count) {
        setMessage(`⚠️ Ya tienes ${existing.count} ${existing.count === 1 ? 'ejemplar' : 'ejemplares'} de esta edición. Puedes añadir otro si realmente tienes otra copia física.`)
      } else if (found) {
        setMessage('✅ Libro identificado. Revisa los datos y confirma para añadirlo a tu biblioteca.')
      } else {
        setMessage('ISBN detectado. No hemos completado sus metadatos, pero puedes guardarlo y editarlo después.')
      }
    } catch (err) {
      setScannedIsbn(clean)
      setResult(null)
      setMessage('ISBN detectado. Puedes guardarlo ahora y completar sus datos después.')
      setError(err instanceof Error ? err.message : null)
    } finally { setLoading(false) }
  }

  async function handleIsbn(e?: FormEvent) { e?.preventDefault(); await identifyIsbn(isbn) }

  async function addScannedBook() {
    if (!activeLibrary || !scannedIsbn) return
    resetMessages(); setLoading(true)
    try {
      if (ownership?.count && !(await confirmDuplicate(scannedIsbn, ownership))) return
      if (result) {
        const book: ExternalBook = {
          ...result,
          isbn10: result.isbn10 ?? (scannedIsbn.length === 10 ? scannedIsbn : null),
          isbn13: result.isbn13 ?? (scannedIsbn.length === 13 ? scannedIsbn : null),
        }
        const copy = await addExternalBookToLibrary(activeLibrary.id, book)
        setAddedCopyId(copy.id)
        setMessage(`✅ ${book.title} ya forma parte de tu biblioteca · ${copy.internal_code}`)
      } else {
        const copy = await captureIsbnToLibrary(activeLibrary.id, scannedIsbn)
        setAddedCopyId(copy.id)
        setMessage(`✅ Ejemplar guardado · ${copy.internal_code}. Puedes completar sus datos desde la ficha.`)
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo añadir el libro.') }
    finally { setLoading(false) }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault(); resetMessages(); setLoading(true); setResults([])
    try {
      const found = await searchExternalBooks(query)
      setResults(found)
      if (!found.length) setMessage('No encontramos coincidencias. Puedes añadirlo manualmente sin problema.')
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo buscar.') }
    finally { setLoading(false) }
  }

  async function addSearchResult(book: ExternalBook) {
    if (!activeLibrary) return
    resetMessages(); setLoading(true)
    try {
      const candidateIsbn = book.isbn13 || book.isbn10
      if (candidateIsbn && !(await confirmDuplicate(candidateIsbn))) return
      const copy = await addExternalBookToLibrary(activeLibrary.id, book)
      setAddedCopyId(copy.id)
      setMessage(`✅ ${book.title} añadido · ${copy.internal_code}`)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo añadir.') }
    finally { setLoading(false) }
  }

  async function handleManual(e: FormEvent) {
    e.preventDefault(); if (!activeLibrary) return
    resetMessages(); setLoading(true)
    try {
      if (manual.isbn.trim() && !(await confirmDuplicate(manual.isbn))) return
      const copy = await addManualBookToLibrary(activeLibrary.id, {
        title: manual.title,
        author: manual.author,
        isbn: manual.isbn,
        publisher: manual.publisher,
        publicationYear: manual.year ? Number(manual.year) : null,
        pageCount: manual.pages ? Number(manual.pages) : null,
      })
      setAddedCopyId(copy.id)
      setMessage(`✅ Libro añadido · ${copy.internal_code}`)
      setManual({ title: '', author: '', isbn: '', publisher: '', year: '', pages: '' })
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo añadir.') }
    finally { setLoading(false) }
  }

  async function handleInventory(e: FormEvent) {
    e.preventDefault()
    if (!isbn.trim()) return
    await processInventoryIsbn(isbn)
  }

  return <div className="page add-book-page">
    <p className="eyebrow">AÑADIR A LA COLECCIÓN</p>
    <div className="add-page-title"><div><h1>{mode === 'home' ? 'Añadir libro' : mode === 'inventory' ? 'Inventario rápido' : mode === 'manual' ? 'Alta manual' : mode === 'search' ? 'Buscar libro' : 'Escanear código'}</h1><p className="subtitle">{mode === 'home' ? 'Elige la forma más cómoda. Tener el libro en la mano siempre será suficiente para registrarlo.' : 'Puedes volver atrás y escoger otro método cuando quieras.'}</p></div>{mode !== 'home' && <button className="close-mode" onClick={() => go('home')} aria-label="Volver"><X size={20}/></button>}</div>

    {mode === 'home' && <>
      <section className="add-methods">
        <button onClick={() => go('scan')}><span className="method-icon"><Camera/></span><span><strong>Escanear código</strong><small>Identifica, revisa y confirma</small></span><ChevronRight size={18}/></button>
        <button onClick={() => go('search')}><span className="method-icon"><Search/></span><span><strong>Buscar libro</strong><small>Título, autor o ISBN</small></span><ChevronRight size={18}/></button>
        <button onClick={() => go('manual')}><span className="method-icon"><PencilLine/></span><span><strong>Añadir manualmente</strong><small>Para libros antiguos, raros o sin ISBN</small></span><ChevronRight size={18}/></button>
        <button className="inventory-method" onClick={() => go('inventory')}><span className="method-icon"><ListPlus/></span><span><strong>Inventario rápido</strong><small>Cámara continua: libro tras libro</small></span><ChevronRight size={18}/></button>
      </section>
      <div className="product-rule"><Sparkles size={18}/><p><strong>Regla de la app:</strong> si posees físicamente el libro, siempre podrás registrarlo aunque ninguna base de datos externa lo conozca.</p></div>
    </>}

    {mode === 'scan' && <>
      <section className={`camera-scanner ${cameraActive ? 'active' : ''}`}>
        <video ref={videoRef} muted playsInline aria-label="Vista de la cámara para escanear el ISBN" />
        {cameraActive && <div className="camera-guide"><span/><p>Centra el código de barras dentro del marco</p></div>}
        {!cameraActive && <div className="camera-idle"><Camera size={36}/><strong>Escáner EAN-13 / ISBN</strong><p>Usa la cámara trasera y detecta el código automáticamente.</p></div>}
        <button type="button" className="primary-button camera-toggle" onClick={() => cameraActive ? stopCamera() : void startCamera()}>{cameraActive ? 'Cerrar cámara' : 'Abrir cámara'}</button>
      </section>
      <section className="scanner-real-card"><div className="scanner-icon"><Barcode size={34}/></div><strong>También puedes escribirlo</strong><p>Buscaremos portada, autor, editorial y sinopsis. Tú confirmas antes de añadir el ejemplar.</p></section>
      <form className="isbn-form" onSubmit={handleIsbn}><label><Keyboard size={18}/><input autoFocus value={isbn} onChange={(e) => setIsbn(e.target.value)} inputMode="numeric" placeholder="ISBN-10 o ISBN-13"/></label><button className="primary-button" disabled={loading}>{loading ? 'Buscando…' : 'Identificar libro'}</button></form>
      {scannedIsbn && <section className="scan-confirm-card">
        {result ? <div className="lookup-result"><div className="lookup-cover">{result.coverUrl ? <img src={result.coverUrl} alt=""/> : <div>📕</div>}</div><div><span className="eyebrow">IDENTIFICADO AUTOMÁTICAMENTE</span><h2>{result.title}</h2><p>{result.authors.join(', ') || 'Autor desconocido'}</p><small>{result.publisher ?? 'Editorial no disponible'}{result.publicationYear ? ` · ${result.publicationYear}` : ''}</small>{result.description && <p className="lookup-description">{result.description}</p>}</div></div> : <div className="unidentified-book"><strong>ISBN {scannedIsbn}</strong><p>No tenemos todavía los metadatos de esta edición. Puedes guardarla y completarla desde la ficha.</p></div>}
        {ownership?.count ? <div className="form-message error">Ya tienes {ownership.count} {ownership.count === 1 ? 'ejemplar' : 'ejemplares'} de esta edición. Añade otro solo si posees otra copia física.</div> : null}
        <button className="primary-button add-library-button" onClick={addScannedBook} disabled={loading || !!addedCopyId}>{addedCopyId ? 'Añadido a mi biblioteca ✓' : loading ? 'Añadiendo…' : ownership?.count ? 'Añadir otro ejemplar' : 'Añadir a mi biblioteca'}</button>
        {addedCopyId && <Link className="soft-action view-added-book" to={`/books/${addedCopyId}`}>Ver y editar ficha</Link>}
      </section>}
    </>}

    {mode === 'search' && <>
      <form className="isbn-form" onSubmit={handleSearch}><label><Search size={18}/><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Título, autor o ISBN"/></label><button className="primary-button" disabled={loading}>{loading ? 'Buscando…' : 'Buscar'}</button></form>
      <div className="search-results-list">{results.map((book, i) => <article className="search-book-row" key={`${book.sourceId}-${i}`}><div className="search-cover">{book.coverUrl ? <img src={book.coverUrl} alt=""/> : '📚'}</div><div><strong>{book.title}</strong><span>{book.authors.join(', ') || 'Autor desconocido'}</span><small>{book.publisher || 'Editorial desconocida'}{book.publicationYear ? ` · ${book.publicationYear}` : ''}</small></div><button onClick={() => addSearchResult(book)} disabled={loading}>Añadir</button></article>)}</div>
      {!!query && !loading && !results.length && <button className="soft-action" onClick={() => go('manual')}>No aparece → añadir manualmente</button>}
      {addedCopyId && <Link className="soft-action view-added-book" to={`/books/${addedCopyId}`}>Ver y editar el ejemplar añadido</Link>}
    </>}

    {mode === 'manual' && <form className="manual-book-form" onSubmit={handleManual}>
      <label>Título *<input autoFocus value={manual.title} onChange={(e) => setManual({...manual,title:e.target.value})} placeholder="Título del libro"/></label>
      <label>Autor<input value={manual.author} onChange={(e) => setManual({...manual,author:e.target.value})} placeholder="Autor o autora"/></label>
      <label>ISBN <small>opcional</small><input value={manual.isbn} onChange={(e) => setManual({...manual,isbn:e.target.value})} placeholder="Si lo tiene"/></label>
      <div className="manual-grid"><label>Editorial<input value={manual.publisher} onChange={(e) => setManual({...manual,publisher:e.target.value})}/></label><label>Año<input inputMode="numeric" value={manual.year} onChange={(e) => setManual({...manual,year:e.target.value})}/></label></div>
      <label>Páginas<input inputMode="numeric" value={manual.pages} onChange={(e) => setManual({...manual,pages:e.target.value})}/></label>
      <button className="primary-button" disabled={loading}>{loading ? 'Guardando…' : 'Añadir a mi biblioteca'}</button>
      {addedCopyId && <Link className="soft-action view-added-book" to={`/books/${addedCopyId}`}>Ver y editar ficha</Link>}
    </form>}

    {mode === 'inventory' && <>
      <section className="inventory-setup"><label>¿Dónde estás inventariando?<select value={inventoryLocation} onChange={(e) => setInventoryLocation(e.target.value)}><option value="">Sin ubicación por ahora</option>{locations.map((loc) => <option value={loc.id} key={loc.id}>{loc.name}</option>)}</select></label><div className="inventory-count"><strong>{inventory.length}</strong><span>escaneados</span><small>{counts.identified} identificados · {counts.review} por revisar</small></div></section>
      <section className={`camera-scanner inventory-camera ${cameraActive ? 'active' : ''}`}>
        <video ref={videoRef} muted playsInline aria-label="Cámara continua para inventario rápido" />
        {cameraActive && <div className="camera-guide"><span/><p>Apunta al código. Cuando lo lea, pasa directamente al siguiente libro.</p></div>}
        {!cameraActive && <div className="camera-idle"><Camera size={36}/><strong>Cámara de inventario continuo</strong><p>Detecta, guarda y queda lista para el siguiente libro automáticamente.</p></div>}
        <button type="button" className="primary-button camera-toggle" onClick={() => cameraActive ? stopCamera() : void startCamera()}>{cameraActive ? 'Pausar cámara' : 'Continuar escaneando'}</button>
      </section>
      <form className="inventory-scan-form" onSubmit={handleInventory}><div className="inventory-scan-box"><Barcode size={27}/><input value={isbn} onChange={(e) => setIsbn(e.target.value)} inputMode="numeric" placeholder="O escribe un ISBN manualmente"/></div><button className="primary-button">Añadir y siguiente</button></form>
      <p className="inventory-hint">📷 La cámara permanece abierta: detectar → comprobar duplicados → guardar → siguiente. Un mismo código tiene un pequeño bloqueo de 1,8 s mientras sigue dentro del encuadre.</p>
      <div className="inventory-list">{inventory.map((item, i) => <div key={`${item.code}-${i}`}><span>{item.status === 'identified' ? '✅' : item.status === 'review' ? '🟡' : '⏳'}</span><div><strong>{item.isbn}</strong><small>{item.code}</small></div><em>{item.status === 'identified' ? 'Identificado' : item.status === 'review' ? 'Revisar' : 'Procesando'}</em></div>)}</div>
    </>}

    {error && <div className="form-message error">{error}</div>}
    {message && <div className="form-message success"><Check size={15}/>{message}</div>}
  </div>
}
