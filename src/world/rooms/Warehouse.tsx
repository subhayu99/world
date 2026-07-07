// Warehouse room: the workshop floor — a genuinely 3D gallery of client work.
// Each exhibit stands on a wooden tripod easel carrying a framed board (client,
// title, the headline metric big in accent ink, tags); easels stagger left and
// right down the hall and you scroll/drag to stroll past them. Hovering an
// easel colours its wooden frame (the itomdev move); clicking spotlights it —
// a paper veil dims the room — and opens the ExhibitCard overlay. Crates and
// barrels dress the edges; a dashed guide line marks the stroll.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as ReactDOM from 'react-dom/client';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { gsap } from 'gsap';
import { ROOM_ANCHORS } from '../contracts';
import type { Exhibit } from '../types';
import { useAchievements, useAudio, useWorldData } from '../state/hooks';
import { BLUEPRINT, DRAFT_FONT_FAMILY } from '../blueprint/palette';
import { Edges } from '../blueprint/primitives';
import { Barrel, OutlineTitle } from '../blueprint/props';
import { ensureDraftFont, parcelTexture, woodTexture } from '../blueprint/sketch';

export interface WarehouseProps {
  active: boolean;
  onReady: () => void;
}

import ExhibitCard from './ExhibitCard';

/** DOM modal in its own ReactDOM root, outside the R3F tree. */
function useDomOverlay(node: JSX.Element | null): void {
  const rootRef = useRef<ReactDOM.Root | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (node === null) {
      rootRef.current?.unmount();
      rootRef.current = null;
      if (containerRef.current) {
        containerRef.current.remove();
        containerRef.current = null;
      }
      return;
    }
    if (!containerRef.current) {
      const el = document.createElement('div');
      document.body.appendChild(el);
      containerRef.current = el;
      rootRef.current = ReactDOM.createRoot(el);
    }
    rootRef.current?.render(node);
  }, [node]);

  useEffect(() => {
    return () => {
      rootRef.current?.unmount();
      containerRef.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ---- exhibit board texture ----

const boardCache = new Map<string, THREE.CanvasTexture>();

function exhibitBoardTexture(e: Exhibit): THREE.CanvasTexture {
  const key = `${e.id}`;
  const hit = boardCache.get(key);
  if (hit) return hit;

  const w = 512;
  const h = 384;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fbfaf5';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(72,72,70,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    ctx.textAlign = 'center';
    // client
    ctx.font = `26px "${DRAFT_FONT_FAMILY}", cursive`;
    ctx.fillStyle = 'rgba(90,90,88,0.85)';
    ctx.fillText(e.client.toUpperCase(), w / 2, 64);
    // title (fit)
    let size = 36;
    ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
    while (ctx.measureText(e.title).width > w - 80 && size > 18) {
      size -= 2;
      ctx.font = `${size}px "${DRAFT_FONT_FAMILY}", cursive`;
    }
    ctx.fillStyle = '#3a3a38';
    ctx.fillText(e.title, w / 2, 112);
    // metric — the hero
    let msize = 64;
    ctx.font = `bold ${msize}px "${DRAFT_FONT_FAMILY}", cursive`;
    while (ctx.measureText(e.metric).width > w - 90 && msize > 30) {
      msize -= 3;
      ctx.font = `bold ${msize}px "${DRAFT_FONT_FAMILY}", cursive`;
    }
    ctx.fillStyle = '#c96f5f';
    ctx.fillText(e.metric, w / 2, 212);
    // accent underline
    const mw = ctx.measureText(e.metric).width;
    ctx.strokeStyle = 'rgba(201,111,95,0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w / 2 - mw / 2, 230);
    ctx.lineTo(w / 2 + mw / 2, 230);
    ctx.stroke();
    // tags
    ctx.font = `22px "${DRAFT_FONT_FAMILY}", cursive`;
    ctx.fillStyle = 'rgba(90,90,88,0.75)';
    const tags = e.tags.slice(0, 3).join('  ·  ');
    ctx.fillText(tags, w / 2, 296);
    // date
    ctx.font = `20px "${DRAFT_FONT_FAMILY}", cursive`;
    ctx.fillStyle = 'rgba(120,120,118,0.8)';
    ctx.fillText(e.date.toUpperCase(), w / 2, h - 42);
    ctx.textAlign = 'left';
  };

  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  void ensureDraftFont().then(() => {
    draw();
    texture.needsUpdate = true;
  });
  boardCache.set(key, texture);
  return texture;
}

// ---- easel ----
//
// The tripod rig is built from explicit foot/hinge points (not independent
// per-leg Euler tilts) so the three legs actually converge on one shared
// joint instead of splaying apart at the top (punchlist: "legs join
// awkwardly at the top"). `legTransform` turns a foot->hinge pair into the
// position+rotation a cylinder needs to span exactly between them. The hinge
// sits just above the board's own top edge, so the pivot knob + brace peek
// out above the (now more-tilted-back) board like a real field easel's
// wingnut, instead of floating in front of the board face.

const BOARD_W = 3.3;
const BOARD_H = BOARD_W * (384 / 512);

function legTransform(
  foot: THREE.Vector3,
  hinge: THREE.Vector3,
): { position: [number, number, number]; rotation: [number, number, number]; length: number } {
  const mid = foot.clone().lerp(hinge, 0.5);
  const dir = hinge.clone().sub(foot);
  const length = dir.length();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
  return { position: [mid.x, mid.y, mid.z], rotation: [euler.x, euler.y, euler.z], length };
}

// Board face sits at local z ~0.1 (frame at 0.12). Every leg/brace/knob point
// below keeps z <= -0.05 — strictly behind that plane along its whole run —
// so a leg can never cross in front of and occlude the board face (the bug:
// an earlier pass had feet in front of the board and the hinge behind it, so
// each leg swept straight across the board like a diagonal scratch).
const EASEL_FOOT_L = new THREE.Vector3(-BOARD_W * 0.46, 0, -0.05);
const EASEL_FOOT_R = new THREE.Vector3(BOARD_W * 0.46, 0, -0.05);
const EASEL_FOOT_REAR = new THREE.Vector3(0, 0, -1.05);
// Hinge sits above the (tilted) board's top edge (~y 3.38, z -0.07) and a
// touch further back, so the brace/knob read as peeking out behind+above
// the board rather than poking through its face.
const EASEL_HINGE_L = new THREE.Vector3(-0.55, 3.55, -0.2);
const EASEL_HINGE_R = new THREE.Vector3(0.55, 3.55, -0.2);
const EASEL_HINGE_REAR = new THREE.Vector3(0, 3.6, -0.22);

const EASEL_LEG_L = legTransform(EASEL_FOOT_L, EASEL_HINGE_L);
const EASEL_LEG_R = legTransform(EASEL_FOOT_R, EASEL_HINGE_R);
const EASEL_LEG_REAR = legTransform(EASEL_FOOT_REAR, EASEL_HINGE_REAR);

// The shelf/lip sit just *below* the board's bottom edge (not behind its
// face), so they stay visible regardless of z ordering instead of being
// silently hidden behind the opaque board.
const CROSSBAR_Y = 0.85;
const CROSSBAR_Z = 0.15;
const LIP_Y = 0.97;
const LIP_Z = 0.21;

// Flat wooden battens (not round dowels) for the legs: a real tripod's legs
// are rectangular stock, and a 4-edge box reads cleanly as EdgesGeometry
// outlines from any angle — an 8-gon cylinder viewed near end-on (as the
// single rear leg often is, from this camera) throws several of its facet
// edges into a cramped cluster instead of a clean silhouette.
const frontLegGeom = new THREE.BoxGeometry(0.1, EASEL_LEG_L.length, 0.06);
const rearLegGeom = new THREE.BoxGeometry(0.11, EASEL_LEG_REAR.length, 0.07);
const topBraceGeom = new THREE.BoxGeometry(EASEL_HINGE_R.x - EASEL_HINGE_L.x + 0.1, 0.09, 0.09);
const hingeKnobGeom = new THREE.SphereGeometry(0.095, 10, 8);
const crossbarGeom = new THREE.BoxGeometry(BOARD_W * 0.92, 0.13, 0.13);
const shelfLipGeom = new THREE.BoxGeometry(BOARD_W * 0.84, 0.08, 0.06);
const KNOB_COLOR = '#9c9a92'; // neutral "hardware" grey — reads as the wingnut, not wood

function Easel({
  exhibit,
  dimmed,
  selfSelected,
  onSelect,
}: {
  exhibit: Exhibit;
  dimmed: boolean;
  selfSelected: boolean;
  onSelect: () => void;
}) {
  const [hover, setHover] = useState(false);
  const board = useMemo(() => exhibitBoardTexture(exhibit), [exhibit]);
  const frameWood = useMemo(() => woodTexture({ colored: hover, w: 512, h: 64, seed: exhibit.id.length * 3 }), [hover, exhibit.id]);
  // frameSide is narrow/tall (0.14 x BOARD_H+0.28) — the opposite aspect of
  // frameWood's wide/short 512x64 canvas. Mapping that texture onto a tall
  // box puts its grain lines across the frame's width instead of along its
  // length, aliasing into a repeating comb pattern. A texture authored at
  // the matching narrow/tall aspect with `vertical` grain fixes it; frameTop
  // keeps using frameWood since its own aspect already matches.
  const frameWoodSide = useMemo(
    () => woodTexture({ colored: hover, w: 64, h: 512, seed: exhibit.id.length * 3 + 1, vertical: true }),
    [hover, exhibit.id],
  );

  const frameSide = useMemo(() => new THREE.BoxGeometry(0.14, BOARD_H + 0.28, 0.09), []);
  const frameTop = useMemo(() => new THREE.BoxGeometry(BOARD_W + 0.28, 0.14, 0.09), []);

  // Spotlight moment: gently scale up the whole rig (not just the board) so
  // the veil + card feel anchored to a physically singled-out easel.
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!groupRef.current) return;
    const target = selfSelected ? 1.08 : 1;
    const tween = gsap.to(groupRef.current.scale, { x: target, y: target, z: target, duration: 0.5, ease: 'power2.out' });
    return () => {
      tween.kill();
    };
  }, [selfSelected]);

  const opacity = dimmed ? 0.15 : 1;
  const woodColor = hover ? '#b98d5a' : '#ddd9d0';

  return (
    <group ref={groupRef}>
      {/* tripod legs: two front, one rear, all converging on the shared hinge */}
      <mesh geometry={frontLegGeom} position={EASEL_LEG_L.position} rotation={EASEL_LEG_L.rotation}>
        <meshBasicMaterial color={woodColor} transparent opacity={opacity} />
      </mesh>
      <Edges geometry={frontLegGeom} color={BLUEPRINT.line} opacity={0.5 * opacity} threshold={30} />
      <mesh geometry={frontLegGeom} position={EASEL_LEG_R.position} rotation={EASEL_LEG_R.rotation}>
        <meshBasicMaterial color={woodColor} transparent opacity={opacity} />
      </mesh>
      <Edges geometry={frontLegGeom} color={BLUEPRINT.line} opacity={0.5 * opacity} threshold={30} />
      <mesh geometry={rearLegGeom} position={EASEL_LEG_REAR.position} rotation={EASEL_LEG_REAR.rotation}>
        <meshBasicMaterial color={woodColor} transparent opacity={opacity} />
      </mesh>
      <Edges geometry={rearLegGeom} color={BLUEPRINT.line} opacity={0.5 * opacity} threshold={30} />

      {/* top brace + pivot knob: the join the legs actually converge on. The
          knob is a plain solid dot (no Edges wireframe) — a low-poly sphere's
          lat/long facet lines read as a spiky wireframe dome at this scale,
          especially once perspective shrinks it for the far easels down the
          hall; the lamp bulb uses the same solid-dot treatment. */}
      <mesh geometry={topBraceGeom} position={[0, EASEL_HINGE_L.y, EASEL_HINGE_L.z]}>
        <meshBasicMaterial color={woodColor} transparent opacity={opacity} />
      </mesh>
      <Edges geometry={topBraceGeom} color={BLUEPRINT.line} opacity={0.5 * opacity} threshold={30} />
      <mesh geometry={hingeKnobGeom} position={[0, EASEL_HINGE_L.y + 0.02, EASEL_HINGE_L.z]}>
        <meshBasicMaterial color={KNOB_COLOR} transparent opacity={opacity} />
      </mesh>

      {/* crossbar + shelf lip the board rests on */}
      <mesh geometry={crossbarGeom} position={[0, CROSSBAR_Y, CROSSBAR_Z]}>
        <meshBasicMaterial color={woodColor} transparent opacity={opacity} />
      </mesh>
      <Edges geometry={crossbarGeom} color={BLUEPRINT.line} opacity={0.5 * opacity} threshold={30} />
      <mesh geometry={shelfLipGeom} position={[0, LIP_Y, LIP_Z]}>
        <meshBasicMaterial color={hover ? '#8a6238' : '#c7c4ba'} transparent opacity={opacity} />
      </mesh>
      <Edges geometry={shelfLipGeom} color={BLUEPRINT.line} opacity={0.55 * opacity} threshold={30} />

      {/* framed board, leaning back a touch more than before */}
      <group
        position={[0, 2.15, 0.1]}
        rotation={[-0.14, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          if (!dimmed) onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (dimmed) return;
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <mesh>
          <planeGeometry args={[BOARD_W, BOARD_H]} />
          <meshBasicMaterial map={board} transparent opacity={opacity} />
        </mesh>
        {/* wooden frame */}
        {[-1, 1].map((sx) => (
          <mesh key={`v${sx}`} geometry={frameSide} position={[sx * (BOARD_W / 2 + 0.07), 0, 0.02]}>
            <meshBasicMaterial map={frameWoodSide} transparent opacity={opacity} />
          </mesh>
        ))}
        {[-1, 1].map((sy) => (
          <mesh key={`h${sy}`} geometry={frameTop} position={[0, sy * (BOARD_H / 2 + 0.07), 0.02]}>
            <meshBasicMaterial map={frameWood} transparent opacity={opacity} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Crate stacks + barrels dressing the hall edges. */
function Dressing({ z, side }: { z: number; side: number }) {
  const crateTex = useMemo(() => parcelTexture('', { face: 'side' }), []);
  const geoBig = useMemo(() => new THREE.BoxGeometry(1.1, 1.1, 1.1), []);
  const geoSmall = useMemo(() => new THREE.BoxGeometry(0.8, 0.8, 0.8), []);
  return (
    <group position={[side * 7.2, 0, z]}>
      <mesh geometry={geoBig} position={[0, 0.55, 0]} rotation={[0, side * 0.3, 0]}>
        <meshBasicMaterial map={crateTex} />
      </mesh>
      <Edges geometry={geoBig} color={BLUEPRINT.line} opacity={0.6} />
      <mesh geometry={geoSmall} position={[0.25, 1.5, 0.1]} rotation={[0, side * -0.2, 0]}>
        <meshBasicMaterial map={crateTex} />
      </mesh>
      <Edges geometry={geoSmall} color={BLUEPRINT.line} opacity={0.6} />
      <Barrel position={[side * -1.4, 0.45, 0.6]} r={0.5} h={0.85} />
    </group>
  );
}

// ---- hall dressing: floor, ground, far backdrop, bunting, lamps ----
// Local canvas-texture helpers (Warehouse-only — the shared blueprint/sketch.ts
// generators stay untouched). Each is cached at module scope since Canvas
// textures are expensive to redraw and every one of these is identical across
// re-renders (nothing here varies per exhibit).

const floorCache = new Map<string, THREE.CanvasTexture>();

/** Darker plank seams + denser edge nails than the shared woodTexture, so the
 * stroll strip reads as a walked wooden floor instead of a faint hint. */
function warehouseFloorTexture(): THREE.CanvasTexture {
  const key = 'floor';
  const hit = floorCache.get(key);
  if (hit) return hit;

  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');

  ctx.fillStyle = '#e9e7e0';
  ctx.fillRect(0, 0, w, h);

  let seed = 11;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const planks = 6;
  const plankW = w / planks;

  // sparse long grain lines per plank
  ctx.strokeStyle = 'rgba(96,96,94,0.32)';
  ctx.lineWidth = 1.4;
  for (let p = 0; p < planks; p++) {
    const cx = plankW * (p + 0.5);
    for (let i = 0; i < 2; i++) {
      const y0 = h * (0.15 + i * 0.42) + (rnd() - 0.5) * 26;
      ctx.beginPath();
      let x = cx - plankW / 2 + 6;
      let y = y0;
      ctx.moveTo(x, y);
      while (x < cx + plankW / 2 - 6) {
        const nx = x + 16 + rnd() * 18;
        const ny = y0 + (rnd() - 0.5) * 8;
        ctx.quadraticCurveTo((x + nx) / 2, y + (rnd() - 0.5) * 6, nx, ny);
        x = nx;
        y = ny;
      }
      ctx.stroke();
    }
  }

  // darkened plank seams (heavier than the shared blueprint wood texture)
  ctx.strokeStyle = 'rgba(56,56,54,0.85)';
  ctx.lineWidth = 3;
  for (let i = 1; i < planks; i++) {
    const x = plankW * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // edge nails, four rows per plank — reads as jointed boards once tiled down the hall
  ctx.fillStyle = 'rgba(56,56,54,0.8)';
  for (let p = 0; p < planks; p++) {
    const cx = plankW * (p + 0.5);
    for (const ny of [h * 0.06, h * 0.36, h * 0.64, h * 0.94]) {
      for (const nx of [cx - plankW * 0.32, cx + plankW * 0.32]) {
        ctx.beginPath();
        ctx.arc(nx, ny, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  floorCache.set(key, texture);
  return texture;
}

let groundTexCache: THREE.CanvasTexture | null = null;

/** Bigger, higher-contrast graph-paper ground than the shared gridTexture
 * default — the hall's grid was reading as near-invisible fine noise from a
 * stroll distance. */
function warehouseGroundTexture(): THREE.CanvasTexture {
  if (groundTexCache) return groundTexCache;
  const tile = 256;
  const canvas = document.createElement('canvas');
  canvas.width = tile;
  canvas.height = tile;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');

  ctx.fillStyle = BLUEPRINT.ground;
  ctx.fillRect(0, 0, tile, tile);
  ctx.strokeStyle = 'rgba(74,74,72,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tile / 2 + 0.5, 0);
  ctx.lineTo(tile / 2 + 0.5, tile);
  ctx.moveTo(0, tile / 2 + 0.5);
  ctx.lineTo(tile, tile / 2 + 0.5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(74,74,72,0.18)';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(0.7, 0.7, tile - 1.4, tile - 1.4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  groundTexCache = texture;
  return texture;
}

let crateBackdropCache: THREE.CanvasTexture | null = null;

/** A flat "more inventory stacked deep in the hall" backdrop — low-horizon
 * interest at the far end so the easels don't float against a bare void. */
function crateBackdropTexture(): THREE.CanvasTexture {
  if (crateBackdropCache) return crateBackdropCache;
  const w = 1280;
  const h = 460;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');

  ctx.fillStyle = BLUEPRINT.ground;
  ctx.fillRect(0, 0, w, h);

  const groundY = h * 0.88;
  ctx.strokeStyle = 'rgba(74,74,72,0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();

  let seed = 42;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const cols = 15;
  for (let i = 0; i < cols; i++) {
    const cx = (w * (i + 0.5)) / cols + (rnd() - 0.5) * 26;
    const stackH = 1 + Math.floor(rnd() * 3);
    let y = groundY;
    for (let s = 0; s < stackH; s++) {
      const cw = 56 + rnd() * 46;
      const ch = 42 + rnd() * 30;
      const x0 = cx - cw / 2 + (rnd() - 0.5) * 8;
      const y0 = y - ch;
      ctx.fillStyle = 'rgba(236,234,226,0.6)';
      ctx.fillRect(x0, y0, cw, ch);
      ctx.strokeStyle = 'rgba(74,74,72,0.3)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x0, y0, cw, ch);
      ctx.beginPath();
      ctx.moveTo(x0, y0 + ch / 2);
      ctx.lineTo(x0 + cw, y0 + ch / 2);
      ctx.stroke();
      y = y0;
    }
  }

  // Fade the left/right edges to transparent so the backdrop reads as hazy
  // depth rather than a hard-edged flat rectangle floating behind the boards.
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createLinearGradient(0, 0, w, 0);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(0.14, 'rgba(0,0,0,1)');
  mask.addColorStop(0.86, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  crateBackdropCache = texture;
  return texture;
}

let lampGlowCache: THREE.CanvasTexture | null = null;

function lampGlowTexture(): THREE.CanvasTexture {
  if (lampGlowCache) return lampGlowCache;
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(217,180,95,0.5)');
  grad.addColorStop(0.55, 'rgba(217,180,95,0.18)');
  grad.addColorStop(1, 'rgba(217,180,95,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  lampGlowCache = texture;
  return texture;
}

/** Standing lamp: pole + head + warm glow pool on the floor beneath it. */
function Lamp({ position }: { position: [number, number, number] }) {
  const glow = useMemo(() => lampGlowTexture(), []);
  const poleGeom = useMemo(() => new THREE.CylinderGeometry(0.05, 0.07, 2.6, 8), []);
  const headGeom = useMemo(() => new THREE.ConeGeometry(0.26, 0.36, 10), []);
  const bulbGeom = useMemo(() => new THREE.SphereGeometry(0.13, 10, 10), []);
  return (
    <group position={position}>
      <mesh geometry={poleGeom} position={[0, 1.3, 0]}>
        <meshBasicMaterial color="#c9c6bc" />
      </mesh>
      <Edges geometry={poleGeom} color={BLUEPRINT.line} opacity={0.5} threshold={30} />
      <mesh geometry={headGeom} position={[0, 2.78, 0]} rotation={[Math.PI, 0, 0]}>
        <meshBasicMaterial color="#c9c6bc" />
      </mesh>
      <Edges geometry={headGeom} color={BLUEPRINT.line} opacity={0.5} threshold={30} />
      <mesh geometry={bulbGeom} position={[0, 2.58, 0]}>
        <meshBasicMaterial color={BLUEPRINT.accentWarm} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[3.2, 3.2]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

const FLAG_COLORS = [BLUEPRINT.accent, BLUEPRINT.accentWarm, BLUEPRINT.accentCool, '#e6e4dc'] as const;

function paperFlagGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array([-0.22, 0, 0, 0.22, 0, 0, 0, -0.34, 0]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
const FLAG_GEOM = paperFlagGeometry();

/** A hanging cable of small paper flags across the hall entry — the
 * itomdev clothesline move, in pennants rather than exhibit boards. */
function Bunting({ z, spanX = 8, count = 11, baseY = 4.0 }: { z: number; spanX?: number; count?: number; baseY?: number }) {
  const lineGeom = useMemo(() => {
    const segs = 24;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = (t - 0.5) * spanX * 2;
      const sag = Math.sin(t * Math.PI) * 0.4;
      pts.push(new THREE.Vector3(x, baseY - sag, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [spanX, baseY]);

  const flags = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const t = (i + 0.5) / count;
        const x = (t - 0.5) * spanX * 2;
        const sag = Math.sin(t * Math.PI) * 0.4;
        return { x, y: baseY - sag, color: FLAG_COLORS[i % FLAG_COLORS.length] };
      }),
    [count, spanX, baseY],
  );

  return (
    <group position={[0, 0, z]}>
      <line>
        {/* eslint-disable-next-line react/no-unknown-property */}
        <primitive object={lineGeom} attach="geometry" />
        <lineBasicMaterial color={BLUEPRINT.line} transparent opacity={0.55} />
      </line>
      {flags.map((f, i) => (
        <group key={i} position={[f.x, f.y - 0.02, 0]}>
          <mesh geometry={FLAG_GEOM}>
            <meshBasicMaterial color={f.color} side={THREE.DoubleSide} transparent opacity={0.92} />
          </mesh>
          <Edges geometry={FLAG_GEOM} color={BLUEPRINT.line} opacity={0.55} threshold={5} />
        </group>
      ))}
    </group>
  );
}

const SPACING = 5.4;
const START_Z = -9;

export default function Warehouse({ active, onReady }: WarehouseProps) {
  const worldData = useWorldData();
  const audio = useAudio();
  const achievements = useAchievements();

  const exhibits = worldData.warehouse.exhibits;
  const [selected, setSelected] = useState<Exhibit | null>(null);
  const readyFiredRef = useRef(false);

  const strollRef = useRef<THREE.Group>(null);
  const scroll = useRef({ target: 0, current: 0 });
  const loopLen = exhibits.length * SPACING; // endless stroll: content repeats every loopLen

  useEffect(() => {
    if (!active) return;
    const onWheel = (e: WheelEvent) => {
      if (selected) return;
      scroll.current.target += e.deltaY * 0.01;
    };
    let dragY: number | null = null;
    const onDown = (e: PointerEvent) => {
      dragY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (dragY === null || selected) return;
      scroll.current.target += (dragY - e.clientY) * 0.02;
      dragY = e.clientY;
    };
    const onUp = () => {
      dragY = null;
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [active, selected]);

  useFrame(() => {
    const s = scroll.current;
    s.current += (s.target - s.current) * 0.07;
    // wrap the stroll modulo one loop; a duplicate copy offset by -loopLen
    // keeps the seam covered so the wrap is invisible
    if (strollRef.current) strollRef.current.position.z = ((s.current % loopLen) + loopLen) % loopLen;
  });

  useEffect(() => {
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    const raf = requestAnimationFrame(onReady);
    return () => cancelAnimationFrame(raf);
  }, [onReady]);

  useEffect(() => {
    if (!active) setSelected(null);
  }, [active]);

  const select = (e: Exhibit) => {
    audio.play('pageFlip');
    achievements.unlock('inspect_exhibit');
    setSelected(e);
  };

  useDomOverlay(selected ? <ExhibitCard exhibit={selected} onClose={() => setSelected(null)} /> : null);

  // spotlight veil
  const veilOpacity = useRef({ v: 0 });
  const veilMat = useRef<THREE.MeshBasicMaterial>(null);
  useEffect(() => {
    gsap.to(veilOpacity.current, {
      v: selected ? 0.55 : 0,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => {
        if (veilMat.current) veilMat.current.opacity = veilOpacity.current.v;
      },
    });
  }, [selected]);

  const floorTex = useMemo(() => {
    const t = warehouseFloorTexture();
    t.repeat.set(3, 16);
    return t;
  }, []);
  const groundTex = useMemo(() => {
    const t = warehouseGroundTexture();
    t.repeat.set(12, 12);
    return t;
  }, []);
  const backdropTex = useMemo(() => crateBackdropTexture(), []);

  const hallLen = exhibits.length * SPACING + 24;
  // Just past the last easel, so the hall doesn't end in a bare void.
  const backdropZ = START_Z - exhibits.length * SPACING - 7;

  return (
    <group position={[0, 0, ROOM_ANCHORS.warehouse]}>
      <OutlineTitle text="THE WAREHOUSE" sub="client work, shipped" height={1.35} position={[0, 4.6, -12]} />

      {/* wood stroll strip + paper ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, START_Z - hallLen / 2 + 6]}>
        <planeGeometry args={[7, hallLen]} />
        <meshBasicMaterial map={floorTex} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, -30]}>
        <planeGeometry args={[160, 160]} />
        <meshBasicMaterial map={groundTex} />
      </mesh>

      {/* paper veil for the spotlight moment */}
      <mesh position={[0, 3, -22]}>
        <planeGeometry args={[80, 40]} />
        <meshBasicMaterial ref={veilMat} color="#efede5" transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={strollRef}>
        {/* the whole hall renders twice, one loop-length apart — the stroll
            offset wraps modulo loopLen, so the seam is always covered and
            the walk is endless in both directions */}
        {[0, -loopLen].map((zOff) => (
          <group key={zOff} position={[0, 0, zOff]}>
            {/* low horizon interest: more inventory stacked deep in the hall,
                instead of easels floating against a bare void */}
            <mesh position={[0, 5, backdropZ]}>
              <planeGeometry args={[22, 10]} />
              <meshBasicMaterial map={backdropTex} transparent depthWrite={false} />
            </mesh>

            {/* paper-flag bunting across the hall entry */}
            <Bunting z={START_Z + 3} />
            <Lamp position={[5.4, 0, START_Z - 1]} />
            <Lamp position={[-5.4, 0, START_Z - SPACING * 4.5]} />

            {exhibits.map((e, i) => {
              const side = i % 2 === 0 ? -1 : 1;
              const z = START_Z - i * SPACING;
              const isSelfSelected = selected !== null && selected.id === e.id;
              return (
                <group key={e.id} position={[side * 3.4, 0, z]} rotation={[0, side * -0.38, 0]}>
                  <Easel exhibit={e} dimmed={selected !== null && !isSelfSelected} selfSelected={isSelfSelected} onSelect={() => select(e)} />
                </group>
              );
            })}
            {/* edge dressing every few stations. Starts at i=1, not i=0: the
                first exhibit's crate/barrel dressing used to land almost on
                top of the fixed Lamp #1 below (i=0 dressing's barrel sits at
                world ~(5.8, -10.8); Lamp #1 is a hardcoded (5.4, -10) — well
                inside the barrel's own footprint, reading as a pole
                skewering it). Every other index's dressing already clears
                both fixed lamps by a wide margin, so shifting the cadence by
                one exhibit is enough — no lamp/crate placements need to move. */}
            {exhibits.map((e, i) => (i % 3 === 1 ? <Dressing key={`d${e.id}`} z={START_Z - i * SPACING - 2.4} side={i % 2 === 0 ? 1 : -1} /> : null))}
          </group>
        ))}
      </group>
    </group>
  );
}
