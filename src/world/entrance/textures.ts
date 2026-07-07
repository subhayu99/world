// Entrance facade textures — the first thing a visitor sees. Drawn in the
// finest line weight of the whole world (thin ink, no heavy fills) to match
// the pen-sketch feel of the reference facade: brick wall, window frame,
// waving figure, tree with a hanging computer mouse, stone path, planter
// with a rubber duck, the crawling bug and its BUG FIXED splat.

import * as THREE from 'three';
import { DRAFT_FONT_FAMILY } from '../blueprint/palette';
import { ensureDraftFont } from '../blueprint/sketch';

const INK = 'rgba(52,52,50,0.9)';
const INK_SOFT = 'rgba(72,72,70,0.55)';
const PAPER = '#f9f8f3';

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  return { canvas, ctx };
}

function wrap(canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

function rng(seed: number): () => number {
  let a = seed * 9301 + 49297;
  return () => ((a = (a * 233280 + 49297) % 233280) / 233280);
}

const cache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const t = make();
  cache.set(key, t);
  return t;
}

/** Tileable running-bond brick wall, thin pen outlines, airy. */
export function bricksTexture(): THREE.CanvasTexture {
  return cached('bricks', () => {
    const s = 512;
    const { canvas, ctx } = makeCanvas(s, s);
    const r = rng(41);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, s, s);
    const rows = 14;
    const bh = s / rows;
    const bw = bh * 2.3;
    ctx.lineWidth = 1.4;
    for (let row = 0; row < rows; row++) {
      const y = row * bh;
      const offset = row % 2 === 0 ? 0 : bw / 2;
      for (let x = -bw + offset; x < s + bw; x += bw) {
        // each brick: slightly inset rounded rect with imperfect corners
        const inset = 2.2;
        const bx = x + inset;
        const by = y + inset;
        const w = bw - inset * 2;
        const h = bh - inset * 2;
        ctx.strokeStyle = `rgba(60,60,58,${0.5 + r() * 0.35})`;
        ctx.beginPath();
        ctx.moveTo(bx + 1, by);
        ctx.lineTo(bx + w - 1 - r() * 2, by + r() * 1.2);
        ctx.lineTo(bx + w, by + h - 1);
        ctx.lineTo(bx + r() * 2, by + h - r() * 1.2);
        ctx.closePath();
        ctx.stroke();
        // occasional shading dashes inside a brick
        if (r() > 0.72) {
          ctx.strokeStyle = 'rgba(90,90,88,0.3)';
          for (let d = 0; d < 3; d++) {
            const dx = bx + 3 + r() * (w - 8);
            ctx.beginPath();
            ctx.moveTo(dx, by + 2);
            ctx.lineTo(dx - 2, by + h - 2);
            ctx.stroke();
          }
        }
      }
    }
    return wrap(canvas, true);
  });
}

/** Four-pane wooden window frame; panes transparent (interior shows through). */
export function windowFrameTexture(): THREE.CanvasTexture {
  return cached('windowFrame', () => {
    const s = 512;
    const { canvas, ctx } = makeCanvas(s, s);
    ctx.clearRect(0, 0, s, s);
    const draw = (x: number, y: number, w: number, h: number, lw: number) => {
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.strokeRect(x, y, w, h);
    };
    // outer frame: filled wood band with grain
    ctx.fillStyle = '#f2f0e9';
    ctx.fillRect(0, 0, s, s);
    ctx.clearRect(58, 58, s - 116, s - 116);
    draw(6, 6, s - 12, s - 12, 4);
    draw(58, 58, s - 116, s - 116, 3);
    // grain squiggles in the band
    ctx.strokeStyle = INK_SOFT;
    ctx.lineWidth = 1.2;
    const r = rng(7);
    for (let i = 0; i < 22; i++) {
      const along = r() * 4;
      ctx.beginPath();
      if (along < 1) {
        const y = 14 + r() * 34;
        ctx.moveTo(20 + r() * 80, y);
        ctx.quadraticCurveTo(s / 2 + (r() - 0.5) * 120, y + (r() - 0.5) * 8, s - 30 - r() * 80, y);
      } else {
        const x = along < 2.5 ? 14 + r() * 34 : s - 48 + r() * 34;
        ctx.moveTo(x, 70 + r() * 90);
        ctx.quadraticCurveTo(x + (r() - 0.5) * 8, s / 2, x, s - 80 - r() * 80);
      }
      ctx.stroke();
    }
    // mullions (cross bars) — filled thin bars with outline
    ctx.fillStyle = '#f2f0e9';
    ctx.fillRect(s / 2 - 13, 58, 26, s - 116);
    ctx.fillRect(58, s / 2 - 13, s - 116, 26);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(s / 2 - 13, 58, 26, s - 116);
    ctx.strokeRect(58, s / 2 - 13, s - 116, 26);
    // corner brace ticks like the reference
    ctx.lineWidth = 1.6;
    for (const [cx, cy] of [[58, 58], [s - 58, 58], [58, s - 58], [s - 58, s - 58]] as const) {
      ctx.beginPath();
      ctx.moveTo(cx + (cx < s / 2 ? 26 : -26), cy);
      ctx.lineTo(cx, cy + (cy < s / 2 ? 26 : -26));
      ctx.stroke();
    }
    return wrap(canvas);
  });
}

/** The waving figure who pops up in the window (drawn against the right
 * edge so half of him stays hidden behind the frame, like the reference). */
export function windowFigureTexture(): THREE.CanvasTexture {
  return cached('windowFigure', () => {
    const s = 512;
    const { canvas, ctx } = makeCanvas(s, s);
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const cx = 300;
    const cy = 200;
    // head
    ctx.beginPath();
    ctx.arc(cx, cy, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // hair: swooping fringe
    ctx.beginPath();
    ctx.moveTo(cx - 78, cy - 6);
    ctx.quadraticCurveTo(cx - 66, cy - 96, cx + 26, cy - 80);
    ctx.quadraticCurveTo(cx + 82, cy - 66, cx + 76, cy + 6);
    ctx.quadraticCurveTo(cx + 48, cy - 34, cx + 6, cy - 40);
    ctx.quadraticCurveTo(cx - 48, cy - 44, cx - 78, cy - 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // glasses
    ctx.lineWidth = 4.5;
    for (const dx of [-30, 28]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + 8, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 8);
    ctx.lineTo(cx + 4, cy + 8);
    ctx.stroke();
    // eyes (dots) + smile
    ctx.fillStyle = '#2e2e2c';
    for (const dx of [-30, 28]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + 10, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 34, 22, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    // shoulders / tee
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - 96, 512);
    ctx.quadraticCurveTo(cx - 92, cy + 116, cx - 40, cy + 88);
    ctx.lineTo(cx + 44, cy + 88);
    ctx.quadraticCurveTo(cx + 92, cy + 112, cx + 96, 512);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // collar
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 92, 20, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    // waving arm, raised
    ctx.beginPath();
    ctx.moveTo(cx + 60, cy + 110);
    ctx.quadraticCurveTo(cx + 128, cy + 60, cx + 138, cy - 24);
    ctx.stroke();
    // hand + fingers
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + 142, cy - 44, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 3.5;
    for (let f = 0; f < 4; f++) {
      const a = -Math.PI / 2 - 0.5 + f * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx + 142 + Math.cos(a) * 16, cy - 44 + Math.sin(a) * 16);
      ctx.lineTo(cx + 142 + Math.cos(a) * 34, cy - 44 + Math.sin(a) * 34);
      ctx.stroke();
    }
    return wrap(canvas);
  });
}

/** Tree with cloud foliage; a computer mouse hangs from a branch by its
 * cable (separate texture so it can swing). */
export function treeTexture(): THREE.CanvasTexture {
  return cached('tree', () => {
    const w = 512;
    const h = 768;
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.fillStyle = PAPER;
    // trunk
    ctx.beginPath();
    ctx.moveTo(236, h);
    ctx.quadraticCurveTo(246, h - 190, 226, h - 330);
    ctx.quadraticCurveTo(222, h - 400, 250, h - 430);
    ctx.quadraticCurveTo(286, h - 396, 282, h - 320);
    ctx.quadraticCurveTo(272, h - 180, 292, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // bark strokes
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK_SOFT;
    const r = rng(13);
    for (let i = 0; i < 9; i++) {
      const y0 = h - 60 - r() * 300;
      ctx.beginPath();
      ctx.moveTo(244 + r() * 24, y0);
      ctx.quadraticCurveTo(250 + r() * 20, y0 - 30, 248 + r() * 24, y0 - 60);
      ctx.stroke();
    }
    // foliage: four overlapping cloud lobes, each filled THEN stroked
    // individually (not stroke-all-then-fill-all) so the seams where lobes
    // overlap stay visible as the cloud-like silhouette they're meant to be
    // — filling every lobe first would paint over every earlier outline.
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.fillStyle = 'rgba(240,239,232,0.94)';
    const lobes: [number, number, number][] = [
      [176, h - 470, 96],
      [268, h - 540, 118],
      [366, h - 470, 92],
      [258, h - 452, 104],
    ];
    for (const [x, y, rad] of lobes) {
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // branch to the right, drawn AFTER the foliage so the lobe fills (which
    // fully cover the branch's canvas region) don't paint over it — the
    // mouse needs to visibly hang from this stroke.
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(272, h - 380);
    ctx.quadraticCurveTo(360, h - 420, 420, h - 400);
    ctx.stroke();
    // leafy scribbles inside, thickened/darkened so they read at the
    // plane's actual on-screen size instead of vanishing into the fill
    ctx.strokeStyle = 'rgba(80,80,76,0.55)';
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 26; i++) {
      const l = lobes[Math.floor(r() * lobes.length)];
      const a = r() * Math.PI * 2;
      const rr = r() * l[2] * 0.7;
      const x = l[0] + Math.cos(a) * rr;
      const y = l[1] + Math.sin(a) * rr;
      ctx.beginPath();
      ctx.arc(x, y, 7 + r() * 8, Math.PI * 0.2, Math.PI * (0.9 + r() * 0.5));
      ctx.stroke();
    }
    return wrap(canvas);
  });
}

/** Computer mouse dangling by its cable (cable runs to the top edge). */
export function hangingMouseTexture(): THREE.CanvasTexture {
  return cached('mouse', () => {
    const w = 160;
    const h = 320;
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    // cable with a small coil
    ctx.beginPath();
    ctx.moveTo(80, 0);
    ctx.quadraticCurveTo(70, 60, 84, 96);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(80, 116, 14, -Math.PI / 2, Math.PI * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(72, 128);
    ctx.quadraticCurveTo(78, 158, 80, 186);
    ctx.stroke();
    // mouse body
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(80, 240, 42, 56, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // split + wheel
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(80, 186);
    ctx.lineTo(80, 232);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(44, 226);
    ctx.quadraticCurveTo(80, 214, 116, 226);
    ctx.stroke();
    ctx.strokeRect(74, 198, 12, 22);
    return wrap(canvas);
  });
}

/** Stone path receding toward the door. */
export function stonePathTexture(): THREE.CanvasTexture {
  return cached('stonePath', () => {
    const w = 512;
    const h = 512;
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.clearRect(0, 0, w, h);
    const r = rng(29);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#f1efe8';
    let y = 30;
    let rowIdx = 0;
    while (y < h - 20) {
      // smaller far away (top); capped so the nearest row doesn't blow up
      // past a size that reads as a collision with the fixed toast card
      // pinned to the bottom of the screen.
      const scale = Math.min(0.5 + (y / h) * 0.9, 0.85);
      const stones = 2 + (rowIdx % 2);
      for (let i = 0; i < stones; i++) {
        const sx = w / 2 + (i - (stones - 1) / 2) * 120 * scale + (r() - 0.5) * 40 * scale;
        const rw = (54 + r() * 26) * scale;
        const rh = (26 + r() * 12) * scale;
        ctx.lineWidth = 3 * scale;
        ctx.beginPath();
        // irregular pentagon-ish stone
        ctx.moveTo(sx - rw, sx % 2 ? y : y + 3 * scale);
        ctx.quadraticCurveTo(sx - rw * 0.6, y - rh, sx + rw * 0.3, y - rh * 0.9);
        ctx.quadraticCurveTo(sx + rw, y - rh * 0.3, sx + rw * 0.8, y + rh * 0.6);
        ctx.quadraticCurveTo(sx, y + rh, sx - rw * 0.7, y + rh * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // moss ticks
        ctx.lineWidth = 1.6 * scale;
        ctx.strokeStyle = INK_SOFT;
        for (let m = 0; m < 3; m++) {
          const mx = sx + (r() - 0.5) * rw * 1.6;
          ctx.beginPath();
          ctx.moveTo(mx, y + rh + 4 * scale);
          ctx.lineTo(mx + 3 * scale, y + rh + 10 * scale);
          ctx.stroke();
        }
        ctx.strokeStyle = INK;
      }
      y += 78 * scale;
      rowIdx += 1;
    }
    return wrap(canvas);
  });
}

/** Planter box with succulents and the rubber duck peeking out. */
export function planterTexture(): THREE.CanvasTexture {
  return cached('planter', () => {
    const w = 512;
    const h = 256;
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    // wooden box
    ctx.fillStyle = '#f2f0e9';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(16, 120);
    ctx.lineTo(w - 16, 120);
    ctx.lineTo(w - 34, h - 12);
    ctx.lineTo(34, h - 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // grain
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = INK_SOFT;
    const r = rng(3);
    for (let i = 0; i < 6; i++) {
      const y = 132 + i * 16;
      ctx.beginPath();
      ctx.moveTo(30 + r() * 30, y);
      ctx.quadraticCurveTo(w / 2, y + (r() - 0.5) * 8, w - 40 - r() * 30, y);
      ctx.stroke();
    }
    ctx.strokeStyle = INK;
    // succulents: spiky rosettes + round cactus
    ctx.lineWidth = 3;
    ctx.fillStyle = '#eef0e6';
    const plants = [70, 150, 340, 440];
    for (const px of plants) {
      const spikes = 7;
      for (let sp = 0; sp < spikes; sp++) {
        const a = Math.PI + (sp / (spikes - 1)) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(px, 118);
        ctx.quadraticCurveTo(px + Math.cos(a) * 26, 76 + Math.sin(a) * 14, px + Math.cos(a) * 40, 96 + Math.sin(a) * 26);
        ctx.stroke();
      }
    }
    // round cactus with cross hatch
    ctx.beginPath();
    ctx.arc(250, 92, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(250 + i * 10, 66);
      ctx.quadraticCurveTo(250 + i * 12, 92, 250 + i * 10, 118);
      ctx.stroke();
    }
    // rubber duck: body, head, beak — with the amber accent
    ctx.lineWidth = 3.5;
    ctx.fillStyle = '#efd9a0';
    ctx.beginPath();
    ctx.ellipse(398, 96, 34, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(376, 70, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e0a35f';
    ctx.beginPath();
    ctx.moveTo(358, 70);
    ctx.lineTo(344, 76);
    ctx.lineTo(358, 80);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2e2e2c';
    ctx.beginPath();
    ctx.arc(372, 66, 3, 0, Math.PI * 2);
    ctx.fill();
    return wrap(canvas);
  });
}

/** Little beetle bug that crawls on the wall. */
export function bugTexture(): THREE.CanvasTexture {
  return cached('bug', () => {
    const s = 128;
    const { canvas, ctx } = makeCanvas(s, s);
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#3a3a38';
    ctx.lineWidth = 3;
    // body
    ctx.beginPath();
    ctx.ellipse(64, 66, 20, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(64, 34, 10, 0, Math.PI * 2);
    ctx.fill();
    // legs
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      for (let l = 0; l < 3; l++) {
        const y = 50 + l * 14;
        ctx.beginPath();
        ctx.moveTo(64 + side * 16, y);
        ctx.quadraticCurveTo(64 + side * 34, y - 6, 64 + side * 42, y + 8);
        ctx.stroke();
      }
    }
    // antennae
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(64 + side * 5, 26);
      ctx.quadraticCurveTo(64 + side * 14, 12, 64 + side * 22, 8);
      ctx.stroke();
    }
    // wing split
    ctx.strokeStyle = 'rgba(250,250,245,0.8)';
    ctx.beginPath();
    ctx.moveTo(64, 44);
    ctx.lineTo(64, 90);
    ctx.stroke();
    return wrap(canvas);
  });
}

/** Ink splat + BUG FIXED! for the squashed bug. */
export function bugFixedTexture(): THREE.CanvasTexture {
  return cached('bugFixed', () => {
    const w = 512;
    const h = 256;
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.clearRect(0, 0, w, h);
    const r = rng(97);
    // splat blob
    ctx.fillStyle = '#3a3a38';
    ctx.beginPath();
    const cx = 110;
    const cy = 130;
    ctx.moveTo(cx + 34, cy);
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const rad = 22 + r() * 22;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    // droplets
    for (let i = 0; i < 8; i++) {
      const a = r() * Math.PI * 2;
      const d = 40 + r() * 46;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2.5 + r() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const draw = () => {
      ctx.font = `64px "${DRAFT_FONT_FAMILY}", cursive`;
      ctx.fillStyle = '#4a4a48';
      ctx.textBaseline = 'middle';
      ctx.fillText('BUG FIXED!', 190, 128);
      ctx.textBaseline = 'alphabetic';
    };
    const texture = wrap(canvas);
    draw();
    void ensureDraftFont().then(() => {
      draw();
      texture.needsUpdate = true;
    });
    return texture;
  });
}

/** Sticker sheet for the door: the stack, as little hand-cut labels. */
export function doorStickersTexture(labels: string[], seed = 5): THREE.CanvasTexture {
  return cached(`stickers/${labels.join(',')}`, () => {
    const w = 256;
    const h = 384;
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.clearRect(0, 0, w, h);
    const r = rng(seed);
    const colors = ['#e08a7d', '#d9b45f', '#8fb3d9', '#9dbd8f'];
    // columns centred symmetrically (w*0.29 / w*0.71) so neither column sits
    // closer to its canvas edge than the other — long labels ("Python",
    // "Airflow") always land in column 0 and need the extra headroom.
    const colX = [w * 0.29, w * 0.71];
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      labels.forEach((label, i) => {
        const x = colX[i % 2] + (r() - 0.5) * 18;
        const y = 46 + Math.floor(i / 2) * 92 + (r() - 0.5) * 18;
        const rot = (r() - 0.5) * 0.35;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        const pad = 10;
        const edgeMargin = 6;
        // shrink-to-fit: never let the pill's half-width exceed the actual
        // distance from this label's x to the nearer canvas edge, so long
        // labels never draw past the sticker sheet boundary (same pattern
        // as the shrink loops in blueprint/sketch.ts).
        const maxHalf = Math.min(x, w - x) - edgeMargin;
        let size = 26;
        ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
        while (ctx.measureText(label).width / 2 + pad > maxHalf && size > 14) {
          size -= 1;
          ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
        }
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = '#fdfcf8';
        ctx.strokeStyle = colors[i % colors.length];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-tw / 2 - pad, -20, tw + pad * 2, 40, 9);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#3a3a38';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
      });
    };
    const texture = wrap(canvas);
    draw();
    void ensureDraftFont().then(() => {
      draw();
      texture.needsUpdate = true;
    });
    return texture;
  });
}

/** The view through the open front door: the corridor's first metres —
 * receding floor planks, side walls, and the warm glow at the far end. */
export function doorwayHallTexture(): THREE.CanvasTexture {
  return cached('doorwayHall', () => {
    const w = 256;
    const h = 320;
    const { canvas, ctx } = makeCanvas(w, h);
    // dim interior wash, darker at the edges
    const g = ctx.createRadialGradient(w / 2, h * 0.52, 20, w / 2, h * 0.55, w * 0.85);
    g.addColorStop(0, '#efede6');
    g.addColorStop(0.35, '#c9c6bd');
    g.addColorStop(1, '#8f8d85');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // far-end glow
    ctx.fillStyle = 'rgba(250,248,240,0.9)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.52, 26, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    // converging floor plank lines
    ctx.strokeStyle = 'rgba(70,70,68,0.5)';
    ctx.lineWidth = 2;
    for (const x0 of [10, 52, 96, 160, 204, 246]) {
      ctx.beginPath();
      ctx.moveTo(x0, h);
      ctx.lineTo(w / 2 + (x0 - w / 2) * 0.12, h * 0.62);
      ctx.stroke();
    }
    // wall/ceiling corner lines
    ctx.strokeStyle = 'rgba(70,70,68,0.4)';
    for (const [x0, y0] of [[0, 40], [w, 40]] as const) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(w / 2 + (x0 - w / 2) * 0.12, h * 0.42);
      ctx.stroke();
    }
    // horizon line where floor meets far wall
    ctx.beginPath();
    ctx.moveTo(w * 0.36, h * 0.62);
    ctx.lineTo(w * 0.64, h * 0.62);
    ctx.stroke();
    return wrap(canvas);
  });
}

/** Grass tufts along the wall base, tileable horizontally. */
export function grassTexture(): THREE.CanvasTexture {
  return cached('grass', () => {
    const w = 512;
    const h = 64;
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(72,72,70,0.6)';
    ctx.lineWidth = 2;
    const r = rng(19);
    for (let x = 0; x < w; x += 7) {
      const tall = 10 + r() * 26;
      const lean = (r() - 0.5) * 10;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + lean * 0.4, h - tall * 0.6, x + lean, h - tall);
      ctx.stroke();
    }
    return wrap(canvas, true);
  });
}
