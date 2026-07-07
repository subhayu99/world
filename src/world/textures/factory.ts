// TextureFactory implementation (contracts.ts): all notebook art is drawn
// procedurally onto a canvas at runtime — no image files, no CDN fonts.
//
// Nothing in this module touches a canvas, FontFace, or `document` at import
// time; every side effect happens lazily inside get()/text()/card(), so
// importing this file is always safe (including under vitest/happy-dom,
// which has no real 2D canvas backend).
//
// ---- card(): the composed-card texture API (punchlist #1) ----
//
// The single most-repeated defect across all 8 design-judge reports was a
// shared pattern: a card's title/body/doodle-icon are each rendered as their
// *own* texture (via separate `text()`/`get()` calls) and then stacked as
// separate mesh planes at hand-picked offsets (see rooms/Journey.tsx's
// per-beat note for the canonical example of this). Every plane sizes and
// positions itself independently of what the others actually rendered, so a
// long title/body routinely overlaps the fold icon or bleeds past the
// card's edge — there is no single place that knows the card's full content
// and can keep it all inside one padded box.
//
// `card()` is that single place: it draws an ENTIRE card — sheet backdrop,
// title, an optional accent-colored metric line, body copy, and an optional
// small doodle icon clear of the text — onto ONE canvas, and returns ONE
// texture. Callers apply it to a single mesh plane sized to the same aspect
// ratio as the requested `w`/`h` (e.g. a `[w/h * worldHeight, worldHeight]`
// PlaneGeometry) instead of assembling a stack of independently-sized
// planes. Title/metric/body text each auto-fit via textures/layout.ts's
// `autoFitText`: font size shrinks stepwise (max 3 steps) before wrapping,
// and text is clipped with an ellipsis rather than ever drawn outside its
// 8%-inset padded interior — the containment guarantee punchlist #1 asks
// for.
//
//   card({
//     w: 640, h: 420,               // canvas pixel size == the plane's aspect ratio
//     title: 'Johnson & Johnson',   // Caveat, auto-fit against the icon column
//     metric: '-80% manual troubleshooting', // accent-colored stat line
//     body: 'Led the enterprise migration…',  // Patrick Hand, fills remaining height
//     accent: PALETTE.amber,        // one accent per card: metric color + doodle tint
//     doodle: 'gear',               // small icon, top-right, clear of the text block
//   })
//
// Existing per-plane call sites (Journey/Warehouse/Registry/Contact) are not
// migrated by this change — that's each room's own pass — but any new card
// should use this instead of hand-assembling title/body/doodle planes.
//
// `text()` keeps its original wrap-only behavior when called without
// `maxHeight` (every existing caller), but now also supports the same
// shrink-then-wrap auto-fit when a caller opts in via `maxHeight` — see its
// doc comment below.

import * as THREE from 'three';
import type { TextureFactory, TexturePair } from '../contracts';
import { FONTS } from '../contracts';
import { autoFitText, buildCharWidthTable, layoutText, measureText } from './layout';
import type { CharWidthTable } from './layout';
import { drawCardSheet, drawGraphGrid, drawPaperBackground, drawDoodle, isDoodleKind, PALETTE, type Canvas2D, type DoodleMode } from './notebook';
import { hashSeed } from './notebook';

const DOODLE_SIZE = 256;
const BACKGROUND_SIZE = 512;

const FONT_FAMILIES = { caveat: 'Caveat', hand: 'Patrick Hand' } as const;
type FontKey = keyof typeof FONT_FAMILIES;

export interface TextOptions {
  font?: FontKey;
  size?: number;
  color?: string;
  maxWidth?: number;
  /**
   * Opt-in auto-shrink containment: when set, text() measures via
   * textures/layout.ts's `autoFitText` and shrinks `size` stepwise (max 3
   * steps, floor `minSize`) before wrapping, so the rendered block never
   * exceeds `maxWidth` x `maxHeight` (clipped with an ellipsis as a last
   * resort). Omitted by default — every existing caller keeps the original
   * wrap-only behavior (grows taller instead of shrinking).
   */
  maxHeight?: number;
  /** Floor for the maxHeight auto-shrink above. Default: size * 0.55. Has no effect without maxHeight. */
  minSize?: number;
}

export interface CardOptions {
  /** Canvas pixel size of the composed card texture — also its aspect ratio. */
  w: number;
  h: number;
  /** Deterministic seed for the sheet backdrop's wobble/dog-ear/rules. Defaults to a hash of title+body. */
  seed?: number;
  title?: string;
  titleFont?: FontKey;
  /** Starting/preferred title size before auto-shrink. Default: ~11% of h. */
  titleSize?: number;
  body?: string;
  bodyFont?: FontKey;
  /** Starting/preferred body size before auto-shrink. Default: ~7% of h. */
  bodySize?: number;
  /** One colored-pencil accent for this card: the metric line's color and the doodle icon's tint both key off it. */
  accent?: string;
  /** Small doodle icon id (see DOODLE_KINDS in ./notebook), drawn top-right, clear of the title's text block. */
  doodle?: string;
  doodleMode?: DoodleMode;
  /** Accent-colored stat/metric line, drawn between title and body (e.g. "-80% manual troubleshooting"). */
  metric?: string;
  /** Starting/preferred metric size before auto-shrink. Default: ~13% of h. */
  metricSize?: number;
}

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

interface CanvasHandle {
  canvas: CanvasLike;
  ctx: Canvas2D;
}

/** Creates a 2D-drawable canvas, preferring OffscreenCanvas when available. */
function createCanvas(width: number, height: number): CanvasHandle {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
    const ctx = canvas.getContext('2d');
    if (ctx) return { canvas, ctx };
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (ctx) return { canvas, ctx };
  }
  throw new Error('textures/factory: no 2D canvas context is available in this environment');
}

function resizeCanvas(canvas: CanvasLike, width: number, height: number): void {
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
}

function configureTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  // The corridor camera sits at CORRIDOR.cameraY = 0.2 (frozen, near-floor
  // eye height, contracts.ts) and looks nearly level down an 80-unit
  // segment, so the floor/wall surfaces are viewed at a steep grazing
  // angle for most of their length. Mipmapping alone blurs that to a flat
  // haze regardless of how finely the texture repeats; raising anisotropic
  // filtering keeps the near-field tiling legible. Three.js clamps this to
  // the GPU's actual max automatically, so 16 is a safe upper request.
  texture.anisotropy = 16;
  texture.needsUpdate = true;
}

function wrapTexture(canvas: CanvasLike): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas);
  configureTexture(texture);
  return texture;
}

/**
 * Namespaces whose prefix doesn't literally name a DoodleKind but should
 * still render as one — e.g. every warehouse exhibit card ("exhibit/loop-ai"),
 * the shared journey note backing ("note/journey"), and the contact room's
 * desk backdrop ("desk/contact") are all, visually, a sheet of paper. They
 * alias to the 'sheet' doodle rather than falling through to the generic
 * ink-frame placeholder, which is a plain bordered panel — a reasonable
 * "unrecognized id" fallback, but flatter than these large surfaces want.
 */
const PREFIX_ALIASES: Record<string, string> = {
  exhibit: 'sheet',
  note: 'sheet',
  desk: 'sheet',
};

/**
 * Resolves which DoodleKind a texture id refers to. Ids may be a bare kind
 * ("door"), a kind with a room/variant slug ("door/journey", "parcel/sqlstream"),
 * a namespace with the kind as the suffix ("doodle/gear", "egg/duck"), or a
 * namespace aliased to a kind via PREFIX_ALIASES ("exhibit/loop-ai" -> "sheet").
 * Checking alias-then-prefix-then-suffix covers every convention used across
 * the world modules. Returns null when nothing matches — callers fall back
 * to a generic ink frame.
 */
function resolveDoodleKind(id: string): string | null {
  const segments = id.split('/');
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first !== undefined && PREFIX_ALIASES[first]) return PREFIX_ALIASES[first];
  if (first !== undefined && isDoodleKind(first)) return first;
  if (last !== undefined && isDoodleKind(last)) return last;
  return null;
}

function paintTextureBody(ctx: Canvas2D, id: string, mode: DoodleMode, size: number): void {
  const seed = hashSeed(id);
  const base = id.split('/')[0];

  if (base === 'paper') {
    drawPaperBackground(ctx, size, size, seed);
    if (mode === 'painted') {
      ctx.save();
      ctx.fillStyle = PALETTE.amber;
      ctx.globalAlpha = 0.04;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
    }
    return;
  }

  if (base === 'graph') {
    drawGraphGrid(ctx, size, size, { seed });
    if (mode === 'painted') {
      ctx.save();
      ctx.strokeStyle = PALETTE.red;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(size * 0.12, 0);
      ctx.lineTo(size * 0.12, size);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  const kind = resolveDoodleKind(id);
  drawDoodle(ctx, kind ?? id, mode, size, { seed });
}

function textureSizeFor(id: string): number {
  const base = id.split('/')[0];
  return base === 'paper' || base === 'graph' ? BACKGROUND_SIZE : DOODLE_SIZE;
}

// ---- local font loading (Caveat / Patrick Hand), lazy + idempotent ----

let fontLoadPromise: Promise<void> | null = null;

function resolveFontUrl(path: string): string {
  const base = (import.meta.env.BASE_URL as string | undefined) ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path}`;
}

/** Loads Caveat + Patrick Hand from the local /fonts/ files and registers
 * them on document.fonts. Safe to call repeatedly — resolves once, and
 * swallows failures (callers keep using the cursive fallback in that case). */
function ensureFontsLoaded(): Promise<void> {
  if (fontLoadPromise) return fontLoadPromise;
  fontLoadPromise = (async () => {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
    await Promise.all(
      (Object.entries(FONT_FAMILIES) as [FontKey, string][]).map(async ([key, family]) => {
        try {
          const face = new FontFace(family, `url("${resolveFontUrl(FONTS[key])}")`);
          const loaded = await face.load();
          document.fonts.add(loaded);
        } catch {
          // Swallow — text() already rendered with the cursive fallback stack.
        }
      }),
    );
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  })();
  return fontLoadPromise;
}

function fontStack(family: string, size: number): string {
  return `${size}px "${family}", cursive, sans-serif`;
}

class NotebookTextureFactory implements TextureFactory {
  private readonly pairs = new Map<string, TexturePair>();
  private readonly texts = new Map<string, THREE.Texture>();

  get(id: string): TexturePair {
    const cached = this.pairs.get(id);
    if (cached) return cached;

    const size = textureSizeFor(id);
    const sketchHandle = createCanvas(size, size);
    const paintedHandle = createCanvas(size, size);

    paintTextureBody(sketchHandle.ctx, id, 'sketch', size);
    paintTextureBody(paintedHandle.ctx, id, 'painted', size);

    const sketch = wrapTexture(sketchHandle.canvas);
    const painted = wrapTexture(paintedHandle.canvas);

    if (id.split('/')[0] === 'paper' || id.split('/')[0] === 'graph') {
      sketch.wrapS = sketch.wrapT = THREE.RepeatWrapping;
      painted.wrapS = painted.wrapT = THREE.RepeatWrapping;
    }

    const pair: TexturePair = { sketch, painted };
    this.pairs.set(id, pair);
    return pair;
  }

  text(content: string, opts: TextOptions = {}): THREE.Texture {
    const fontKey: FontKey = opts.font ?? 'caveat';
    const size = opts.size ?? 42;
    const color = opts.color ?? PALETTE.ink;
    const maxWidth = opts.maxWidth ?? 480;
    const maxHeight = opts.maxHeight;
    const minSize = opts.minSize;
    const key = `${fontKey} ${size} ${color} ${maxWidth} ${maxHeight ?? '-'} ${minSize ?? '-'} ${content}`;

    const cached = this.texts.get(key);
    if (cached) return cached;

    const family = FONT_FAMILIES[fontKey];
    const { canvas, ctx } = createCanvas(1, 1);
    const padding = size * 0.3;

    const draw = (fam: string): { width: number; height: number } => {
      ctx.font = fontStack(fam, size);
      const table = buildCharWidthTable(content, (ch) => ctx.measureText(ch).width, ' ');

      let lines: string[];
      let lineHeight: number;
      let resolvedSize: number;

      if (maxHeight !== undefined) {
        // Opt-in containment path (TextOptions.maxHeight): shrink-then-wrap
        // via the same autoFitText used by card()'s title/body blocks below,
        // so the drawn block never exceeds maxWidth x maxHeight.
        const fit = autoFitText(content, table, {
          maxWidth: Math.max(1, maxWidth - padding * 2),
          maxHeight: Math.max(1, maxHeight - padding * 2),
          fontSize: size,
          minFontSize: minSize,
        });
        lines = fit.lines;
        lineHeight = fit.lineHeight;
        resolvedSize = fit.fontSize;
      } else {
        // `fontSize: 1` is correct for the *width* math above — the table already
        // holds real-pixel advances measured at `size`, so multiplying by 1 leaves
        // them alone. But layoutText's lineHeight is `lineHeight * fontSize`, so a
        // literal 1.2 here previously produced a ~1px line height regardless of
        // the real font size, sizing the canvas far too short and clipping every
        // glyph's ascenders against the canvas edge. Pre-scale lineHeight by
        // `size` instead so it lands in the same real-pixel space as the table.
        const layout = layoutText(content, table, { maxWidth, fontSize: 1, lineHeight: 1.2 * size, padding });
        lines = layout.lines;
        lineHeight = layout.lineHeight;
        resolvedSize = size;
      }

      const contentWidth = lines.reduce((max, line) => Math.max(max, measureText(line, table, resolvedSize / size)), 0);
      const width = Math.max(1, Math.ceil(Math.min(maxWidth, contentWidth + padding * 2)));
      const height = Math.max(1, Math.ceil(lines.length * lineHeight + padding * 2));
      resizeCanvas(canvas, width, height);
      // resizing clears the canvas and resets context state — re-apply.
      ctx.font = fontStack(fam, resolvedSize);
      ctx.fillStyle = color;
      ctx.textBaseline = 'alphabetic';
      lines.forEach((line, i) => {
        ctx.fillText(line, padding, padding + lineHeight * (i + 0.8));
      });
      return { width, height };
    };

    draw(family);
    const texture = wrapTexture(canvas);
    this.texts.set(key, texture);

    void ensureFontsLoaded()
      .then(() => {
        draw(family);
        texture.needsUpdate = true;
      })
      .catch(() => {
        // Keep the cursive-fallback render already on the texture.
      });

    return texture;
  }

  dispose(): void {
    this.pairs.forEach((pair) => {
      pair.sketch.dispose();
      pair.painted.dispose();
    });
    this.pairs.clear();
    this.texts.forEach((texture) => texture.dispose());
    this.texts.clear();
  }
}

// ---- card(): composed card texture (see the module doc comment at top) ----

/** Fraction of min(w,h) used as the padded interior inset, per the aesthetic
 * contract's containment rule ("8-32px inset" scaled to an 8% fraction so it
 * holds across arbitrary card sizes). */
const CARD_INSET_FRACTION = 0.08;

function measureTable(ctx: Canvas2D, family: string, size: number, text: string): CharWidthTable {
  ctx.font = fontStack(family, size);
  return buildCharWidthTable(text, (ch) => ctx.measureText(ch).width, ' ');
}

/**
 * Draws one full card into `ctx` (already sized to opts.w x opts.h). Shared
 * by card()'s immediate fallback-font render and its post-font-load redraw,
 * mirroring text()'s draw()/ensureFontsLoaded() pattern.
 */
function drawCardBody(ctx: Canvas2D, opts: CardOptions, titleFamily: string, bodyFamily: string): void {
  const { w, h } = opts;
  const seed = opts.seed ?? hashSeed(`${opts.title ?? ''}|${opts.body ?? ''}|${opts.metric ?? ''}`);
  const accent = opts.accent ?? PALETTE.blue;

  drawCardSheet(ctx, w, h, { seed });

  const pad = Math.round(Math.min(w, h) * CARD_INSET_FRACTION);
  const ix = pad;
  const iy = pad;
  const iw = w - pad * 2;
  const ih = h - pad * 2;

  const iconSize = opts.doodle ? Math.min(iw, ih) * 0.24 : 0;
  const iconGap = opts.doodle ? Math.min(iw, ih) * 0.06 : 0;

  let cursorY = iy;
  const blockGap = Math.min(ih, h) * 0.02;

  if (opts.title) {
    const titleStart = opts.titleSize ?? Math.max(18, Math.round(h * 0.11));
    const titleAreaW = Math.max(1, iw - iconSize - iconGap);
    const titleAreaH = Math.min(ih * 0.42, titleStart * 1.15 * 2);
    const table = measureTable(ctx, titleFamily, titleStart, opts.title);
    const fit = autoFitText(opts.title, table, {
      maxWidth: titleAreaW,
      maxHeight: titleAreaH,
      fontSize: titleStart,
      lineHeightMultiplier: 1.15,
    });
    ctx.font = fontStack(titleFamily, fit.fontSize);
    ctx.fillStyle = PALETTE.ink;
    ctx.textBaseline = 'alphabetic';
    fit.lines.forEach((line, i) => {
      ctx.fillText(line, ix, cursorY + fit.lineHeight * (i + 0.82));
    });
    cursorY += fit.lineHeight * fit.lines.length + blockGap;
  }

  if (opts.doodle) {
    const iconX = ix + iw - iconSize;
    const iconY = iy;
    ctx.save();
    ctx.translate(iconX, iconY);
    ctx.scale(iconSize / DOODLE_SIZE, iconSize / DOODLE_SIZE);
    drawDoodle(ctx, opts.doodle, opts.doodleMode ?? 'painted', DOODLE_SIZE, { seed: seed + 500, accent });
    ctx.restore();
  }

  if (opts.metric) {
    const metricStart = opts.metricSize ?? Math.max(20, Math.round(h * 0.13));
    const metricAreaH = Math.max(metricStart * 1.15, ih * 0.22);
    const table = measureTable(ctx, bodyFamily, metricStart, opts.metric);
    const fit = autoFitText(opts.metric, table, {
      maxWidth: iw,
      maxHeight: metricAreaH,
      fontSize: metricStart,
      lineHeightMultiplier: 1.15,
    });
    ctx.font = fontStack(bodyFamily, fit.fontSize);
    ctx.fillStyle = accent;
    ctx.textBaseline = 'alphabetic';
    fit.lines.forEach((line, i) => {
      ctx.fillText(line, ix, cursorY + fit.lineHeight * (i + 0.82));
    });
    cursorY += fit.lineHeight * fit.lines.length + blockGap;
  }

  if (opts.body) {
    const bodyStart = opts.bodySize ?? Math.max(14, Math.round(h * 0.07));
    // Whatever vertical room remains below title/metric — may be less than
    // one line if those blocks ran long; autoFitText still guarantees at
    // least one (ellipsized) line rather than silently dropping the body.
    const bodyAreaH = Math.max(bodyStart * 1.3, iy + ih - cursorY);
    const table = measureTable(ctx, bodyFamily, bodyStart, opts.body);
    const fit = autoFitText(opts.body, table, {
      maxWidth: iw,
      maxHeight: bodyAreaH,
      fontSize: bodyStart,
      lineHeightMultiplier: 1.3,
    });
    ctx.font = fontStack(bodyFamily, fit.fontSize);
    ctx.fillStyle = PALETTE.ink;
    ctx.textBaseline = 'alphabetic';
    fit.lines.forEach((line, i) => {
      ctx.fillText(line, ix, cursorY + fit.lineHeight * (i + 0.82));
    });
  }
}

/**
 * Composes an entire notebook-card texture — sheet backdrop, title, an
 * optional accent-colored metric line, body copy, and an optional doodle
 * icon — as ONE canvas draw, so title/body auto-fit against each other and
 * the icon instead of overlapping (see the module doc comment at the top of
 * this file for the full API writeup and punchlist #1 context).
 */
export function card(opts: CardOptions): THREE.Texture {
  const { canvas, ctx } = createCanvas(opts.w, opts.h);
  const titleFamily = FONT_FAMILIES[opts.titleFont ?? 'caveat'];
  const bodyFamily = FONT_FAMILIES[opts.bodyFont ?? 'hand'];

  drawCardBody(ctx, opts, titleFamily, bodyFamily);
  const texture = wrapTexture(canvas);

  void ensureFontsLoaded()
    .then(() => {
      drawCardBody(ctx, opts, titleFamily, bodyFamily);
      texture.needsUpdate = true;
    })
    .catch(() => {
      // Keep the cursive-fallback render already on the texture.
    });

  return texture;
}

/** Creates a fresh TextureFactory instance. Call once per world-mode mount
 * (e.g. in the app-shell integrator) and pass it into <WorldProviders textures>. */
export function createTextureFactory(): TextureFactory {
  return new NotebookTextureFactory();
}
