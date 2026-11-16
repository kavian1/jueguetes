// @ts-nocheck -- herramienta de desarrollo que corre en Node (sin tipos de Node instalados)
// Pinta la isla (con piezas, fichas y muelles) en un PNG ampliado para revisar el arte sin navegador.
// Uso: npx vite-node scripts/render-isla.ts [salida.png] [semilla]
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

class FakeCtx {
  constructor(private c: FakeCanvas) {}
  createImageData(w: number, h: number) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  putImageData(img: { width: number; height: number; data: Uint8ClampedArray }) {
    this.c.data = img.data;
    this.c.width = img.width;
    this.c.height = img.height;
  }
}
class FakeCanvas {
  width = 0;
  height = 0;
  data = new Uint8ClampedArray(0);
  getContext() {
    return new FakeCtx(this);
  }
  toDataURL() {
    return '';
  }
}
(globalThis as unknown as { document: unknown }).document = { createElement: () => new FakeCanvas() };

const { makeBoard } = await import('../src/isla/board');
const art = await import('../src/isla/art');
const { iconSprite } = await import('../src/pixel/icons');
const { mulberry32 } = await import('../src/game/rng');

const out = process.argv[2] ?? 'isla.png';
const seed = Number(process.argv[3] ?? 3);
const board = makeBoard(mulberry32(seed));
const W = art.BW;
const H = art.BH;
const base = new FakeCanvas();
art.paintIsland(base.getContext() as unknown as CanvasRenderingContext2D, board);
const img = new Uint8ClampedArray(W * H * 4);
// fondo de mar
for (let i = 0; i < W * H; i++) {
  img[i * 4] = 0x3a;
  img[i * 4 + 1] = 0xa6;
  img[i * 4 + 2] = 0xd8;
  img[i * 4 + 3] = 255;
}
const blit = (src: { width: number; height: number; data: Uint8ClampedArray }, x0: number, y0: number) => {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const a = src.data[si + 3] / 255;
      if (!a) continue;
      const X = x0 + x;
      const Y = y0 + y;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const di = (Y * W + X) * 4;
      for (let k = 0; k < 3; k++) img[di + k] = img[di + k] * (1 - a) + src.data[si + k] * a;
    }
};
blit(base, 0, 0);
const sprite = (name: string, cx: number, cy: number) => {
  const c = iconSprite(name) as unknown as FakeCanvas | null;
  if (!c) return console.warn('falta', name);
  blit(c, Math.round(cx - c.width / 2), Math.round(cy - c.height / 2));
};
for (const port of board.ports) {
  const e = board.edges[port.edge];
  const pa = art.vertPos(board.verts[e.a]);
  const pb = art.vertPos(board.verts[e.b]);
  const bx = (pa.x + pb.x) / 2 + port.dx * 7 - port.dy * 10;
  const by = (pa.y + pb.y) / 2 + port.dy * 7 + port.dx * 10;
  sprite('isla_boat', bx, by - 2);
  sprite('isla_port_' + port.kind, (pa.x + pb.x) / 2 + port.dx * 14, (pa.y + pb.y) / 2 + port.dy * 14);
}
for (const h of board.hexes) {
  if (!h.num) continue;
  const p = art.tokenPos(h);
  sprite('isla_num_' + h.num, p.x, p.y);
}
// algunas piezas de ejemplo
const pieces: [number, string][] = [
  [10, 'isla_cabana_0'],
  [20, 'isla_villa_1'],
  [33, 'isla_cabana_2'],
  [44, 'isla_villa_3'],
];
for (const [v, name] of pieces) {
  const p = art.vertPos(board.verts[v]);
  for (const e of board.verts[v].edges.slice(0, 1)) {
    const info = art.edgeInfo(board, board.edges[e]);
    sprite(`isla_road_${info.dir}_${name.slice(-1)}`, info.x, info.y);
  }
  sprite(name, p.x, p.y - (name.includes('villa') ? 4 : 3));
}
const desert = board.hexes.find((h) => h.terrain === 'duna')!;
const dp = art.hexPos(desert);
sprite('isla_zorro', dp.x, dp.y - 2);

// ampliar ×4 y guardar
const S = Number(process.env.ZOOM ?? 4);
const OW = W * S;
const OH = H * S;
const raw = Buffer.alloc((OW * 3 + 1) * OH);
for (let y = 0; y < OH; y++) {
  raw[y * (OW * 3 + 1)] = 0;
  for (let x = 0; x < OW; x++) {
    const si = (Math.floor(y / S) * W + Math.floor(x / S)) * 4;
    const di = y * (OW * 3 + 1) + 1 + x * 3;
    raw[di] = img[si];
    raw[di + 1] = img[si + 1];
    raw[di + 2] = img[si + 2];
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OW, 0);
ihdr.writeUInt32BE(OH, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
writeFileSync(out, png);
console.log('escrito', out, OW, 'x', OH);
