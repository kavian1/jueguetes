// Datos de cada página pública del sitio: rutas, títulos y textos para buscadores y redes.
// Lo usan la aplicación (títulos y rutas) y vite.config.ts (HTML de cada página, sitemap…).
// El dominio NO va aquí: se configura en `.env` con VITE_SITE_URL.

export const SITE_NAME = 'Rincón de Juegos';

export interface PageInfo {
  /** ruta pública, siempre con barra final */
  path: string;
  game: 'isla' | 'polvo' | 'villa' | null;
  title: string;
  /** título corto para redes sociales */
  ogTitle: string;
  description: string;
  keywords: string;
  /** imagen para compartir (en /public) */
  image: string;
  imageAlt: string;
  h1: string;
  /** párrafos del contenido estático (lo que leen los buscadores antes de cargar el juego) */
  intro: string[];
  facts?: string[];
  genre?: string[];
  players?: [number, number];
}

export const PAGES: PageInfo[] = [
  {
    path: '/',
    game: null,
    title: 'Rincón de Juegos · Juegos de mesa online gratis para jugar con amigos',
    ogTitle: 'Rincón de Juegos · juegos de mesa online con amigos',
    description:
      'Juegos de mesa online gratis en pixel art para jugar con tus amigos desde el navegador: crea una sala, comparte el enlace y jugad sin registros ni descargas. Villa Moneda, Isla Cosecha y Polvo y Pólvora, con bots si faltan jugadores.',
    keywords: 'juegos de mesa online, jugar con amigos online, juegos de mesa gratis, juegos de navegador, juegos multijugador sin registro, pixel art',
    image: '/og-rincon.png',
    imageAlt: 'Una salita acogedora en pixel art con estanterías llenas de juegos de mesa',
    h1: 'Rincón de Juegos',
    intro: [
      'Juegos de mesa para jugar online con tus amigos, directamente en el navegador y gratis. Sin registros ni descargas: uno crea una sala, comparte el enlace y los demás entran con un clic.',
      'Si faltan jugadores, los huecos se rellenan con bots. También puedes practicar tú solo contra ellos.',
    ],
  },
  {
    path: '/villa-moneda/',
    game: 'villa',
    title: 'Villa Moneda · Juego de mesa online de comprar calles y construir con amigos',
    ogTitle: 'Villa Moneda · compra, construye y gobierna',
    description:
      'Juega gratis a Villa Moneda, un juego de mesa online de 3 a 5 jugadores: tira los dados, compra calles, bancos, empresas y atracciones, construye casas, puja en subastas, convoca manifestaciones, gana las elecciones y sobrevive a las noticias económicas. Tres modos de juego y diez vecinos con poderes.',
    keywords: 'juego de mesa online, juego de comprar propiedades, juego de dados y calles online, juego de economía con amigos, jugar con amigos online gratis, juego de mesa por turnos',
    image: '/og-villa.png',
    imageAlt: 'Calle de una villa en pixel art con casitas de colores, árboles, farolas, banderines y una fuente',
    h1: 'Villa Moneda: juego de mesa online de comprar calles y construir',
    intro: [
      'Recorre las 40 casillas de Villa Moneda tirando los dados: compra calles de siete barrios, la Estación y Ferris, empresas, bancos y atracciones como la Noria, y cobra a quien caiga en ellas. Con el barrio completo podrás construir casas y edificios.',
      'Puja en la Casa de Subastas, viaja en metro, organiza manifestaciones contra las calles de tus rivales y convoca referéndums. Cada ronda llega una noticia que cambia la economía y hay tres modos: partida rápida, hasta el final (gana el último en pie) y magnate.',
    ],
    facts: ['De 3 a 5 jugadores (con bots si faltan)', 'Partidas de 40 a 60 minutos', 'Gratis, en el navegador y sin registro'],
    genre: ['Juego de mesa', 'Economía', 'Dados', 'Estrategia'],
    players: [3, 5],
  },
  {
    path: '/isla-cosecha/',
    game: 'isla',
    title: 'Isla Cosecha · Juego de mesa online de comercio y construcción con amigos',
    ogTitle: 'Isla Cosecha · cosecha, comercia y construye',
    description:
      'Juega gratis a Isla Cosecha, un juego de mesa online de 3 a 4 jugadores: funda cabañas en una isla de casillas, cosecha recursos con los dados, comercia con tus amigos y que no te pille el zorro. Gana quien llegue a 10 puntos.',
    keywords: 'juego de mesa online, juego de comercio y construcción, juego de colonizar isla online, juego de recursos y dados, jugar con amigos online gratis, juego de estrategia por turnos',
    image: '/og-isla.png',
    imageAlt: 'Isla de casillas en pixel art con bosques, trigales, ovejas, montañas, muelles y un zorro',
    h1: 'Isla Cosecha: juego de mesa online de comercio y construcción',
    intro: [
      'Funda tus primeras cabañas en una isla hecha de casillas: bosques, barrizales, prados, trigales y canteras. Cada vez que salga su número en los dados, todas las cabañas y villas que las tocan cosechan madera, arcilla, lana, trigo o piedra.',
      'Comercia con los demás jugadores o con el granero, construye caminos, cabañas y villas, compra cartas de aldea y espanta al zorro con tus perros guardianes. Gana quien llegue antes a 10 puntos.',
    ],
    facts: ['De 3 a 4 jugadores (con bots si faltan)', 'Partidas de 45 a 75 minutos', 'Gratis, en el navegador y sin registro'],
    genre: ['Juego de mesa', 'Estrategia', 'Comercio', 'Construcción'],
    players: [3, 4],
  },
  {
    path: '/polvo-y-polvora/',
    game: 'polvo',
    title: 'Polvo y Pólvora · Juego de cartas online de roles ocultos del Oeste',
    ogTitle: 'Polvo y Pólvora · un duelo de roles ocultos',
    description:
      'Juega gratis a Polvo y Pólvora, un juego de cartas online de roles ocultos ambientado en el Oeste para 4 a 7 jugadores: Sheriff, Ayudantes, Forajidos y un Renegado. Nadie sabe quién es quién… salvo el Sheriff.',
    keywords: 'juego de cartas online, juego de roles ocultos, juego del oeste online, sheriff y forajidos, jugar con amigos online gratis, juego de cartas multijugador',
    image: '/og-polvo.png',
    imageAlt: 'Calle de un pueblo del Oeste en pixel art con saloon, tienda, banco y oficina del sheriff',
    h1: 'Polvo y Pólvora: juego de cartas online de roles ocultos',
    intro: [
      'Cada jugador recibe un rol secreto: el Sheriff y sus Ayudantes contra los Forajidos, con un Renegado que juega por su cuenta. Sólo el Sheriff se descubre; el resto tendrá que adivinar quién es quién por cómo dispara.',
      'Usa armas, barriles, caballos, duelos y dinamita, aprovecha la habilidad de tu personaje y sé el último bando en pie.',
    ],
    facts: ['De 4 a 7 jugadores (con bots si faltan)', 'Partidas de 20 a 40 minutos', 'Gratis, en el navegador y sin registro'],
    genre: ['Juego de cartas', 'Roles ocultos', 'Oeste'],
    players: [4, 7],
  },
];

export const pageForGame = (game: PageInfo['game']) => PAGES.find((p) => p.game === game) ?? PAGES[0];

/** Página que corresponde a una ruta (con o sin barra final). */
export function pageForPath(pathname: string): PageInfo | null {
  const clean = pathname.replace(/\/+$/, '') + '/';
  return PAGES.find((p) => p.path === clean) ?? null;
}
