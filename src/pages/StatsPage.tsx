import { useEffect, useMemo, useState } from 'react'
import { BookHeart, ChevronRight, Compass, Dice5, Sparkles, Target, Trophy } from 'lucide-react'
import { useLibrary } from '../context/LibraryContext'
import { getCollectionInsights, getLibraryBooks } from '../lib/libraryApi'
import type { AppBook } from '../lib/models'

type Tab = 'discover' | 'achievements' | 'challenges'
type CollectionInsights = {
  counts: Record<string, number>
  totalValue: number
  totalSpent: number
  valuedBooks: number
  purchasedBooks: number
  genreCounts: Record<string, number>
  genreReadCounts: Record<string, number>
  classifiedBooks: number
  totalPages: number
  readPages: number
  locatedBooks: number
}

type Achievement = { emoji:string; name:string; description:string; current:number; target:number; secret?:boolean }
type Challenge = { emoji:string; name:string; description:string; current:number; target:number; difficulty:string; reward:string }

function pct(current:number,target:number){ return target<=0?0:Math.min(100,Math.round((current/target)*100)) }

export function StatsPage() {
  const { activeLibrary } = useLibrary()
  const [books, setBooks] = useState<AppBook[]>([])
  const [tab, setTab] = useState<Tab>('discover')
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [curiositySeed, setCuriositySeed] = useState(0)
  const [insights, setInsights] = useState<CollectionInsights>({ counts:{}, totalValue:0, totalSpent:0, valuedBooks:0, purchasedBooks:0, genreCounts:{}, genreReadCounts:{}, classifiedBooks:0, totalPages:0, readPages:0, locatedBooks:0 })

  useEffect(() => {
    if (!activeLibrary) return
    void Promise.all([getLibraryBooks(activeLibrary.id), getCollectionInsights(activeLibrary.id)]).then(([libraryBooks, collectionInsights]) => {
      setBooks(libraryBooks)
      setInsights(collectionInsights as CollectionInsights)
    })
  }, [activeLibrary])

  const stats = useMemo(() => {
    const read = books.filter(b=>b.status==='read').length
    const reading = books.filter(b=>b.status==='reading').length
    const pending = books.filter(b=>b.status==='pending').length
    const special = books.filter(b=>b.badges.length>0).length
    return { read, reading, pending, special }
  }, [books])

  const firstEditions = insights.counts['primera edición'] ?? 0
  const firstPrintings = insights.counts['primera impresión'] ?? 0
  const limited = insights.counts['edición limitada'] ?? 0
  const signed = insights.counts['firmado'] ?? 0
  const dedicated = insights.counts['dedicado'] ?? 0
  const numbered = insights.counts['numerado'] ?? 0
  const paintedEdges = insights.counts['cantos pintados'] ?? 0
  const specialEditions = insights.counts['edición especial'] ?? 0
  const classifiedPercent = books.length ? Math.round((insights.classifiedBooks/books.length)*100) : 0
  const locatedPercent = books.length ? Math.round((insights.locatedBooks/books.length)*100) : 0
  const readPercent = books.length ? Math.round((stats.read/books.length)*100) : 0
  const avgSpend = insights.purchasedBooks ? insights.totalSpent/insights.purchasedBooks : 0
  const avgValue = insights.valuedBooks ? insights.totalValue/insights.valuedBooks : 0
  const collectionJewels = signed+firstEditions+firstPrintings+limited+numbered+specialEditions

  const genres = useMemo<[string, number][]>(() => (Object.entries(insights.genreCounts) as [string, number][]).sort((a,b)=>b[1]-a[1]), [insights.genreCounts])
  const topGenre = genres[0]?.[0] ?? null
  const topGenreCount = genres[0]?.[1] ?? 0
  const genreDiversity = genres.length
  const dominantShare = books.length && topGenreCount ? Math.round((topGenreCount/books.length)*100) : 0

  const readerProfile = useMemo(() => {
    if (!books.length) return { emoji:'🌱', title:'Lector por descubrir', text:'Tu perfil aparecerá cuando empieces a llenar la biblioteca.' }
    if (genreDiversity >= 7 && dominantShare < 35) return { emoji:'🧭', title:'Explorador sin fronteras', text:'Saltas entre géneros y no dejas que una sola estantería defina tus lecturas.' }
    if (topGenre && dominantShare >= 45) return { emoji:'🧬', title:`Especialista en ${topGenre}`, text:`${dominantShare}% de tu biblioteca principal gravita alrededor de este género.` }
    if (collectionJewels >= Math.max(3, Math.round(books.length*.2))) return { emoji:'💎', title:'Cazador de ediciones', text:'Te importa tanto qué libro lees como qué ejemplar concreto conservas.' }
    if (stats.pending > stats.read*2) return { emoji:'🌙', title:'Acumulador de futuros', text:'Tu biblioteca funciona también como una lista de posibilidades pendientes.' }
    if (readPercent >= 65) return { emoji:'🔥', title:'Devorador constante', text:'Una parte muy alta de lo que entra en tu biblioteca termina siendo leído.' }
    return { emoji:'📚', title:'Lector equilibrado', text:'Tu colección mezcla lectura, curiosidad y conservación sin un único rasgo dominante.' }
  }, [books.length, genreDiversity, dominantShare, topGenre, collectionJewels, stats.pending, stats.read, readPercent])

  const achievements: Achievement[] = [
    {emoji:'📚',name:'Primeros pasos',description:'Añade 5 libros a tu biblioteca.',current:books.length,target:5},
    {emoji:'🏛️',name:'Biblioteca en marcha',description:'Alcanza los 25 ejemplares.',current:books.length,target:25},
    {emoji:'📖',name:'Estantería seria',description:'Reúne 100 ejemplares.',current:books.length,target:100},
    {emoji:'🏰',name:'Biblioteca legendaria',description:'Alcanza 500 ejemplares.',current:books.length,target:500},
    {emoji:'✅',name:'Buen ritmo',description:'Marca 10 libros como leídos.',current:stats.read,target:10},
    {emoji:'🔥',name:'Devorador',description:'Lee 50 libros de tu colección.',current:stats.read,target:50},
    {emoji:'🧭',name:'Explorador',description:'Clasifica libros en 5 géneros distintos.',current:genreDiversity,target:5},
    {emoji:'🌈',name:'Omnívoro literario',description:'Ten representación de 10 géneros.',current:genreDiversity,target:10},
    {emoji:'✍️',name:'Cazafirmas',description:'Registra tu primer ejemplar firmado.',current:signed,target:1},
    {emoji:'🖋️',name:'Colección de firmas',description:'Reúne 10 ejemplares firmados.',current:signed,target:10},
    {emoji:'🥇',name:'Primera joya',description:'Registra una primera edición.',current:firstEditions,target:1},
    {emoji:'1️⃣',name:'En la primera tirada',description:'Registra una primera impresión.',current:firstPrintings,target:1},
    {emoji:'💎',name:'Edición limitada',description:'Añade una edición limitada.',current:limited,target:1},
    {emoji:'🔢',name:'Con número propio',description:'Añade un ejemplar numerado.',current:numbered,target:1},
    {emoji:'💌',name:'Historia dentro de la historia',description:'Registra un libro dedicado.',current:dedicated,target:1},
    {emoji:'🎨',name:'También entra por los ojos',description:'Registra 3 libros con cantos pintados.',current:paintedEdges,target:3},
    {emoji:'🧾',name:'Archivo de compras',description:'Documenta 10 compras.',current:insights.purchasedBooks,target:10},
    {emoji:'💸',name:'Memoria económica',description:'Registra 500 € de compras.',current:Math.floor(insights.totalSpent),target:500},
    {emoji:'📈',name:'Tasador curioso',description:'Guarda valoración para 10 ejemplares.',current:insights.valuedBooks,target:10},
    {emoji:'🗄️',name:'Cada cosa en su sitio',description:'Ubica físicamente 25 libros.',current:insights.locatedBooks,target:25},
    {emoji:'🧹',name:'Biblioteca impecable',description:'Ubica todos tus ejemplares.',current:insights.locatedBooks,target:Math.max(books.length,1)},
    {emoji:'🧬',name:'ADN completo',description:'Clasifica el género de 25 libros.',current:insights.classifiedBooks,target:25},
  ]

  const challenges: Challenge[] = [
    {emoji:'🌱',name:'Pon orden al comienzo',description:'Clasifica por género 5 libros.',current:insights.classifiedBooks,target:5,difficulty:'Fácil',reward:'🧬 Desbloquea mejor tu ADN lector'},
    {emoji:'📍',name:'Mapa de estanterías',description:'Asigna ubicación a 15 ejemplares.',current:insights.locatedBooks,target:15,difficulty:'Fácil',reward:'🗺️ Mejora el mapa de tu colección'},
    {emoji:'🧾',name:'Memoria de compra',description:'Documenta precio y tienda de 10 libros.',current:insights.purchasedBooks,target:10,difficulty:'Medio',reward:'💸 Estadísticas económicas más fiables'},
    {emoji:'🌈',name:'Sal de tu zona de confort',description:'Consigue representación de 7 géneros.',current:genreDiversity,target:7,difficulty:'Medio',reward:'🧭 Perfil lector más diverso'},
    {emoji:'✅',name:'Vacía la pila',description:'Marca 25 libros como leídos.',current:stats.read,target:25,difficulty:'Medio',reward:'🔥 Sube tu índice de lectura'},
    {emoji:'💎',name:'Gabinete de curiosidades',description:'Registra 10 rasgos especiales de colección.',current:collectionJewels,target:10,difficulty:'Difícil',reward:'🏆 Perfil coleccionista avanzado'},
    {emoji:'📈',name:'Conoce lo que tienes',description:'Valora 25 ejemplares.',current:insights.valuedBooks,target:25,difficulty:'Difícil',reward:'💰 Patrimonio bibliográfico más completo'},
    {emoji:'🏰',name:'Biblioteca viva',description:'Ten 100 libros clasificados y ubicados.',current:Math.min(insights.classifiedBooks,insights.locatedBooks),target:100,difficulty:'Experto',reward:'👑 Colección documentada a gran escala'},
  ]

  const curiosities = useMemo(() => {
    const options = [
      topGenre ? {emoji:'🧬',title:'Tu centro de gravedad',text:`${topGenre} es tu género dominante con ${topGenreCount} ${topGenreCount===1?'libro':'libros'}.`} : {emoji:'🧭',title:'Todavía sin género dominante',text:'Clasifica algunos libros y empezaremos a dibujar tu ADN lector.'},
      {emoji:'⏳',title:'Tu pila de posibilidades',text:`Tienes ${stats.pending} pendientes. Eso es el ${books.length?Math.round(stats.pending/books.length*100):0}% de tu biblioteca.`},
      {emoji:'📄',title:'Peso en páginas',text:`Has registrado ${insights.totalPages.toLocaleString('es-ES')} páginas y ${insights.readPages.toLocaleString('es-ES')} ya pertenecen a libros leídos.`},
      {emoji:'💸',title:'Tu compra media',text:insights.purchasedBooks?`Cuando registras una compra, gastas de media ${avgSpend.toFixed(2)} € por ejemplar.`:'Empieza a guardar precios para descubrir cuánto cuesta de media un libro que entra en tu colección.'},
      {emoji:'💎',title:'Valor documentado',text:insights.valuedBooks?`Tus ${insights.valuedBooks} libros valorados suman ${insights.totalValue.toFixed(0)} €. Media: ${avgValue.toFixed(2)} €.`:'Aún no has guardado valoraciones. Puedes hacerlo desde cualquier ficha.'},
      {emoji:'✨',title:'Tu lado coleccionista',text:`Has registrado ${collectionJewels} rasgos de edición especialmente coleccionables.`},
      {emoji:'📍',title:'Biblioteca localizable',text:`El ${locatedPercent}% de tus ejemplares tiene una ubicación física registrada.`},
      {emoji:'🧹',title:'Ficha bibliográfica',text:`El ${classifiedPercent}% de tu colección tiene género registrado.`},
    ]
    if (!options.length) return []
    return [...options.slice(curiositySeed%options.length),...options.slice(0,curiositySeed%options.length)].slice(0,4)
  }, [topGenre,topGenreCount,stats.pending,books.length,insights.totalPages,insights.readPages,insights.purchasedBooks,avgSpend,insights.valuedBooks,insights.totalValue,avgValue,collectionJewels,locatedPercent,classifiedPercent,curiositySeed])

  const selectedGenreStats = selectedGenre ? {
    total: insights.genreCounts[selectedGenre] ?? 0,
    read: insights.genreReadCounts[selectedGenre] ?? 0,
  } : null

  return <div className="page discovery-page">
    <p className="eyebrow">✨ TU BIBLIOTECA TE CUENTA COSAS</p>
    <div className="discover-title-row"><div><h1>Descubre</h1><p className="subtitle">No son solo números: aquí vas descubriendo qué lector y qué coleccionista eres.</p></div><button className="curiosity-shuffle" onClick={()=>setCuriositySeed(s=>s+1)}><Dice5 size={17}/> Dame otros datos</button></div>

    <div className="stats-tabs">
      <button className={tab==='discover'?'selected':''} onClick={()=>setTab('discover')}><Sparkles size={16}/> Descubre</button>
      <button className={tab==='achievements'?'selected':''} onClick={()=>setTab('achievements')}><Trophy size={16}/> Logros <span className="tab-counter">{achievements.filter(a=>a.current>=a.target).length}/{achievements.length}</span></button>
      <button className={tab==='challenges'?'selected':''} onClick={()=>setTab('challenges')}><Target size={16}/> Retos</button>
    </div>

    {books.length===0 ? <div className="empty-library"><div>✨</div><h2>Aquí aparecerá tu ADN lector</h2><p>Añade libros y verás desde el primer momento todos los logros y retos que puedes perseguir.</p><button className="secondary-wide" onClick={()=>setTab('achievements')}>🏆 Ver todos los logros disponibles</button></div> : tab==='discover' ? <>
      <section className="reader-profile-wow">
        <div className="reader-profile-icon">{readerProfile.emoji}</div>
        <div className="reader-profile-main"><span>AHORA MISMO PARECES…</span><h2>{readerProfile.title}</h2><p>{readerProfile.text}</p><div className="profile-mini-pills"><b>✅ {readPercent}% leído</b><b>🧭 {genreDiversity} géneros</b><b>💎 {collectionJewels} joyas</b><b>📍 {locatedPercent}% ubicado</b></div></div>
        <div className="reader-score-ring"><strong>{Math.round((readPercent+classifiedPercent+locatedPercent)/3)}</strong><span>índice de<br/>biblioteca viva</span></div>
      </section>

      <section className="discover-section"><div className="discover-section-head"><div><span>🧬</span><div><small>ADN LECTOR</small><h2>¿De qué está hecha tu biblioteca?</h2></div></div><p>Haz clic en un género para verlo más de cerca.</p></div>
        {genres.length ? <><div className="genre-dna-list">{genres.slice(0,10).map(([genre,count],i)=><button key={genre} className={selectedGenre===genre?'selected':''} onClick={()=>setSelectedGenre(selectedGenre===genre?null:genre)}><span className="genre-rank">#{i+1}</span><div><strong>{genre}</strong><small>{count} {count===1?'libro':'libros'}</small></div><div className="genre-bar"><i style={{width:`${Math.max(8,Math.round(count/(genres[0]?.[1]||1)*100))}%`}}/></div><b>{books.length?Math.round(count/books.length*100):0}%</b></button>)}</div>{selectedGenre&&selectedGenreStats&&<div className="genre-focus-card"><div><span>🔎 MIRANDO DE CERCA</span><h3>{selectedGenre}</h3></div><div><strong>{selectedGenreStats.total}</strong><small>en tu colección</small></div><div><strong>{selectedGenreStats.read}</strong><small>leídos</small></div><div><strong>{selectedGenreStats.total-selectedGenreStats.read}</strong><small>por descubrir</small></div></div>}</> : <div className="genre-empty-prompt"><Compass/><div><strong>Tu ADN lector está esperando datos</strong><p>Entra en las fichas y marca el género principal. Las próximas altas intentarán proponerlo automáticamente.</p></div></div>}
      </section>

      <section className="discover-section"><div className="discover-section-head"><div><span>🤯</span><div><small>CURIOSIDADES</small><h2>Cosas que quizá no habías pensado</h2></div></div></div><div className="curiosity-grid">{curiosities.map(c=><article key={c.title}><span>{c.emoji}</span><div><strong>{c.title}</strong><p>{c.text}</p></div></article>)}</div></section>

      <div className="discovery-grid discovery-grid-rich"><article><span>📚</span><strong>{books.length}</strong><small>ejemplares</small></article><article><span>📄</span><strong>{insights.totalPages.toLocaleString('es-ES')}</strong><small>páginas registradas</small></article><article><span>💸</span><strong>{insights.totalSpent.toFixed(0)} €</strong><small>gasto documentado</small></article><article><span>💎</span><strong>{insights.totalValue.toFixed(0)} €</strong><small>valor documentado</small></article><article><span>✍️</span><strong>{signed}</strong><small>firmados</small></article><article><span>🥇</span><strong>{firstEditions}</strong><small>primeras ediciones</small></article></div>

      <section className="story-card story-card-action"><div className="story-card-head"><BookHeart/><div><small>LO QUE TU COLECCIÓN DICE DE TI</small><strong>{topGenre ? `Tu estantería habla mucho de ${topGenre}` : 'Tu perfil todavía tiene secretos'}</strong></div></div><p>{topGenre ? `Es tu género más presente, pero convive con ${Math.max(0,genreDiversity-1)} géneros más. ${stats.pending>stats.read?'Además, guardas más historias por descubrir que historias ya terminadas.':'Y una buena parte de lo que compras acaba siendo leído.'}` : 'Clasifica géneros, compras y características especiales para obtener conclusiones cada vez más personales.'}</p><button type="button" onClick={()=>setTab('challenges')}>Ver qué puedo mejorar <ChevronRight size={16}/></button></section>
    </> : tab==='achievements' ? <>
      <div className="achievement-overview"><div><Trophy/><span><strong>{achievements.filter(a=>a.current>=a.target).length}</strong> desbloqueados</span></div><p>Todos los logros están visibles desde el día 1. Los bloqueados no son secretos: son objetivos que puedes perseguir.</p></div>
      <div className="achievement-grid all-visible">{achievements.map(a=>{const done=a.current>=a.target;return <article className={`achievement-card ${done?'unlocked':'locked'}`} key={a.name}><div className="achievement-top"><span>{a.emoji}</span><small>{done?'DESBLOQUEADO':'POR CONSEGUIR'}</small></div><strong>{a.name}</strong><p className="achievement-description">{a.description}</p><div className="achievement-bottom"><span>{Math.min(a.current,a.target)} / {a.target}</span><b>{pct(a.current,a.target)}%</b></div><div className="achievement-progress"><i style={{width:`${pct(a.current,a.target)}%`}}/></div></article>})}</div>
    </> : <>
      <div className="challenge-intro"><span>🎯</span><div><strong>Una escalera, no una lista aleatoria</strong><p>Los primeros retos son fáciles de arrancar. Después te pediremos una biblioteca cada vez mejor documentada, diversa y leída.</p></div></div>
      <div className="challenge-ladder">{challenges.map((c,i)=>{const progress=pct(c.current,c.target);const done=c.current>=c.target;return <article className={`challenge-card challenge-level ${done?'completed':''}`} key={c.name}><div className="challenge-step"><span>{i+1}</span><i/></div><div className="challenge-emoji">{c.emoji}</div><div className="challenge-content"><div className="challenge-head"><div><small>{c.difficulty.toUpperCase()}</small><strong>{c.name}</strong></div><span>{Math.min(c.current,c.target)} / {c.target}</span></div><p>{c.description}</p><div className="challenge-progress"><i style={{width:`${progress}%`}}/></div><div className="challenge-footer"><span>{progress}% completado</span><b>{done?'✅ Completado':c.reward}</b></div></div></article>})}</div>
    </>}
  </div>
}
