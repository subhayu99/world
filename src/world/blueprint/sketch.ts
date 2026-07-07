// Sketch-world texture generators, v2 — the itomdev-calibrated vocabulary.
// Everything is precise linework on near-white paper: soft grey fills, one
// darker sketch outline, colour only as a deliberate accent (hover wood,
// tape, stickers). No procedural wobble anywhere.

import * as THREE from 'three';
import { DRAFT_FONT_FAMILY } from './palette';
import { FONTS } from '../contracts';

// ---- shared helpers ----

let fontLoad: Promise<void> | null = null;
export function ensureDraftFont(): Promise<void> {
  if (fontLoad) return fontLoad;
  fontLoad = (async () => {
    try {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const face = new FontFace(DRAFT_FONT_FAMILY, `url(${base}${FONTS.draft})`);
      await face.load();
      document.fonts.add(face);
    } catch {
      // cursive fallback keeps rendering
    }
  })();
  return fontLoad;
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  return { canvas, ctx };
}

function wrap(canvas: HTMLCanvasElement, opts?: { repeat?: boolean }): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  if (opts?.repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

/** Deterministic rng so every render of the world looks identical.
 * Classic "Numerical Recipes" LCG constants (multiplier 9301, increment
 * 49297, modulus 233280). A previous version multiplied `a` by the modulus
 * instead of the multiplier on every call after the first, which is always
 * ≡ 0 (mod 233280) — collapsing every seed to the same constant output
 * after one call. That flattened wood-knot/grain placement, sign labels,
 * etc. to an identical spot regardless of seed; verify different seeds
 * produce visibly different output before assuming this is fine again. */
function rng(seed: number): () => number {
  let a = seed * 9301 + 49297;
  return () => ((a = (a * 9301 + 49297) % 233280) / 233280);
}

/** Session-lifetime texture cache: rooms remount on every entry, and
 * re-generating canvases each time both stutters and leaks GPU memory. */
const textureCache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  const hit = textureCache.get(key);
  if (hit) return hit;
  const t = make();
  textureCache.set(key, t);
  return t;
}
function cachedPlate<T>(key: string, make: () => T, store: Map<string, T>): T {
  const hit = store.get(key);
  if (hit) return hit;
  const t = make();
  store.set(key, t);
  return t;
}
const plateCache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

/** Redraw-on-font-load wrapper for textures that render text. */
function withFont(draw: () => void, texture: THREE.CanvasTexture): THREE.CanvasTexture {
  draw();
  void ensureDraftFont().then(() => {
    draw();
    texture.needsUpdate = true;
  });
  return texture;
}

// ---- ink shades (kept local: these are sketch values, not UI palette) ----

export const INK = {
  outline: 'rgba(72,72,70,0.9)', // main pen line
  soft: 'rgba(96,96,94,0.55)', // secondary line
  faint: 'rgba(110,110,108,0.3)', // hatching, grain
  fillLight: '#f0efe9', // cloud/prop fill
  fillMid: '#e6e4dc', // shaded side
  paper: '#faf9f4',
  woodGrey: '#e9e7e0', // uncoloured wood
  woodGreyLine: 'rgba(96,96,94,0.6)',
  woodBrown: '#c69a63', // coloured-pencil wood (hover)
  woodBrownDark: '#8a6238',
  ink: '#3a3a38',
} as const;

// ---- clouds ----

/**
 * Hand-drawn cumulus via circle union: stroke every lobe circle first, then
 * fill them all on top — interior strokes vanish under the fill, leaving one
 * clean outer outline. Big middle lobe + smaller sides + a stacked top lobe
 * gives real cumulus mass (never the "row of buns" look).
 */
function drawLobeCloud(ctx: CanvasRenderingContext2D, opts: {
  w: number;
  h: number;
  seed: number;
  outline: number;
  flat?: boolean; // low, elongated variant for distance
}): void {
  const { w, h, seed, outline, flat } = opts;
  const r = rng(seed);
  const gy = h * 0.78; // flat base line
  const midR = flat ? h * 0.2 : h * 0.3 + r() * h * 0.08;
  const lobes: { x: number; y: number; r: number }[] = [];
  // middle lobe
  lobes.push({ x: w * (0.46 + r() * 0.08), y: gy - midR * 0.72, r: midR });
  // side lobes, descending
  const sideCount = flat ? 3 : 2 + Math.floor(r() * 2);
  for (let i = 0; i < sideCount; i++) {
    const dir = i % 2 === 0 ? -1 : 1;
    const step = 0.8 + Math.floor(i / 2) * 0.75;
    const rr = midR * (flat ? 0.75 : 0.62 - Math.floor(i / 2) * 0.16) * (0.9 + r() * 0.25);
    lobes.push({ x: lobes[0].x + dir * (lobes[0].r * step + rr * 0.45), y: gy - rr * 0.68, r: rr });
  }
  // stacked top lobe for the big ones
  if (!flat) lobes.push({ x: lobes[0].x + (r() - 0.5) * midR * 0.7, y: gy - midR * 1.28, r: midR * 0.55 });

  const minX = Math.min(...lobes.map((l) => l.x - l.r)) + 6;
  const maxX = Math.max(...lobes.map((l) => l.x + l.r)) - 6;

  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK.outline;
  ctx.lineWidth = outline * 2;
  // 1) stroke everything (interior strokes get buried next)
  for (const l of lobes) {
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeRect(minX, gy - 16, maxX - minX, 16);
  // 2) fill union on top
  const grad = ctx.createLinearGradient(0, gy - midR * 2, 0, gy);
  grad.addColorStop(0, '#f6f5f0');
  grad.addColorStop(1, '#e3e1d9');
  ctx.fillStyle = grad;
  for (const l of lobes) {
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(minX, gy - 16, maxX - minX, 16);
  // 3) soft inner base shade, clipped to the union
  ctx.save();
  ctx.beginPath();
  for (const l of lobes) {
    ctx.moveTo(l.x + l.r, l.y);
    ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
  }
  ctx.rect(minX, gy - 16, maxX - minX, 16);
  ctx.clip();
  ctx.fillStyle = 'rgba(120,120,118,0.16)';
  ctx.beginPath();
  ctx.ellipse((minX + maxX) / 2, gy - 2, (maxX - minX) / 2, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function cumulusTextureImpl(seed = 1, opts?: { outline?: number }): THREE.CanvasTexture {
  const w = 512;
  const h = 340;
  const { canvas, ctx } = makeCanvas(w, h);
  drawLobeCloud(ctx, { w, h, seed, outline: opts?.outline ?? 4.5 });
  return wrap(canvas);
}

/** Low, elongated far-distance cloud (same technique, flatter). */
function wispTextureImpl(seed = 1): THREE.CanvasTexture {
  const w = 512;
  const h = 200;
  const { canvas, ctx } = makeCanvas(w, h);
  drawLobeCloud(ctx, { w, h, seed: seed + 40, outline: 3, flat: true });
  return wrap(canvas);
}

// ---- wood ----

export interface WoodOpts {
  colored?: boolean;
  planks?: number; // vertical separations, 0 = single board
  horizontal?: boolean; // grain direction
  w?: number;
  h?: number;
  seed?: number;
  /** Draw the long grain lines running along the height axis instead of the
   * width axis — for narrow/tall geometry (e.g. a frame's vertical batten)
   * where the default wide/short grain would alias into a horizontal comb
   * pattern when mapped onto a tall, narrow face. */
  vertical?: boolean;
  /** Override the number of knots drawn (default: 1-3, randomised). Pass 0
   * to suppress knots entirely — useful when the wood backs a UI overlay
   * (e.g. a sticker sheet) that doesn't fully cover the face, so a knot
   * can't bleed through a transparent gap in the overlay. */
  knots?: number;
}

/**
 * Hand-drawn wood: light base, long wavy grain lines, occasional knots,
 * optional plank separations. Colored variant = warm colored-pencil browns
 * with diagonal hatch (the itomdev hover-colored door/sign look).
 */
function woodTextureImpl(opts: WoodOpts = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 256;
  const { canvas, ctx } = makeCanvas(w, h);
  const r = rng(opts.seed ?? 7);
  const colored = opts.colored ?? false;

  ctx.fillStyle = colored ? INK.woodBrown : INK.woodGrey;
  ctx.fillRect(0, 0, w, h);

  // colored-pencil hatching (diagonal, low alpha) sells the "crayon" fill
  if (colored) {
    ctx.strokeStyle = 'rgba(138,98,56,0.18)';
    ctx.lineWidth = 3;
    for (let x = -h; x < w + h; x += 7) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h * 0.35, h);
      ctx.stroke();
    }
  }

  const grainColor = colored ? 'rgba(122,82,44,0.75)' : INK.woodGreyLine;
  const knotColor = colored ? 'rgba(106,70,36,0.85)' : 'rgba(88,88,86,0.7)';

  // grain: sparse long wavy lines (dense rows read as ruled paper). Runs
  // along whichever axis is the face's long dimension so it never aliases
  // into a repeating cross-grain comb pattern on narrow/tall geometry.
  const lines = 4 + Math.floor(r() * 3);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < lines; i++) {
    ctx.strokeStyle = grainColor;
    ctx.beginPath();
    if (opts.vertical) {
      const x = (w * (i + 0.5)) / lines + (r() - 0.5) * 18;
      ctx.moveTo(x, 0);
      let y = 0;
      while (y < h) {
        const ny = y + 40 + r() * 60;
        const nx = x + (r() - 0.5) * 10;
        ctx.quadraticCurveTo(x + (r() - 0.5) * 14, y + (ny - y) / 2, nx, ny);
        y = ny;
      }
    } else {
      const y = (h * (i + 0.5)) / lines + (r() - 0.5) * 18;
      ctx.moveTo(0, y);
      let x = 0;
      while (x < w) {
        const nx = x + 40 + r() * 60;
        const ny = y + (r() - 0.5) * 10;
        ctx.quadraticCurveTo(x + (nx - x) / 2, y + (r() - 0.5) * 14, nx, ny);
        x = nx;
      }
    }
    ctx.stroke();
  }

  // knots
  const knots = opts.knots ?? 1 + Math.floor(r() * 3);
  for (let i = 0; i < knots; i++) {
    const kx = w * (0.15 + r() * 0.7);
    const ky = h * (0.2 + r() * 0.6);
    ctx.strokeStyle = knotColor;
    ctx.lineWidth = 1.4;
    for (let ring = 0; ring < 3; ring++) {
      ctx.beginPath();
      ctx.ellipse(kx, ky, 4 + ring * 4, 2.4 + ring * 2.6, r() * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // plank separations
  if (opts.planks && opts.planks > 0) {
    ctx.strokeStyle = colored ? 'rgba(106,70,36,0.9)' : 'rgba(80,80,78,0.75)';
    ctx.lineWidth = 3;
    for (let i = 1; i < opts.planks; i++) {
      const x = (w * i) / opts.planks;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      // nail dots at top/bottom of each plank
      ctx.fillStyle = ctx.strokeStyle;
      const px = x - w / opts.planks / 2;
      for (const ny of [h * 0.08, h * 0.92]) {
        ctx.beginPath();
        ctx.arc(px, ny, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return wrap(canvas, { repeat: true });
}

/** A wooden sign board: wood + border + engraved centred label. */
function signTextureImpl(label: string, opts?: { colored?: boolean; w?: number; h?: number }): THREE.CanvasTexture {
  const w = opts?.w ?? 512;
  const h = opts?.h ?? 170;
  const colored = opts?.colored ?? false;
  const { canvas, ctx } = makeCanvas(w, h);

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    // board face (reuse wood drawing inline for exact fit)
    const wood = woodTextureImpl({ colored, w: 256, h: 128, seed: label.length * 3 + 5 });
    ctx.drawImage(wood.image as HTMLCanvasElement, 0, 0, w, h);
    wood.dispose();
    // border
    ctx.strokeStyle = colored ? 'rgba(96,62,30,0.95)' : 'rgba(72,72,70,0.85)';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    // engraved label
    let size = h * 0.42;
    ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
    while (ctx.measureText(label).width > w - 70 && size > 18) {
      size -= 2;
      ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // engrave: light offset + dark main
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(label, w / 2 + 1.5, h / 2 + 2.5);
    ctx.fillStyle = colored ? '#4c3014' : '#3f3f3d';
    ctx.fillText(label, w / 2, h / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  return withFont(draw, wrap(canvas));
}

// ---- sea ----

/** Tileable swirly hand-drawn sea (dense wave curls, grey on near-white). */
function seaTextureImpl(seed = 11): THREE.CanvasTexture {
  const s = 512;
  const { canvas, ctx } = makeCanvas(s, s);
  const r = rng(seed);
  ctx.fillStyle = '#f8f7f2';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(80,80,78,0.75)';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';

  const drawCurl = (x: number, y: number, len: number, amp: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    // a stroke that runs right and hooks into a curl at the end
    ctx.bezierCurveTo(x + len * 0.4, y - amp, x + len * 0.7, y + amp * 0.4, x + len, y);
    ctx.stroke();
    // the curl hook
    ctx.beginPath();
    ctx.arc(x + len, y - amp * 0.35, amp * 0.8, Math.PI * 0.2, Math.PI * 1.35, false);
    ctx.stroke();
  };

  // jittered grid so every region of the tile has the same stroke density —
  // free placement clusters, and clusters repeat as visible banding.
  const rows = 12;
  const cols = 7;
  for (let row = 0; row < rows; row++) {
    ctx.lineWidth = 3.4;
    for (let col = 0; col < cols; col++) {
      const x = (s * (col + r() * 0.8)) / cols;
      const y = (s * (row + r() * 0.8)) / rows;
      const len = 34 + r() * 42;
      const amp = 7 + r() * 8;
      // draw with wrap duplication so the tile seams stay clean
      for (const dx of [0, -s, s]) {
        for (const dy of [0, -s, s]) {
          drawCurl(x + dx, y + dy, len, amp);
        }
      }
    }
    // interleaved plain strokes on their own jittered grid
    ctx.lineWidth = 2.2;
    for (let col = 0; col < cols * 2; col++) {
      const x = (s * (col + r())) / (cols * 2);
      const y = (s * (row + 0.4 + r() * 0.6)) / rows;
      const len = 16 + r() * 24;
      for (const dx of [0, -s, s]) {
        ctx.beginPath();
        ctx.moveTo(x + dx, y);
        ctx.quadraticCurveTo(x + dx + len / 2, y - 5 - r() * 5, x + dx + len, y);
        ctx.stroke();
      }
    }
  }
  return wrap(canvas, { repeat: true });
}

// ---- big outlined display titles ----

/**
 * Fat outlined bubble letters ("JOURNEY", "SKILLS") — white fill, dark
 * outline, faint doubled inner line. subStyle renders a plain grey
 * handwriting line instead (for the small caption under a title).
 */
function outlineTitleTextureImpl(text: string, opts?: { subStyle?: boolean; fill?: string }): { texture: THREE.CanvasTexture; aspect: number } {
  const size = opts?.subStyle ? 64 : 190;
  const probe = makeCanvas(4, 4).ctx;
  probe.font = `${opts?.subStyle ? '' : 'bold '}${size}px "${DRAFT_FONT_FAMILY}", cursive`;
  // measured before the draft font loads — pad generously so the post-load
  // redraw (wider glyphs) never clips; extra transparent margin is harmless
  const tw = Math.ceil(probe.measureText(opts?.subStyle ? text : text.toUpperCase()).width * 1.35);
  const w = tw + (opts?.subStyle ? 40 : 120);
  const h = opts?.subStyle ? 110 : 300;
  const { canvas, ctx } = makeCanvas(w, h);

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = h / 2;
    ctx.lineJoin = 'round';
    if (opts?.subStyle) {
      ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
      ctx.fillStyle = 'rgba(88,88,86,0.9)';
      ctx.fillText(text, w / 2, y);
    } else {
      ctx.font = `bold ${size}px "${DRAFT_FONT_FAMILY}", cursive`;
      // outline pass
      ctx.strokeStyle = '#4a4a48';
      ctx.lineWidth = 14;
      ctx.strokeText(text.toUpperCase(), w / 2, y);
      // body over it — leaves a single clean outer contour
      const fill = opts?.fill ?? '#fbfaf6';
      ctx.fillStyle = fill;
      ctx.strokeStyle = fill;
      ctx.lineWidth = 7;
      ctx.strokeText(text.toUpperCase(), w / 2, y);
      ctx.fillText(text.toUpperCase(), w / 2, y);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  return { texture: withFont(draw, wrap(canvas)), aspect: w / h };
}

// ---- balloons ----

/** Balloon with soft shading, highlight, knot and a short label. */
function balloonTextureImpl(label: string, seed = 1): THREE.CanvasTexture {
  const w = 256;
  const h = 320;
  const { canvas, ctx } = makeCanvas(w, h);
  const r = rng(seed + 90);

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.42;
    const rx = w * 0.36;
    const ry = h * 0.36;
    // body
    const grad = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, rx * 0.2, cx, cy, rx * 1.25);
    grad.addColorStop(0, '#f6f5f0');
    grad.addColorStop(1, '#dcdad2');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK.outline;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    // highlight arc
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.3, cy - ry * 0.35, rx * 0.35, ry * 0.3, -0.6, Math.PI * 1.05, Math.PI * 1.65);
    ctx.stroke();
    // knot
    ctx.fillStyle = '#dcdad2';
    ctx.strokeStyle = INK.outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy + ry - 2);
    ctx.lineTo(cx - 9, cy + ry + 14);
    ctx.lineTo(cx + 9, cy + ry + 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // label: fit on one line down to a legible floor; a long single-word
    // skill name (e.g. "Terraform") that still doesn't fit at the floor
    // wraps onto two lines instead of shrinking further toward illegibility.
    const maxWidth = rx * 1.6;
    const minSize = 24;
    let size = 44;
    ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
    while (ctx.measureText(label).width > maxWidth && size > minSize) {
      size -= 2;
      ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
    }
    let lines = [label];
    if (ctx.measureText(label).width > maxWidth) {
      const mid = Math.ceil(label.length / 2);
      const spaceIdx = label.lastIndexOf(' ', mid + 2);
      let splitAt = spaceIdx > 0 ? spaceIdx : -1;
      if (splitAt < 0) {
        // no natural word break (single word): pick the character split
        // that best balances the two halves' widths.
        let bestDiff = Infinity;
        for (let i = 2; i < label.length - 1; i++) {
          const diff = Math.abs(ctx.measureText(label.slice(0, i)).width - ctx.measureText(label.slice(i)).width);
          if (diff < bestDiff) {
            bestDiff = diff;
            splitAt = i;
          }
        }
      }
      if (splitAt > 0) {
        lines = [label.slice(0, splitAt).trim(), label.slice(splitAt).trim()];
        // two shorter lines can afford a bigger font than the one-line floor
        size = Math.min(32, size + 8);
        ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
        while (
          (ctx.measureText(lines[0]).width > maxWidth || ctx.measureText(lines[1]).width > maxWidth) &&
          size > minSize
        ) {
          size -= 2;
          ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
        }
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#4a4a48';
    const lineHeight = size * 1.05;
    const startY = cy + (r() - 0.5) * 4 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, cx, startY + i * lineHeight));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  return withFont(draw, wrap(canvas));
}

// ---- parcels (cardboard) ----

/** Cardboard parcel face: kraft base, edge lines, tape, marker label. */
function parcelTextureImpl(label: string, opts?: { colored?: boolean; face?: 'front' | 'top' | 'side' }): THREE.CanvasTexture {
  const s = 256;
  const { canvas, ctx } = makeCanvas(s, s);
  const colored = opts?.colored ?? false;
  const face = opts?.face ?? 'front';

  const draw = () => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = colored ? '#d9b98c' : '#eceae2';
    ctx.fillRect(0, 0, s, s);
    if (colored) {
      // colored-pencil hatch
      ctx.strokeStyle = 'rgba(160,116,64,0.2)';
      ctx.lineWidth = 2.5;
      for (let x = -s; x < s * 2; x += 6) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + s * 0.3, s);
        ctx.stroke();
      }
    }
    const line = colored ? 'rgba(140,96,48,0.9)' : 'rgba(88,88,86,0.8)';
    ctx.strokeStyle = line;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, s - 8, s - 8);

    if (face === 'top') {
      // flap seam + tape strip
      ctx.beginPath();
      ctx.moveTo(s / 2, 8);
      ctx.lineTo(s / 2, s - 8);
      ctx.stroke();
      ctx.fillStyle = colored ? 'rgba(224,138,125,0.85)' : 'rgba(200,198,190,0.9)';
      ctx.fillRect(s / 2 - 22, 0, 44, s);
      ctx.strokeStyle = colored ? 'rgba(180,100,88,0.9)' : 'rgba(120,120,118,0.8)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(s / 2 - 22, -2, 44, s + 4);
    } else if (face === 'side') {
      // plain kraft with a few grain flecks + a small stamp doodle
      const r = rng(label.length * 13 + 5);
      ctx.strokeStyle = colored ? 'rgba(140,96,48,0.4)' : 'rgba(110,110,108,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const x = 24 + r() * (s - 48);
        const y = 24 + r() * (s - 48);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 12, y + 4, x + 22 + r() * 14, y + (r() - 0.5) * 8);
        ctx.stroke();
      }
      // round "checked" stamp
      ctx.strokeStyle = colored ? 'rgba(160,90,78,0.75)' : 'rgba(120,120,118,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s * 0.7, s * 0.3, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.7 - 12, s * 0.3);
      ctx.lineTo(s * 0.7 - 2, s * 0.3 + 10);
      ctx.lineTo(s * 0.7 + 14, s * 0.3 - 12);
      ctx.stroke();
    } else {
      // marker label
      let size = 40;
      ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
      while (ctx.measureText(label).width > s - 48 && size > 14) {
        size -= 2;
        ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colored ? '#4c3014' : '#3f3f3d';
      ctx.fillText(label, s / 2, s * 0.4);
      // "this side up" arrows doodle
      ctx.strokeStyle = line;
      ctx.lineWidth = 3;
      for (const ax of [s * 0.32, s * 0.68]) {
        ctx.beginPath();
        ctx.moveTo(ax, s * 0.78);
        ctx.lineTo(ax, s * 0.62);
        ctx.moveTo(ax - 8, s * 0.7);
        ctx.lineTo(ax, s * 0.62);
        ctx.lineTo(ax + 8, s * 0.7);
        ctx.stroke();
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  };

  return withFont(draw, wrap(canvas));
}

// ---- certificates (awards) ----

function certificateTextureImpl(title: string, issuer: string, year: string, seed = 1): THREE.CanvasTexture {
  const w = 460;
  const h = 320;
  const { canvas, ctx } = makeCanvas(w, h);

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fbfaf5';
    ctx.fillRect(0, 0, w, h);
    // double border with corner ticks
    ctx.strokeStyle = 'rgba(72,72,70,0.9)';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    // laurel rosette
    const cx = w / 2;
    const cy = 92;
    ctx.strokeStyle = 'rgba(72,72,70,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.stroke();
    // star in rosette
    ctx.fillStyle = '#d9b45f';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * i) / 5 - Math.PI / 2;
      const rad = i % 2 === 0 ? 16 : 7;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(72,72,70,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // laurel branches
    ctx.strokeStyle = 'rgba(72,72,70,0.7)';
    ctx.lineWidth = 2.5;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + dir * 44, cy + 6, 26, dir === -1 ? Math.PI * 0.4 : Math.PI * 0.35, dir === -1 ? Math.PI * 1.15 : Math.PI * 0.9 + Math.PI * 0.75);
      ctx.stroke();
      for (let leaf = 0; leaf < 4; leaf++) {
        const ang = Math.PI * (0.55 + leaf * 0.18);
        const lx = cx + dir * (44 - Math.cos(ang) * 26 * dir);
        const ly = cy + 6 - Math.sin(ang) * 26;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 6, 2.6, ang * dir, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // title
    let size = 42;
    ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
    while (ctx.measureText(title.toUpperCase()).width > w - 70 && size > 20) {
      size -= 2;
      ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3a3a38';
    ctx.fillText(title.toUpperCase(), w / 2, 176);
    // issuer
    ctx.font = `24px "${DRAFT_FONT_FAMILY}", cursive`;
    ctx.fillStyle = 'rgba(74,74,72,0.75)';
    ctx.fillText(issuer, w / 2, 216);
    // year chip
    ctx.font = `26px "${DRAFT_FONT_FAMILY}", cursive`;
    ctx.fillStyle = '#e08a7d';
    ctx.fillText(year, w / 2, 262);
    ctx.textAlign = 'left';
  };

  return withFont(draw, wrap(canvas));
}

// ---- pier planks ----

/** First-person pier deck: long planks running away from camera. */
function pierTextureImpl(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const { canvas, ctx } = makeCanvas(w, h);
  const r = rng(23);
  ctx.fillStyle = '#efede5';
  ctx.fillRect(0, 0, w, h);
  const planks = 7;
  for (let i = 0; i < planks; i++) {
    const x0 = (w * i) / planks;
    const pw = w / planks;
    // subtle per-plank tone
    ctx.fillStyle = i % 2 === 0 ? '#efede5' : '#eae8df';
    ctx.fillRect(x0, 0, pw, h);
    // grain along the plank (vertical = away from camera)
    ctx.strokeStyle = 'rgba(96,96,94,0.4)';
    ctx.lineWidth = 1.6;
    const lines = 3 + Math.floor(r() * 3);
    for (let l = 0; l < lines; l++) {
      const x = x0 + pw * (0.2 + r() * 0.6);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      let y = 0;
      while (y < h) {
        const ny = y + 60 + r() * 80;
        ctx.quadraticCurveTo(x + (r() - 0.5) * 8, y + (ny - y) / 2, x + (r() - 0.5) * 4, ny);
        y = ny;
      }
      ctx.stroke();
    }
    // plank edges
    ctx.strokeStyle = 'rgba(72,72,70,0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, h);
    ctx.stroke();
    // nails
    ctx.fillStyle = 'rgba(80,80,78,0.8)';
    for (const ny of [h * 0.06, h * 0.5, h * 0.94]) {
      ctx.beginPath();
      ctx.arc(x0 + pw / 2, ny + (r() - 0.5) * 10, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return wrap(canvas, { repeat: true });
}

// ---- barrel ----

function barrelTextureImpl(colored = false): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const { canvas, ctx } = makeCanvas(w, h);
  const r = rng(31);
  ctx.fillStyle = colored ? '#c69a63' : '#e9e7e0';
  ctx.fillRect(0, 0, w, h);
  // staves
  const staves = 8;
  ctx.strokeStyle = colored ? 'rgba(122,82,44,0.8)' : 'rgba(88,88,86,0.65)';
  ctx.lineWidth = 2.5;
  for (let i = 1; i < staves; i++) {
    const x = (w * i) / staves;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  // grain dashes
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const y = r() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 6, y + 8, x + 3, y + 18 + r() * 10);
    ctx.stroke();
  }
  // metal hoops
  ctx.fillStyle = colored ? 'rgba(94,94,92,0.95)' : 'rgba(120,120,118,0.9)';
  for (const y of [h * 0.16, h * 0.84]) {
    ctx.fillRect(0, y - 9, w, 18);
    ctx.strokeStyle = 'rgba(60,60,58,0.9)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-2, y - 9, w + 4, 18);
  }
  return wrap(canvas, { repeat: true });
}

// ---- lighthouse body ----

function lighthouseTextureImpl(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const { canvas, ctx } = makeCanvas(w, h);
  // white body with grey spiral stripes + brick hints
  ctx.fillStyle = '#f4f2ec';
  ctx.fillRect(0, 0, w, h);
  // side shading so the cylinder reads round even without lighting
  const shade = ctx.createLinearGradient(0, 0, w, 0);
  shade.addColorStop(0, 'rgba(110,110,108,0.28)');
  shade.addColorStop(0.35, 'rgba(110,110,108,0)');
  shade.addColorStop(0.75, 'rgba(110,110,108,0)');
  shade.addColorStop(1, 'rgba(110,110,108,0.3)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(120,120,118,0.8)';
  const stripes = 4;
  for (let i = 0; i < stripes; i++) {
    const y = (h * (i + 0.35)) / stripes;
    ctx.save();
    ctx.translate(0, y);
    ctx.transform(1, -0.06, 0, 1, 0, 0); // slight diagonal wrap
    ctx.fillRect(0, 0, w, h / stripes / 2.6);
    ctx.restore();
  }
  // sketch outline hatching on edges
  ctx.strokeStyle = 'rgba(88,88,86,0.5)';
  ctx.lineWidth = 1.6;
  const r = rng(17);
  for (let i = 0; i < 30; i++) {
    const x = r() * w;
    const y = r() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2 + r() * 5, y + 6 + r() * 8);
    ctx.stroke();
  }
  return wrap(canvas);
}

// ---- rock (islands / lighthouse base) ----

function rockTextureImpl(seed = 3): THREE.CanvasTexture {
  const s = 256;
  const { canvas, ctx } = makeCanvas(s, s);
  const r = rng(seed + 55);
  ctx.fillStyle = '#d9d6cd';
  ctx.fillRect(0, 0, s, s);
  // facet shading patches
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(110,110,108,${0.12 + r() * 0.16})`;
    ctx.beginPath();
    const x = r() * s;
    const y = r() * s;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 30 + r() * 60, y + 10 + r() * 30);
    ctx.lineTo(x + 10 + r() * 40, y + 40 + r() * 50);
    ctx.closePath();
    ctx.fill();
  }
  // crack lines
  ctx.strokeStyle = 'rgba(88,88,86,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const x = r() * s;
    const y = r() * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 70, y + 20 + r() * 40);
    ctx.lineTo(x + (r() - 0.5) * 90, y + 50 + r() * 60);
    ctx.stroke();
  }
  return wrap(canvas, { repeat: true });
}

// ---- door panel ----

/** Panelled wooden door: wood base, 2x2 raised panels, knob. Colored
 * variant is the colored-pencil brown the door takes on hover. */
function doorTextureImpl(colored: boolean): THREE.CanvasTexture {
  const w = 256;
  const h = 384;
  const { canvas, ctx } = makeCanvas(w, h);
  // wood base (reuse the generator at door aspect). knots suppressed: the
  // door sticker sheet (Entrance.tsx) overlays most of this face but leaves
  // transparent gaps between individual stickers, and a knot drawn under
  // those gaps reads as a stray icon glued onto whichever sticker it lands
  // beside (see doorTexture()'s cache-by-`colored`-only note below — both
  // panels reuse this exact texture, so a knot would show up identically on
  // both doors).
  const wood = woodTextureImpl({ colored, w, h, seed: 9, knots: 0 });
  ctx.drawImage(wood.image as HTMLCanvasElement, 0, 0);
  wood.dispose();
  const line = colored ? 'rgba(96,62,30,0.95)' : 'rgba(72,72,70,0.85)';
  // outer frame
  ctx.strokeStyle = line;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  // 2x2 raised panels
  ctx.lineWidth = 3.5;
  const px = [22, w / 2 + 12];
  const py = [26, h / 2 + 16];
  const pw = w / 2 - 36;
  const ph = h / 2 - 44;
  for (const x of px) {
    for (const y of py) {
      ctx.strokeRect(x, y, pw, ph);
      ctx.strokeStyle = colored ? 'rgba(96,62,30,0.4)' : 'rgba(72,72,70,0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 8, y + 8, pw - 16, ph - 16);
      ctx.strokeStyle = line;
      ctx.lineWidth = 3.5;
    }
  }
  // knob
  ctx.fillStyle = colored ? '#8a6238' : '#b8b6ae';
  ctx.beginPath();
  ctx.arc(w - 34, h / 2 + 6, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  return wrap(canvas);
}

export function doorTexture(colored = false): THREE.CanvasTexture {
  return cached(`door/${colored}`, () => doorTextureImpl(colored));
}

// ---- the quantum cat ----

/** Eye centres in cat-texture UV (0..1, y down) — EasterEggProp places the
 * cursor-tracking pupil meshes at exactly these spots. */
export const CAT_EYES = {
  left: { u: 0.407, v: 0.36 },
  right: { u: 0.593, v: 0.36 },
  /** pupil wander radius as a fraction of plane size */
  radius: 0.02,
} as const;

/** A sitting cat, drawn clean (head, ears, body, tail, whiskers) with big
 * white eyes left empty — the pupils are separate meshes that follow the
 * cursor. */
function catTextureImpl(): THREE.CanvasTexture {
  const s = 256;
  const { canvas, ctx } = makeCanvas(s, s);
  ctx.strokeStyle = 'rgba(58,58,56,0.95)';
  ctx.fillStyle = '#f4f2ec';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';

  // body: rounded pear sitting on the ground
  ctx.beginPath();
  ctx.moveTo(88, 232);
  ctx.bezierCurveTo(70, 170, 84, 132, 128, 128);
  ctx.bezierCurveTo(172, 132, 186, 170, 168, 232);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // tail curling to the right
  ctx.beginPath();
  ctx.moveTo(168, 220);
  ctx.bezierCurveTo(210, 214, 222, 186, 206, 168);
  ctx.stroke();
  // head
  ctx.beginPath();
  ctx.arc(128, 92, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // ears
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(128 + dir * 22, 48);
    ctx.lineTo(128 + dir * 44, 22);
    ctx.lineTo(128 + dir * 48, 56);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // eyes: big whites, pupils live as meshes
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(128 + dir * 24, 92, 14, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(58,58,56,0.95)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  // nose + mouth
  ctx.fillStyle = '#e08a7d';
  ctx.beginPath();
  ctx.moveTo(128, 108);
  ctx.lineTo(122, 116);
  ctx.lineTo(134, 116);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(58,58,56,0.8)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(128, 116);
  ctx.lineTo(128, 124);
  ctx.moveTo(128, 124);
  ctx.quadraticCurveTo(120, 130, 112, 126);
  ctx.moveTo(128, 124);
  ctx.quadraticCurveTo(136, 130, 144, 126);
  ctx.stroke();
  // whiskers
  ctx.lineWidth = 2;
  for (const dir of [-1, 1]) {
    for (const dy of [-4, 2, 8]) {
      ctx.beginPath();
      ctx.moveTo(128 + dir * 40, 108 + dy * 0.6);
      ctx.lineTo(128 + dir * 74, 104 + dy);
      ctx.stroke();
    }
  }
  // front paws line
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(112, 232);
  ctx.lineTo(112, 200);
  ctx.moveTo(144, 232);
  ctx.lineTo(144, 200);
  ctx.stroke();
  return wrap(canvas);
}

// ---- binary doodle ----

function binaryTextureImpl(seed = 1): THREE.CanvasTexture {
  const w = 220;
  const h = 80;
  const { canvas, ctx } = makeCanvas(w, h);
  const r = rng(seed + 77);
  const bits = Array.from({ length: 6 + Math.floor(r() * 4) }, () => (r() > 0.5 ? '1' : '0')).join('');
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = `44px "${DRAFT_FONT_FAMILY}", cursive`;
    ctx.fillStyle = 'rgba(110,110,108,0.4)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bits, w / 2, h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };
  return withFont(draw, wrap(canvas));
}

// ---- cached public API ----
// One texture per unique argument set for the whole session; never dispose
// these from consumers (rooms remount on every entry and share them).

export function cumulusTexture(seed = 1, opts?: { outline?: number }): THREE.CanvasTexture {
  return cached(`cumulus/${seed}/${opts?.outline ?? 5}`, () => cumulusTextureImpl(seed, opts));
}
export function wispTexture(seed = 1): THREE.CanvasTexture {
  return cached(`wisp/${seed}`, () => wispTextureImpl(seed));
}
export function woodTexture(opts: WoodOpts = {}): THREE.CanvasTexture {
  return cached(`wood/${JSON.stringify(opts)}`, () => woodTextureImpl(opts));
}
export function signTexture(label: string, opts?: { colored?: boolean; w?: number; h?: number }): THREE.CanvasTexture {
  return cached(`sign/${label}/${JSON.stringify(opts ?? {})}`, () => signTextureImpl(label, opts));
}
export function seaTexture(seed = 11): THREE.CanvasTexture {
  return cached(`sea/${seed}`, () => seaTextureImpl(seed));
}
export function outlineTitleTexture(text: string, opts?: { subStyle?: boolean; fill?: string }): { texture: THREE.CanvasTexture; aspect: number } {
  return cachedPlate(`title/${text}/${opts?.subStyle ?? false}/${opts?.fill ?? ''}`, () => outlineTitleTextureImpl(text, opts), plateCache);
}
export function balloonTexture(label: string, seed = 1): THREE.CanvasTexture {
  return cached(`balloon/${label}/${seed}`, () => balloonTextureImpl(label, seed));
}
export function parcelTexture(label: string, opts?: { colored?: boolean; face?: 'front' | 'top' | 'side' }): THREE.CanvasTexture {
  return cached(`parcel/${label}/${JSON.stringify(opts ?? {})}`, () => parcelTextureImpl(label, opts));
}
export function certificateTexture(title: string, issuer: string, year: string, seed = 1): THREE.CanvasTexture {
  return cached(`cert/${title}/${seed}`, () => certificateTextureImpl(title, issuer, year, seed));
}
export function pierTexture(): THREE.CanvasTexture {
  return cached('pier', () => pierTextureImpl());
}
export function barrelTexture(colored = false): THREE.CanvasTexture {
  return cached(`barrel/${colored}`, () => barrelTextureImpl(colored));
}
export function lighthouseTexture(): THREE.CanvasTexture {
  return cached('lighthouse', () => lighthouseTextureImpl());
}
export function rockTexture(seed = 3): THREE.CanvasTexture {
  return cached(`rock/${seed}`, () => rockTextureImpl(seed));
}
export function binaryTexture(seed = 1): THREE.CanvasTexture {
  return cached(`binary/${seed}`, () => binaryTextureImpl(seed));
}
export function catTexture(): THREE.CanvasTexture {
  return cached('cat', () => catTextureImpl());
}
