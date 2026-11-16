# Rincón de Juegos

Juegos de mesa multijugador para jugar online con amigos desde el navegador, sin instalar nada y sin servidor propio.

**Demo:** https://jueguetes.netlify.app

| Juego | De qué va | Jugadores |
| --- | --- | --- |
| Villa Moneda | Compra calles y empresas, construye, pide préstamos y vota en las elecciones. Gana el mayor patrimonio. | 3–5 |
| Isla Cosecha | Cosecha recursos con los dados, comercia y construye caminos, cabañas y villas hasta llegar a 10 puntos. | 3–4 |
| Polvo y Pólvora | Roles ocultos en el Oeste: Sheriff y Ayudantes contra Forajidos y un Renegado. | 4–7 |

## Características

- **Multijugador P2P:** los navegadores se conectan directamente por WebRTC (PeerJS). El anfitrión ejecuta la partida y el resto se une con un código de 5 letras o un enlace de invitación.
- **Bots:** rellenan los huecos de la mesa y sustituyen a quien se desconecta más de 20 segundos. Cada juego tiene un modo práctica contra bots.
- **Reconexión:** quien se cae puede volver con el mismo enlace y recupera su sitio.
- **Pixel art generado por código:** tableros, personajes e iconos se pintan en canvas, sin imágenes externas.
- **SEO:** cada juego tiene su propia página con metadatos, Open Graph, datos estructurados (schema.org), `sitemap.xml` y `robots.txt`, generados al compilar con un plugin de Vite.
- **Arquitectura extensible:** cada juego es un motor independiente que se conecta a la capa de red a través de una interfaz común (`GameAdapter`).

## Tecnologías

TypeScript · React 18 · Vite · PeerJS (WebRTC) · Canvas API · Netlify

## Ejecutar en local

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # compila en dist/
npm run sim:isla     # simula partidas de Isla Cosecha solo con bots
npm run sim:villa    # simula partidas de Villa Moneda solo con bots
npm run sim          # simula partidas de Polvo y Pólvora solo con bots
```

Copia `.env.example` como `.env` y pon en `VITE_SITE_URL` la dirección donde se publica la web (se usa para las URL canónicas y el sitemap).

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `src/shell/` | Catálogo de juegos, portadas, sala de espera común y menús |
| `src/net/` | Sesiones de anfitrión e invitado sobre PeerJS, comunes a todos los juegos |
| `src/villa/` | Villa Moneda: motor, reglas, bots y mesa |
| `src/isla/` | Isla Cosecha: tablero, motor, bots, arte y animaciones |
| `src/game/`, `src/ui/` | Polvo y Pólvora: motor y mesa |
| `src/pixel/` | Utilidades de pixel art: paletas, formas, personajes e iconos |
| `scripts/` | Simuladores de partidas y generación de imágenes para redes |

## Limitaciones

- La partida vive en el navegador del anfitrión: si cierra la pestaña, la partida termina.
- El emparejamiento usa el servidor público de PeerJS. En redes muy restrictivas la conexión directa puede fallar y haría falta un servidor TURN.
