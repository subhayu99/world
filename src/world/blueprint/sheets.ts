// Canvas texture generators for the blueprint skin: drawing sheets, text
// plates, and grid grounds. Precise linework — no wobble anywhere.

import * as THREE from 'three';
import { BLUEPRINT, DRAFT_FONT_FAMILY } from './palette';
import { FONTS } from '../contracts';

let fontLoad: Promise<void> | null = null;
function ensureDraftFont(): Promise<void> {
  if (fontLoad) return fontLoad;
  fontLoad = (async () => {
    try {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const face = new FontFace(DRAFT_FONT_FAMILY, `url(${base}${FONTS.draft})`);
      await face.load();
      document.fonts.add(face);
    } catch {
      // cursive fallback keeps rendering; texture redraw below never fires
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

function wrapTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width <= maxWidth || !line) line = probe;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface SheetSpec {
  title: string;
  date?: string;
  body?: string;
  sheetNo?: string; // e.g. "SHT 03/11"
  accent?: string; // defaults to red pencil
  w?: number;
  h?: number;
}

/** A blueprint drawing sheet: dark panel, double white frame, drafting-caps
 * title, wrapped body, title-block strip along the bottom. */
export function sheetTexture(spec: SheetSpec): THREE.CanvasTexture {
  const w = spec.w ?? 640;
  const h = spec.h ?? 440;
  const accent = spec.accent ?? BLUEPRINT.accent;
  const { canvas, ctx } = makeCanvas(w, h);

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    // panel
    ctx.fillStyle = BLUEPRINT.face;
    ctx.fillRect(0, 0, w, h);
    // double frame
    ctx.strokeStyle = BLUEPRINT.line;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    const blockH = 56;
    const pad = 40;
    const innerW = w - pad * 2;

    // title
    ctx.fillStyle = BLUEPRINT.textPrimary;
    ctx.font = `44px "${DRAFT_FONT_FAMILY}", cursive`;
    ctx.textBaseline = 'alphabetic';
    let titleSize = 44;
    while (ctx.measureText(spec.title.toUpperCase()).width > innerW && titleSize > 24) {
      titleSize -= 2;
      ctx.font = `${titleSize}px "${DRAFT_FONT_FAMILY}", cursive`;
    }
    ctx.fillText(spec.title.toUpperCase(), pad, 20 + pad + titleSize * 0.6);

    // accent rule under title
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pad, 20 + pad + titleSize * 0.6 + 14);
    ctx.lineTo(pad + Math.min(innerW, ctx.measureText(spec.title.toUpperCase()).width + 8), 20 + pad + titleSize * 0.6 + 14);
    ctx.stroke();

    // body
    if (spec.body) {
      ctx.fillStyle = BLUEPRINT.textDim;
      ctx.font = `24px "${DRAFT_FONT_FAMILY}", cursive`;
      const lines = wrapLines(ctx, spec.body, innerW);
      const lineH = 34;
      const top = 20 + pad + titleSize * 0.6 + 44;
      const maxLines = Math.floor((h - blockH - 30 - top) / lineH);
      lines.slice(0, maxLines).forEach((line, i) => {
        ctx.fillText(line, pad, top + i * lineH + 20);
      });
    }

    // title block strip
    const by = h - 20 - blockH;
    ctx.strokeStyle = BLUEPRINT.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, by);
    ctx.lineTo(w - 20, by);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.55, by);
    ctx.lineTo(w * 0.55, h - 20);
    ctx.stroke();
    const leftCellW = w * 0.55 - 48;
    let blockSize = 18;
    ctx.font = `${blockSize}px "${DRAFT_FONT_FAMILY}", cursive`;
    const blockLabel = 'SUBHAYU KUMAR BALA — NOTEBOOK';
    while (ctx.measureText(blockLabel).width > leftCellW && blockSize > 10) {
      blockSize -= 1;
      ctx.font = `${blockSize}px "${DRAFT_FONT_FAMILY}", cursive`;
    }
    ctx.fillStyle = BLUEPRINT.textDim;
    ctx.fillText(blockLabel, 34, by + blockH / 2 + blockSize * 0.35);
    ctx.font = `16px "${DRAFT_FONT_FAMILY}", cursive`;
    ctx.fillStyle = accent;
    if (spec.date) ctx.fillText(spec.date.toUpperCase(), w * 0.55 + 14, by + 22);
    ctx.fillStyle = BLUEPRINT.textDim;
    if (spec.sheetNo) ctx.fillText(spec.sheetNo, w * 0.55 + 14, by + 44);
  };

  draw();
  const texture = wrapTexture(canvas);
  void ensureDraftFont().then(() => {
    draw();
    texture.needsUpdate = true;
  });
  return texture;
}

/** Drafting-caps text on transparent — for floating labels/headlines. */
export function plateTexture(text: string, opts?: { size?: number; color?: string; pad?: number }): { texture: THREE.CanvasTexture; aspect: number } {
  const size = opts?.size ?? 64;
  const color = opts?.color ?? BLUEPRINT.textPrimary;
  const pad = opts?.pad ?? 12;
  const probe = makeCanvas(4, 4).ctx;
  probe.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
  const wText = Math.ceil(probe.measureText(text.toUpperCase()).width);
  const w = Math.max(2, wText + pad * 2);
  const h = Math.ceil(size * 1.5) + pad * 2;
  const { canvas, ctx } = makeCanvas(w, h);
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), pad, h / 2);
  };
  draw();
  const texture = wrapTexture(canvas);
  void ensureDraftFont().then(() => {
    draw();
    texture.needsUpdate = true;
  });
  return { texture, aspect: w / h };
}

/** Tiled blueprint grid ground (minor + major lines). */
export function gridTexture(opts?: { tile?: number; majorEvery?: number }): THREE.CanvasTexture {
  const tile = opts?.tile ?? 256;
  const majorEvery = opts?.majorEvery ?? 4;
  const minor = tile / majorEvery;
  const { canvas, ctx } = makeCanvas(tile, tile);
  ctx.fillStyle = BLUEPRINT.ground;
  ctx.fillRect(0, 0, tile, tile);
  ctx.strokeStyle = BLUEPRINT.gridMinor;
  ctx.lineWidth = 1;
  for (let i = 1; i < majorEvery; i++) {
    ctx.beginPath();
    ctx.moveTo(i * minor + 0.5, 0);
    ctx.lineTo(i * minor + 0.5, tile);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * minor + 0.5);
    ctx.lineTo(tile, i * minor + 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = BLUEPRINT.gridMajor;
  ctx.strokeRect(0.5, 0.5, tile, tile);
  const texture = wrapTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Soft sketch cloud on transparent — flat billboard, itomdev-style. */
export function cloudTexture(seed = 1): THREE.CanvasTexture {
  const w = 320;
  const h = 180;
  const { canvas, ctx } = makeCanvas(w, h);
  let a = seed * 9301 + 49297;
  const rnd = () => ((a = (a * 233280 + 49297) % 233280) / 233280);
  const blobs = 4 + Math.floor(rnd() * 3);
  ctx.fillStyle = '#eceae2';
  ctx.strokeStyle = 'rgba(74,74,72,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i < blobs; i++) {
    const bx = 60 + (w - 120) * (i / (blobs - 1)) + (rnd() - 0.5) * 30;
    const by = h * 0.62 - Math.sin((i / (blobs - 1)) * Math.PI) * (30 + rnd() * 22);
    const r = 34 + rnd() * 26;
    ctx.beginPath();
    ctx.arc(bx, by + r * 0.4, r, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    ctx.stroke();
  }
  // flat base
  ctx.fillRect(58, h * 0.62, w - 116, 16);
  const texture = wrapTexture(canvas);
  return texture;
}
