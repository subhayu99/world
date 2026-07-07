// The corridor scene: recycled floor/wall/ceiling segments, the four real
// room doors (segment 0 only), year markers, a repeating wall-decor/
// ceiling-light rhythm, an entry-hero wanderer + wordmark, and the four
// easter-egg props. Camera position is read every frame (whatever module
// drives it — scroll/gsap — just moves camera.position.z) so this stays
// decoupled from the camera-rig implementation.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { CORRIDOR } from '../contracts';
import { useTextures, useWorldData, useWorldStore } from '../state/hooks';
import { makeRevealPair } from '../materials/reveal';
import { drawWoodFloor, PALETTE, type Canvas2D } from '../textures/notebook';
import { wobbleLine, type Point } from '../textures/rand';
import { assetTexture } from '../assets';
import {
  CORRIDOR_HEIGHT,
  CORRIDOR_WIDTH,
  DOORS_SEGMENT_INDEX,
  doorSide,
  doorWorldZ,
  findEgg,
  repeatingZ,
  roomForDoorSlot,
  segmentCenterZ,
  segmentIndexAt,
} from './segments';
import { Door } from './Door';
import { EasterEggProp } from './EasterEggProp';
import { OutlineTitle } from '../blueprint/props';
import { Edges, PaperPlane } from '../blueprint/primitives';
import { BLUEPRINT } from '../blueprint/palette';

/** World units covered by one tile of the shared paper/graph/wood texture —
 * small enough that fiber/grain/grid detail stays legible up close instead
 * of one 512px canvas stretching (and blurring into flat grey) across an
 * 80-unit-long segment. */
const TEXTURE_TILE_SIZE = 4;

/** The floor/ceiling's width (CORRIDOR_WIDTH=6) tiled at TEXTURE_TILE_SIZE
 * (4) gives a 1.5 repeat — not an integer, so RepeatWrapping's UV wrap
 * lands mid-tile and the non-tileable paper-fleck layer shows a hard,
 * dead-straight seam running the full length of the corridor: exactly
 * punchlist #6's "hard-edged diagonal artifact line bisecting every
 * corridor shot" (it reads as a diagonal because the seam, dead straight in
 * world space, converges toward the vanishing point in perspective). Tiling
 * the width in exactly 2 tiles instead removes the wrap-point discontinuity
 * entirely. */
const FLOOR_WIDTH_REPEAT = 2;

/** World-unit width of the center rug runner (top gap #1) — narrow enough
 * to leave a clear wood-floor margin on both sides under CORRIDOR_WIDTH. */
const RUG_WIDTH = 1.8;

/** Clones `base` (so per-surface repeat settings never fight over one shared
 * texture instance) and sets RepeatWrapping + a repeat proportional to the
 * surface's real-world size. Disposes the clone on unmount/change — it's a
 * plain GPU texture, not something the shared TextureFactory cache owns. */
function useTiledClone(base: THREE.Texture, repeatX: number, repeatY: number): THREE.Texture {
  const texture = useMemo(() => {
    const clone = base.clone();
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(repeatX, repeatY);
    clone.needsUpdate = true;
    return clone;
  }, [base, repeatX, repeatY]);

  useEffect(() => () => texture.dispose(), [texture]);

  return texture;
}

// ---- locally-generated canvas textures (wood floor, wainscot, ceiling glow,
// entry-hero wanderer/wordmark) --------------------------------------------
// scene/Corridor.tsx doesn't own textures/factory.ts's cached TextureFactory
// (get()/text() only cover the frozen id vocabulary), so these are built the
// same way factory.ts builds its own canvases — OffscreenCanvas preferred,
// HTMLCanvasElement fallback — using notebook.ts's exported draw helpers
// (drawWoodFloor) and rand.ts's exported wobble primitives directly. Each is
// a lazy module-level singleton: built once on first use and reused by every
// SegmentShell/CeilingLight instance rather than re-drawn per mount.

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

function createLocalCanvas(width: number, height: number): { canvas: CanvasLike; ctx: Canvas2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
    const ctx = canvas.getContext('2d');
    if (ctx) return { canvas, ctx: ctx as Canvas2D };
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (ctx) return { canvas, ctx: ctx as Canvas2D };
  }
  throw new Error('Corridor: no 2D canvas context is available in this environment');
}

function wrapLocalTexture(canvas: CanvasLike): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
}

let woodFloorTexture: THREE.Texture | null = null;
/** Procedural wood-plank floor (punchlist #20: "no wood-grain ... floor
 * texture"), built once via notebook.ts's exported `drawWoodFloor`. */
function getWoodFloorTexture(): THREE.Texture {
  if (woodFloorTexture) return woodFloorTexture;
  const size = 512;
  const { canvas, ctx } = createLocalCanvas(size, size);
  drawWoodFloor(ctx, size, size, { seed: 7 });
  const texture = wrapLocalTexture(canvas);
  woodFloorTexture = texture;
  return texture;
}

let wainscotTexture: THREE.Texture | null = null;
/** A low wainscot line along the walls (brief: "a low wainscot line along
 * walls to break emptiness") — a hand-wobbled ink rule with a faint accent
 * wash, drawn directly with rand.ts's wobble primitives (no ruler-straight
 * line, per the aesthetic contract) and tiled along the wall length. */
function getWainscotTexture(): THREE.Texture {
  if (wainscotTexture) return wainscotTexture;
  const w = 512;
  const h = 48;
  const { canvas, ctx } = createLocalCanvas(w, h);
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.fillStyle = PALETTE.blue;
  ctx.globalAlpha = 0.07;
  ctx.fillRect(0, h * 0.2, w, h * 0.6);
  ctx.restore();

  const line = wobbleLine(0, h / 2, w, h / 2, { seed: 21, amplitude: 2.4, segments: 16 });
  ctx.save();
  ctx.strokeStyle = PALETTE.ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(line[0].x, line[0].y);
  line.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();
  ctx.restore();

  const texture = wrapLocalTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  wainscotTexture = texture;
  return texture;
}

let ceilingGlowTexture: THREE.Texture | null = null;
/** Soft radial glow for each ceiling light (brief: "ceiling light doodles
 * with a soft glow plane"), amber-tinted per the accent palette. Widened
 * with an extra mid-stop and a lower peak alpha (was a hard 0.5 core) —
 * several of these stacking near the corridor's vanishing point in
 * perspective is exactly what read as a punched-out "hole" rather than a
 * soft light pool (top gap #4). */
function getCeilingGlowTexture(): THREE.Texture {
  if (ceilingGlowTexture) return ceilingGlowTexture;
  const size = 320;
  const { canvas, ctx } = createLocalCanvas(size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(217,164,65,0.38)');
  gradient.addColorStop(0.32, 'rgba(217,164,65,0.22)');
  gradient.addColorStop(0.65, 'rgba(217,164,65,0.08)');
  gradient.addColorStop(1, 'rgba(217,164,65,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = wrapLocalTexture(canvas);
  ceilingGlowTexture = texture;
  return texture;
}

let floorGrainTexture: THREE.Texture | null = null;
/** Denser, darker wood-grain overlay for the floor (top gap #1: "floor wood
 * grain is too faint") — drawWoodFloor itself lives in the frozen
 * notebook.ts, so this is a second, locally-owned canvas multiply-blended
 * on top of it: darker plank seams plus a higher density of short grain
 * streaks than the base texture draws, using the same wobble primitives. */
function getFloorGrainTexture(): THREE.Texture {
  if (floorGrainTexture) return floorGrainTexture;
  const size = 512;
  const { canvas, ctx } = createLocalCanvas(size, size);
  ctx.clearRect(0, 0, size, size);

  const plankHeight = size / 6;
  let y = 0;
  let row = 0;
  while (y < size) {
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1.8;
    strokeWobbled(ctx, wobbleLine(0, y, size, y, { seed: 700 + row, amplitude: 1.8, segments: 14 }));
    ctx.restore();

    const streaks = 5;
    for (let s = 0; s < streaks; s++) {
      const sy = y + plankHeight * (0.15 + (s / streaks) * 0.7);
      const sx1 = (s * 97 + row * 53) % Math.round(size * 0.55);
      const sLen = size * (0.2 + ((s * 31 + row * 17) % 40) / 100);
      ctx.save();
      ctx.strokeStyle = PALETTE.ink;
      ctx.globalAlpha = 0.13;
      ctx.lineWidth = 0.8;
      strokeWobbled(ctx, wobbleLine(sx1, sy, sx1 + sLen, sy, { seed: 800 + row * 10 + s, amplitude: 1.4, segments: 6 }));
      ctx.restore();
    }
    y += plankHeight;
    row += 1;
  }

  const texture = wrapLocalTexture(canvas);
  floorGrainTexture = texture;
  return texture;
}

let rugRunnerTexture: THREE.Texture | null = null;
/** Accent-coral rug runner down the corridor's center, with a hand-inked
 * border (top gap #1: "rug runner strip down the middle with a drawn
 * border"). rand.ts's wobbleLine anchors both endpoints exactly, so the two
 * long borders line up seamlessly across the RepeatWrapping tiles laid end
 * to end along the corridor's length — the same seamless-tiling trick the
 * wainscot texture above relies on. */
function getRugRunnerTexture(): THREE.Texture {
  if (rugRunnerTexture) return rugRunnerTexture;
  const w = 96;
  const h = 512;
  const { canvas, ctx } = createLocalCanvas(w, h);
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.fillStyle = BLUEPRINT.accent;
  ctx.globalAlpha = 0.16;
  ctx.fillRect(w * 0.08, 0, w * 0.84, h);
  ctx.restore();

  const inset = w * 0.1;
  ctx.save();
  ctx.strokeStyle = PALETTE.ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  strokeWobbled(ctx, wobbleLine(inset, 0, inset, h, { seed: 41, amplitude: 1.6, segments: 20 }));
  strokeWobbled(ctx, wobbleLine(w - inset, 0, w - inset, h, { seed: 42, amplitude: 1.6, segments: 20 }));
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = PALETTE.ink;
  ctx.globalAlpha = 0.1;
  ctx.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    const ty = (i / 24) * h;
    strokeWobbled(ctx, wobbleLine(inset + 4, ty, w - inset - 4, ty, { seed: 60 + i, amplitude: 1, segments: 3 }));
  }
  ctx.restore();

  const texture = wrapLocalTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  rugRunnerTexture = texture;
  return texture;
}

let skirtingTexture: THREE.Texture | null = null;
/** A distinct baseboard/skirting strip right at the wall/floor junction —
 * separate from getWainscotTexture's higher blue-washed rule above (top
 * gap #1: "skirting-board line"), anchoring the room's geometry the way a
 * real baseboard breaks up a bare wall-to-floor seam. */
function getSkirtingTexture(): THREE.Texture {
  if (skirtingTexture) return skirtingTexture;
  const w = 512;
  const h = 32;
  const { canvas, ctx } = createLocalCanvas(w, h);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#e3ded0';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = PALETTE.ink;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  strokeWobbled(ctx, wobbleLine(0, h * 0.18, w, h * 0.18, { seed: 71, amplitude: 1.2, segments: 16 }));
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1.2;
  strokeWobbled(ctx, wobbleLine(0, h * 0.82, w, h * 0.82, { seed: 72, amplitude: 1, segments: 16 }));
  ctx.restore();

  const texture = wrapLocalTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  skirtingTexture = texture;
  return texture;
}

let farVeilTexture: THREE.Texture | null = null;
/** A very soft, wide radial haze in the corridor's own paper/fog color,
 * kept at a fixed distance ahead of the camera (top gap #4: "far-end white
 * glow looks like a hole") — it pre-blends the point where the floor/wall/
 * ceiling lines converge into a gentler gradient, without touching the
 * frozen scene fog config in contracts.ts/palette.ts. */
function getFarVeilTexture(): THREE.Texture {
  if (farVeilTexture) return farVeilTexture;
  const size = 512;
  const { canvas, ctx } = createLocalCanvas(size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(246,244,238,0.85)');
  gradient.addColorStop(0.4, 'rgba(246,244,238,0.5)');
  gradient.addColorStop(0.75, 'rgba(246,244,238,0.2)');
  gradient.addColorStop(1, 'rgba(246,244,238,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = wrapLocalTexture(canvas);
  farVeilTexture = texture;
  return texture;
}

// ---- entry-hero avatar flipbook --------------------------------------------
// Replaces the old hand-inked waving stick figure with a 9-frame drawn-avatar
// animation, cycled through preloaded textures at a fixed frame rate.

function strokeWobbled(ctx: Canvas2D, points: readonly Point[], close = false): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (close) ctx.closePath();
  ctx.stroke();
}

const AVATAR_FRAME_COUNT = 9;
const AVATAR_FPS = 8;
// frames are 1024x1024 — the plane must stay square or the figure squeezes
const AVATAR_WIDTH = 1.6;
const AVATAR_HEIGHT = 1.6;

/** Cycles the 9 drawn-avatar frames (textures/corridor/avatar_anim/1..9.webp)
 * on a single plane at ~8fps — advances by elapsed time each frame rather
 * than a fixed per-tick counter, so playback rate stays independent of the
 * render frame rate. */
function AvatarFlipbook({ position }: { position: [number, number, number] }): JSX.Element {
  const frames = useMemo(
    () =>
      Array.from({ length: AVATAR_FRAME_COUNT }, (_, i) => assetTexture(`textures/corridor/avatar_anim/${i + 1}.webp`)),
    [],
  );
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const material = materialRef.current;
    if (!material) return;
    const index = Math.floor(clock.elapsedTime * AVATAR_FPS) % AVATAR_FRAME_COUNT;
    const frame = frames[index];
    if (material.map !== frame) {
      material.map = frame;
      material.needsUpdate = true;
    }
  });

  return (
    <mesh position={position}>
      <planeGeometry args={[AVATAR_WIDTH, AVATAR_HEIGHT]} />
      <meshBasicMaterial ref={materialRef} map={frames[0]} transparent alphaTest={0.05} />
    </mesh>
  );
}

// ---- wall-decor rhythm (repeats every segment, not just DOORS_SEGMENT_INDEX)
// Punchlist #4/#9/#20/#21: mid/deep segments had zero set-dressing (only
// DOORS_SEGMENT_INDEX ever rendered WALL_DOODLES/eggs), so the corridor
// "blew out to a near-blank void" the moment a visitor scrolled past
// segment 0. These slots are defined once, relative to a segment's own
// local frame, and placed in EVERY visible segment via repeatingZ — density
// target from the brief: "every screen-width of corridor shows 2-3
// charming elements."

type WallDoodleKind =
  | 'gear'
  | 'db'
  | 'sheet'
  | 'coffeeCup'
  | 'paperPlane'
  | 'deskLamp'
  | 'trophy'
  | 'rosette'
  | 'awardPlaque'
  | 'flag'
  | 'gradcap'
  | 'pin';

// Bumped from 6 to 12 slots at a tighter, even 6-unit spacing (was clumped
// at -4/-8 then a bare 16-unit gap to -24) and widened the kind vocabulary
// past the original six — top gap #1: "hallway still reads sparse/CAD
// between doors", "every screen-width shows 2-3 charming elements" wasn't
// actually landing once a visitor scrolled past the first slot cluster.
// 'coffeeCup' (z=-10), 'gear' (z=-22) and 'paperPlane' (z=-34) were dropped
// from here in favor of the hand-drawn webp versions at the same z/side —
// see IMAGE_DECOR_SLOTS below.
const DECOR_SLOTS: { id: WallDoodleKind; z: number; side: 'left' | 'right' }[] = [
  { id: 'sheet', z: -4, side: 'right' },
  { id: 'trophy', z: -16, side: 'right' },
  { id: 'rosette', z: -28, side: 'right' },
  { id: 'db', z: -40, side: 'right' },
  { id: 'awardPlaque', z: -46, side: 'left' },
  { id: 'deskLamp', z: -52, side: 'right' },
  { id: 'flag', z: -58, side: 'left' },
  { id: 'gradcap', z: -64, side: 'right' },
  { id: 'pin', z: -70, side: 'left' },
];

/** Three canvas-drawn DECOR_SLOTS entries (coffeeCup/gear/paperPlane) swapped
 * for their hand-drawn webp counterparts, at the same z/side those ids used
 * to occupy — static textured planes, no reveal/hover pair. */
const IMAGE_DECOR_SLOTS: { path: string; z: number; side: 'left' | 'right'; size: number }[] = [
  { path: 'textures/corridor/decorations/coffee_debug.webp', z: -10, side: 'left', size: 0.7 },
  { path: 'textures/corridor/decorations/idea_process.webp', z: -22, side: 'left', size: 0.8 },
  { path: 'textures/corridor/decorations/paper_ball.webp', z: -34, side: 'left', size: 0.55 },
];

const CEILING_LIGHT_SLOTS: number[] = [-4, -22, -40, -58, -76];

/** A single static hand-drawn webp decoration mounted flush on a corridor
 * wall — no hover/click affordance, unlike WallDoodle's canvas doodles. */
function WallDecorImage({ path, z, side, size }: { path: string; z: number; side: 'left' | 'right'; size: number }): JSX.Element {
  const texture = useMemo(() => assetTexture(path), [path]);
  const x = side === 'left' ? -CORRIDOR_WIDTH / 2 + 0.02 : CORRIDOR_WIDTH / 2 - 0.02;
  const rotY = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
  return (
    <mesh position={[x, 1.8, z]} rotation={[0, rotY, 0]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** One recycled floor/wall/ceiling shell covering a full segmentLength. */
function SegmentShell({ segmentIndex }: { segmentIndex: number }): JSX.Element {
  const textures = useTextures();
  const paper = useMemo(() => textures.get('paper').sketch, [textures]);
  const graph = useMemo(() => textures.get('graph').sketch, [textures]);
  const wood = useMemo(() => getWoodFloorTexture(), []);
  const wainscot = useMemo(() => getWainscotTexture(), []);
  const floorGrain = useMemo(() => getFloorGrainTexture(), []);
  const rug = useMemo(() => getRugRunnerTexture(), []);
  const skirting = useMemo(() => getSkirtingTexture(), []);
  const centerZ = segmentCenterZ(segmentIndex, CORRIDOR.segmentLength);

  // Floor/ceiling run CORRIDOR_WIDTH x segmentLength; walls run
  // segmentLength x CORRIDOR_HEIGHT (rotated) — each surface clones a base
  // texture and tiles it at a world-unit-proportional repeat so paper
  // fiber / grid / wood-grain detail actually reads up close instead of
  // one canvas stretched (and blurred by minification) across the whole
  // 80-unit segment. Floor/ceiling use FLOOR_WIDTH_REPEAT (an integer) on
  // their width axis specifically to avoid the non-integer-repeat seam
  // documented above (punchlist #6).
  const floorWood = useTiledClone(wood, FLOOR_WIDTH_REPEAT, CORRIDOR.segmentLength / TEXTURE_TILE_SIZE);
  const floorGrainTiled = useTiledClone(floorGrain, FLOOR_WIDTH_REPEAT, CORRIDOR.segmentLength / TEXTURE_TILE_SIZE);
  const rugTiled = useTiledClone(rug, 1, CORRIDOR.segmentLength / TEXTURE_TILE_SIZE);
  const ceilingPaper = useTiledClone(paper, FLOOR_WIDTH_REPEAT, CORRIDOR.segmentLength / TEXTURE_TILE_SIZE);
  const ceilingGraph = useTiledClone(graph, FLOOR_WIDTH_REPEAT, CORRIDOR.segmentLength / TEXTURE_TILE_SIZE);
  const wallPaper = useTiledClone(paper, CORRIDOR.segmentLength / TEXTURE_TILE_SIZE, CORRIDOR_HEIGHT / TEXTURE_TILE_SIZE);
  const wallGraph = useTiledClone(graph, CORRIDOR.segmentLength / TEXTURE_TILE_SIZE, CORRIDOR_HEIGHT / TEXTURE_TILE_SIZE);
  const wainscotTiled = useTiledClone(wainscot, CORRIDOR.segmentLength / TEXTURE_TILE_SIZE, 1);
  const skirtingTiled = useTiledClone(skirting, CORRIDOR.segmentLength / TEXTURE_TILE_SIZE, 1);

  return (
    <group>
      {/* floor — warm wood-plank grain (punchlist #3/#20), not flat paper */}
      <mesh position={[0, 0, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CORRIDOR_WIDTH, CORRIDOR.segmentLength]} />
        <meshBasicMaterial map={floorWood} />
      </mesh>
      {/* denser/darker grain overlay, multiply-blended — top gap #1: the
          shared drawWoodFloor texture alone reads too faint once tiled
          across an 80-unit segment. */}
      <mesh position={[0, 0.001, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CORRIDOR_WIDTH, CORRIDOR.segmentLength]} />
        <meshBasicMaterial map={floorGrainTiled} transparent blending={THREE.MultiplyBlending} depthWrite={false} />
      </mesh>
      {/* accent-coral rug runner down the middle, hand-inked border baked
          into the texture itself — top gap #1. */}
      <mesh position={[0, 0.003, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[RUG_WIDTH, CORRIDOR.segmentLength]} />
        <meshBasicMaterial map={rugTiled} transparent depthWrite={false} />
      </mesh>
      {/* left wall */}
      <mesh position={[-CORRIDOR_WIDTH / 2, CORRIDOR_HEIGHT / 2, centerZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR.segmentLength, CORRIDOR_HEIGHT]} />
        <meshBasicMaterial map={wallPaper} side={THREE.DoubleSide} />
      </mesh>
      {/* faint graph-grid overlay on the left wall, so walls read as graph
          paper too rather than flat, undifferentiated cream */}
      <mesh position={[-CORRIDOR_WIDTH / 2 + 0.005, CORRIDOR_HEIGHT / 2, centerZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR.segmentLength, CORRIDOR_HEIGHT]} />
        <meshBasicMaterial map={wallGraph} transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* low wainscot line, left wall — brief: "a low wainscot line along
          walls to break emptiness" */}
      <mesh position={[-CORRIDOR_WIDTH / 2 + 0.01, 0.4, centerZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR.segmentLength, 0.3]} />
        <meshBasicMaterial map={wainscotTiled} transparent side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* skirting/baseboard right at the wall-floor junction, left wall —
          top gap #1: distinct from the wainscot rule above it. */}
      <mesh position={[-CORRIDOR_WIDTH / 2 + 0.012, 0.09, centerZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR.segmentLength, 0.16]} />
        <meshBasicMaterial map={skirtingTiled} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* right wall */}
      <mesh position={[CORRIDOR_WIDTH / 2, CORRIDOR_HEIGHT / 2, centerZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR.segmentLength, CORRIDOR_HEIGHT]} />
        <meshBasicMaterial map={wallPaper} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[CORRIDOR_WIDTH / 2 - 0.005, CORRIDOR_HEIGHT / 2, centerZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR.segmentLength, CORRIDOR_HEIGHT]} />
        <meshBasicMaterial map={wallGraph} transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* low wainscot line, right wall */}
      <mesh position={[CORRIDOR_WIDTH / 2 - 0.01, 0.4, centerZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR.segmentLength, 0.3]} />
        <meshBasicMaterial map={wainscotTiled} transparent side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* skirting/baseboard, right wall */}
      <mesh position={[CORRIDOR_WIDTH / 2 - 0.012, 0.09, centerZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR.segmentLength, 0.16]} />
        <meshBasicMaterial map={skirtingTiled} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* ceiling — paper + faint grid, same width-repeat fix as the floor */}
      <mesh position={[0, CORRIDOR_HEIGHT, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CORRIDOR_WIDTH, CORRIDOR.segmentLength]} />
        <meshBasicMaterial map={ceilingPaper} />
      </mesh>
      <mesh position={[0, CORRIDOR_HEIGHT - 0.005, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CORRIDOR_WIDTH, CORRIDOR.segmentLength]} />
        <meshBasicMaterial map={ceilingGraph} transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Extracts a data-URL from whatever canvas backs a texture, so the DOM
 * lightbox can show the artwork big. Returns null when unsupported. */
function textureDataUrl(texture: THREE.Texture): string | null {
  const image = texture.image as HTMLCanvasElement | OffscreenCanvas | undefined;
  if (!image) return null;
  try {
    if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
      return image.toDataURL('image/png');
    }
    // OffscreenCanvas: copy through a temp element canvas
    const el = document.createElement('canvas');
    el.width = (image as OffscreenCanvas).width;
    el.height = (image as OffscreenCanvas).height;
    const ctx = el.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image as unknown as CanvasImageSource, 0, 0);
    return el.toDataURL('image/png');
  } catch {
    return null;
  }
}

// Doodle kinds that depict an object resting on something (a cup, a trophy)
// rather than a self-contained wall fixture (a gear, a pin) — these read as
// floating without a supporting surface underneath (top gap: "trophy wall
// doodle floats detached in mid-air with no supporting surface" — the cup
// icon on the blank right wall at z=-16 had nothing beneath it). Reuses the
// existing-but-previously-unused 'shelf' doodle (textures/notebook.ts's
// drawShelf, registered as a DoodleKind) as that ledge rather than drawing a
// new texture.
const SURFACE_DOODLES: ReadonlySet<WallDoodleKind> = new Set<WallDoodleKind>(['trophy']);

/** A single framed doodle with a hover reveal pair. Clicking it zooms the
 * artwork in a paper lightbox (WorldMode listens for world:art-open). */
function WallDoodle({ id, z, side }: { id: WallDoodleKind; z: number; side: 'left' | 'right' }): JSX.Element {
  const textures = useTextures();
  const store = useWorldStore();
  const pair = useMemo(() => textures.get(`doodle/${id}`), [textures, id]);
  const reveal = useMemo(() => makeRevealPair(THREE, pair), [pair]);
  // Only fetched/used when this id needs a supporting ledge, but useMemo must
  // stay unconditional — textures.get caches per-id so this is cheap either way.
  const shelfTexture = useMemo(() => textures.get('doodle/shelf').sketch, [textures]);

  const x = side === 'left' ? -CORRIDOR_WIDTH / 2 + 0.02 : CORRIDOR_WIDTH / 2 - 0.02;
  const rotY = side === 'left' ? Math.PI / 2 : -Math.PI / 2;

  const handlePointerOver = (e: ThreeEvent<PointerEvent>): void => {
    if (store.stage !== 'corridor') return;
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
    reveal.hoverIn();
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>): void => {
    if (store.stage !== 'corridor') return;
    e.stopPropagation();
    document.body.style.cursor = 'auto';
    reveal.hoverOut();
  };

  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    if (store.stage !== 'corridor') return;
    e.stopPropagation();
    const src = textureDataUrl(pair.painted) ?? textureDataUrl(pair.sketch);
    if (src) {
      window.dispatchEvent(new CustomEvent('world:art-open', { detail: { src, title: id } }));
    }
  };

  return (
    <group position={[x, 1.8, z]} rotation={[0, rotY, 0]}>
      {/* supporting ledge for "resting object" doodles (trophy) — sits just
          under the icon's drawn base so it no longer reads as floating on
          the bare wall; static/non-interactive. Was y=-0.24, z=-0.02 (behind
          both reveal layers) — drawTrophy's own base rectangle bottom sits
          at local y=-0.208 (notebook.ts's drawTrophy: base bottom at canvas
          fraction 0.76 -> (0.5-0.76)*0.8), and that first offset put the
          shelf's drawn plank at almost exactly the same y, so the trophy's
          own opaque base (in front, at z=0) occluded most of the shelf and
          left only a faint sliver showing. Dropped further (-0.32, clearing
          the base by a margin) and moved in front of both reveal layers
          (z=0.005) so it's never hidden behind them regardless of any
          residual vertical overlap. */}
      {SURFACE_DOODLES.has(id) && (
        <mesh position={[0, -0.32, 0.005]}>
          <planeGeometry args={[0.8, 0.8]} />
          <meshBasicMaterial map={shelfTexture} transparent depthWrite={false} />
        </mesh>
      )}
      {/* painted layer behind; sketch layer in front owns the hit test */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[0.8, 0.8]} />
        <primitive object={reveal.paintedMaterial} attach="material" />
      </mesh>
      <mesh onPointerOver={handlePointerOver} onPointerOut={handlePointerOut} onClick={handleClick}>
        <planeGeometry args={[0.8, 0.8]} />
        <primitive object={reveal.sketchMaterial} attach="material" />
      </mesh>
    </group>
  );
}

const LIGHT_WIRE_LEN = 0.55;
const LIGHT_SHADE_R = 0.26;
const LIGHT_SHADE_H = 0.22;

/** Ceiling pendant: a thin wire dropping from a small ceiling mount to a
 * 3D cone shade, plus the existing soft ceiling glow decal and a matching
 * warm ellipse pooling on the floor beneath — top gap #2: the fixture was a
 * single flat doodle plane, with no floor-level payoff for the "light" it's
 * supposed to be casting. */
function CeilingLight({ z }: { z: number }): JSX.Element {
  const glow = useMemo(() => getCeilingGlowTexture(), []);
  const shadeGeom = useMemo(() => new THREE.ConeGeometry(LIGHT_SHADE_R, LIGHT_SHADE_H, 10), []);
  const mountGeom = useMemo(() => new THREE.BoxGeometry(0.16, 0.04, 0.16), []);
  const wireGeom = useMemo(() => new THREE.CylinderGeometry(0.012, 0.012, LIGHT_WIRE_LEN, 6), []);
  return (
    <group position={[0, CORRIDOR_HEIGHT, z]}>
      {/* ceiling glow decal */}
      <mesh position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.8, 2.8]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* ceiling mount plate */}
      <mesh geometry={mountGeom} position={[0, -0.02, 0]}>
        <meshBasicMaterial color="#dedbd0" />
      </mesh>
      <Edges geometry={mountGeom} color={BLUEPRINT.line} opacity={0.6} threshold={30} />
      {/* hanging wire */}
      <mesh geometry={wireGeom} position={[0, -LIGHT_WIRE_LEN / 2, 0]}>
        <meshBasicMaterial color={BLUEPRINT.line} />
      </mesh>
      {/* pendant shade — real 3D geometry, not a flat decal */}
      <group position={[0, -LIGHT_WIRE_LEN - LIGHT_SHADE_H / 2, 0]}>
        <mesh geometry={shadeGeom}>
          <meshBasicMaterial color={BLUEPRINT.accentWarm} />
        </mesh>
        <Edges geometry={shadeGeom} color={BLUEPRINT.line} opacity={0.75} threshold={25} />
      </group>
      {/* warm light pool on the floor, stretched into a soft ellipse along
          the walk direction */}
      <group position={[0, -CORRIDOR_HEIGHT + 0.01, 0]} scale={[1.5, 1, 2.4]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.2, 2.2]} />
          <meshBasicMaterial map={glow} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </group>
  );
}

/** Wall decor + ceiling lights repeated for ANY segment index (not just
 * DOORS_SEGMENT_INDEX) — see the DECOR_SLOTS doc comment above. */
function SegmentDecor({ segmentIndex }: { segmentIndex: number }): JSX.Element {
  return (
    <group>
      {DECOR_SLOTS.map((slot) => (
        <WallDoodle
          key={`${segmentIndex}-${slot.id}`}
          id={slot.id}
          side={slot.side}
          z={repeatingZ(segmentIndex, slot.z, CORRIDOR.segmentLength)}
        />
      ))}
      {IMAGE_DECOR_SLOTS.map((slot) => (
        <WallDecorImage
          key={`${segmentIndex}-${slot.path}`}
          path={slot.path}
          side={slot.side}
          size={slot.size}
          z={repeatingZ(segmentIndex, slot.z, CORRIDOR.segmentLength)}
        />
      ))}
      {CEILING_LIGHT_SLOTS.map((localZ, i) => (
        <CeilingLight key={`${segmentIndex}-light-${i}`} z={repeatingZ(segmentIndex, localZ, CORRIDOR.segmentLength)} />
      ))}
    </group>
  );
}

// duck: floor, cat: on a shelf, rack: against wall, speedo: wall dial.
// Sizes bumped 1.8x (from a 1x1 plane) — judges flagged these as "illegible
// specks" (punchlist #21); y-positions re-grounded for the larger plane so
// the floor-resting duck still reads as sitting on the floor rather than
// floating or sinking through it.
const EGG_SIZE = 1.8;
// The quantum cat now lives on the entrance facade (its pupils follow the
// cursor out there) — the corridor keeps the other three eggs.
const EGG_PLACEMENTS: {
  id: 'rubberDuck' | 'serverRack' | 'speedometer';
  position: [number, number, number];
  /** Per-egg override for EGG_SIZE — the speedometer needs a smaller plane
   * (see its own comment below) than the shared 1.8 default. */
  size?: number;
}[] = [
  // Was y=1.9 at the shared EGG_SIZE=1.8 — that plane spanned roughly
  // y=1.0..2.8, reaching into the entry hero's subtitle band (subPlate sits
  // at title_y - height*0.58, per blueprint/props.tsx) every time the
  // corridor's segment loop brought this wall dial back into the same shot
  // as the "SUBHAYU" wordmark. Moved higher (near-ceiling wall-mounted gauge
  // reads fine at this height) and shrunk so its footprint clears the
  // subtitle's screen band instead of overlapping "Data &".
  { id: 'speedometer', position: [-2.9, 2.85, -9], size: 1.0 },
  // Was centered on the rug (x=0, y=0.85) — floating above the corridor's
  // center rug-runner strip made it read as floating mid-hall, and the
  // rug's own hand-inked border rectangle right behind it was exactly what
  // got reported as "a doodle on a paper card" (a visible bounding
  // rectangle), even though the duck's own texture is ink-only on
  // transparent (textures/notebook.ts's drawDuck). Moved to the side of the
  // hallway at floor level instead: x=2.6 sits near the right wall (inside
  // CORRIDOR_WIDTH/2=3) on bare wood floor, clear of the center rug; y=0.25
  // grounds it at floor height instead of floating. z=-44 kept — it was
  // already vetted for door/seam clearance (nowhere near the 'journey'
  // z=-18 / 'warehouse' z=-32 door slots or the segment-loop seam), and at
  // floor height (vs DECOR_SLOTS' y=1.8 wall doodles) there's no vertical
  // overlap with wall decor regardless of x.
  { id: 'rubberDuck', position: [2.6, 0.25, -44], size: 1.3 },
  { id: 'serverRack', position: [2.9, 1.3, -55] },
];

/** The four real room doors + their decor, mounted only on DOORS_SEGMENT_INDEX. */
function DoorsSegmentContent({ segmentIndex }: { segmentIndex: number }): JSX.Element {
  const worldData = useWorldData();

  // The corridor loops: every segment carries the full door set (plus eggs,
  // year markers and the entry hero), so walking forever in either
  // direction always brings you back to "the same" hallway — the itomdev
  // endless-loop feel. doorWorldZ shifts the slot pattern per segment.
  const doors = CORRIDOR.doorSlots
    .map((_slot, slotIndex) => {
      const room = roomForDoorSlot(worldData.rooms, slotIndex);
      if (!room) return null;
      const z = doorWorldZ(segmentIndex, slotIndex, CORRIDOR);
      const side = doorSide(slotIndex, CORRIDOR);
      const x = side === 'left' ? -CORRIDOR_WIDTH / 2 : CORRIDOR_WIDTH / 2;
      return <Door key={room.id} room={room} position={[x, 0, z]} side={side} />;
    })
    .filter((el): el is JSX.Element => el !== null);

  const eggs = EGG_PLACEMENTS.map(({ id, position, size }) => {
    const egg = findEgg(worldData.easterEggs, id);
    if (!egg) return null;
    const pos: [number, number, number] = [position[0], position[1], repeatingZ(segmentIndex, position[2], CORRIDOR.segmentLength)];
    return <EasterEggProp key={egg.id} egg={egg} position={pos} size={size ?? EGG_SIZE} />;
  }).filter((el): el is JSX.Element => el !== null);

  return (
    <group>
      {doors}
      {eggs}
    </group>
  );
}

/** Centered hand-drawn wanderer + dimensional wordmark — the corridor's
 * entry focal point (punchlist #7: "no focal-point hero content"). Fixed at
 * a single world position near the corridor mouth rather than recycled per
 * segment: it's a one-time "title card" beat, not repeating set-dressing. */
function EntryHero(): JSX.Element {
  const worldData = useWorldData();
  // Big outlined bubble-letter name framing the hallway (the itomdev entry
  // hero) with the tagline hand-written beneath; the drawn-avatar flipbook
  // stands in front; a paper plane drifts past the letters.
  const firstName = worldData.meta.name.split(/\s+/)[0] || worldData.meta.name;

  return (
    <group position={[0, 0, -3]}>
      {/* drawn-avatar flipbook, feet on the floor (replaces the old
          hand-inked waving stick figure) */}
      <AvatarFlipbook position={[0, AVATAR_HEIGHT / 2, 0]} />
      {/* nudged up from 0.6 -> 0.67 (top gap #5) so the title clears the
          avatar's raised hand instead of sitting right on top of it */}
      <OutlineTitle
        text={firstName}
        sub={`< ${worldData.meta.tagline} />`}
        height={1.35}
        position={[0, CORRIDOR_HEIGHT * 0.67, -1.5]}
      />
      {/* Was position [2.3, CORRIDOR_HEIGHT*0.9, -3.4] (world z=-6.4) with a
          -0.3 rad yaw — that put it noticeably FARTHER down the hall than
          the title (world z=-4.5) with a wide lateral footprint, so from a
          camera near the hero its silhouette converged toward the title's
          right edge and poked through the hollow "Y"/"U" strokes. First
          attempt pulled it much closer (local z=-1.2, world z=-4.2) so a
          modest world-x gap would hold up on screen — it did clear the
          wordmark, but being that close to the camera also blew up its
          apparent size/height enough to climb into the HUD icon row
          (site-map/audio/achievements) top-right. Settled on local z=-1.5 —
          exactly co-planar with the title (world z=-4.5) — so the title's
          own measured right edge and the plane's world-x sit at the SAME
          depth (a real, undistorted gap rather than one that compounds
          through differing perspective), nudged right of that edge, raised
          just above the title's top edge (comfortably below the ceiling at
          this depth, unlike at the closer z), and given a smaller yaw/scale
          so its footprint clears the wordmark at all camera distances
          between z=0 and z=-4.5. Nudged down/left once more from an initial
          [2.7, 0.917, -1.5] — that cleared the wordmark but its top corner
          still grazed the fixed HUD icon row (site-map/audio/achievements)
          top-right at this depth — top gap #5 */}
      <PaperPlane position={[2.5, CORRIDOR_HEIGHT * 0.86, -1.5]} rotation={[0.05, -0.12, 0.06]} scale={0.45} />
    </group>
  );
}

const FAR_VEIL_DISTANCE = 55;

/** Very soft, wide haze kept a fixed distance ahead of the camera, in the
 * corridor's own fog color — top gap #4: "far-end white glow looks like a
 * hole". Pre-blends the point where the floor/wall/ceiling lines converge
 * into a gentler gradient without touching the frozen fog config
 * (contracts.ts/palette.ts). Tracked via a ref in useFrame (no React state)
 * the same way QuantumCat's pupils track the pointer below. */
function FarVeil(): JSX.Element {
  const { camera } = useThree();
  const texture = useMemo(() => getFarVeilTexture(), []);
  const ref = useRef<THREE.Group>(null);

  useFrame(() => {
    if (ref.current) ref.current.position.z = camera.position.z - FAR_VEIL_DISTANCE;
  });

  return (
    <group ref={ref} position={[0, CORRIDOR_HEIGHT * 0.5, 0]}>
      <mesh>
        <planeGeometry args={[CORRIDOR_WIDTH * 1.4, CORRIDOR_HEIGHT * 1.8]} />
        <meshBasicMaterial map={texture} transparent opacity={0.6} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function Corridor(): JSX.Element {
  const { camera } = useThree();
  const [segIndex, setSegIndex] = useState(() => segmentIndexAt(camera.position.z, CORRIDOR.segmentLength));

  useFrame(() => {
    const current = segmentIndexAt(camera.position.z, CORRIDOR.segmentLength);
    // Functional update: React bails out of re-rendering when this returns
    // the same value, so walking within a segment costs nothing extra.
    setSegIndex((prev) => (prev === current ? prev : current));
  });

  const segments = useMemo(() => [segIndex - 1, segIndex, segIndex + 1] as const, [segIndex]);

  return (
    <group>
      <FarVeil />
      {segments.map((i) => (
        <group key={i}>
          <SegmentShell segmentIndex={i} />
          <SegmentDecor segmentIndex={i} />
          <DoorsSegmentContent segmentIndex={i} />
          {/* the hero title card repeats each loop — walking forever in
              either direction always returns to the same hallway */}
          <group position={[0, 0, repeatingZ(i, 0, CORRIDOR.segmentLength)]}>
            <EntryHero />
          </group>
        </group>
      ))}
    </group>
  );
}
