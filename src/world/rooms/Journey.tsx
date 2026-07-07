// Journey room: you follow a folded paper plane flying along a 3D spline
// through the career timeline — the itomdev about-room, rebuilt with our
// content. Cumulus clouds part away from the plane as it passes; each career
// beat is a floating drawing-sheet station tethered to the flight path; major
// eras are floating rock islands with carved names below the path; a SKILLS
// moment scatters poppable balloons (they come back); the ride ends at the
// awards certificates floating among clouds. Scroll/touch drives progress —
// the camera chases the plane with gentle banking.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ROOM_ANCHORS } from '../contracts';
import type { JourneyBeat } from '../types';
import { useAchievements, useAudio, useWorldData } from '../state/hooks';
import { BLUEPRINT, DRAFT_FONT_FAMILY } from '../blueprint/palette';
import { PaperPlane } from '../blueprint/primitives';
import { gridTexture } from '../blueprint/sheets';
import { Balloon, OutlineTitle, RockIsland } from '../blueprint/props';
import { certificateTexture, ensureDraftFont } from '../blueprint/sketch';
import { assetTexture } from '../assets';
import { chapterTitleT, lapWindowFade, seededRand } from './journeyLayout';

export interface JourneyProps {
  active: boolean;
  onReady: () => void;
}

const FLY_ACHIEVEMENT_PROGRESS = 0.22;
const SCROLL_PER_WHEEL = 0.00022; // deltaY 500 ≈ 11% of the path
const DAMPING = 0.045;

/** Flight path control points (room-local). Rises and weaves; ~100 units. */
const PATH_POINTS: [number, number, number][] = [
  [0, 1.4, 18],
  [0, 2, 6],
  [4, 4, -8],
  [-5, 6.5, -22],
  [4.5, 9, -36],
  [-4.5, 11.5, -50],
  [4, 14, -64],
  [-3, 16.5, -78],
  [0, 18.5, -92],
];

/** z depth of one content lap; the pattern repeats every lap, treadmill-style. */
const LAP_DEPTH = 110;

/** Era islands: beat id -> carved island name (dates come from the beat). */
const ERA_ISLANDS: Record<string, string> = {
  college: 'COLLEGE',
  intern: 'FIFTYFIVE',
  loop: 'LOOP AI',
};

const FALLBACK_SKILLS = ['Python', 'SQL', 'BigQuery', 'Airflow', 'Docker', 'FastAPI'];

/** Local "right" vector for a point on the flight curve: tangent × world-up,
 * projected to the XZ plane. Used instead of a flat world-x shift for lateral
 * offsets (award certificates) — PATH_POINTS weaves sharply in x through the
 * awards' placement window (t~0.55-0.75), and a flat +/-x shift there can
 * point almost along the camera's own line of travel rather than away from
 * it, putting the offset content directly ahead of the chase camera. */
function rightFromTangent(tangent: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  out.set(-tangent.z, 0, tangent.x);
  if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
  return out.normalize();
}

/** Lateral distance (world units) an award certificate sits from the flight
 * path centerline. Was 5.6 (same order as a station's own lateral offset),
 * but PATH_POINTS bends sharply through the awards' own placement window
 * (t~0.55-0.75, x swinging 4 -> -5 -> 4.5 -> -4.5) — numerically, even with
 * the perpendicular right-vector offset above, 5.6 units left the closest
 * approach where the certificate is still inside the camera's horizontal
 * frustum at only ~5.7-6.8 world units (a 4.1-unit-wide board at 5.7 units
 * subtends ~40 degrees, roughly half the 85-degree horizontal FOV — "fills
 * roughly the right third of the frame" per the audit). 9 pushes that
 * closest in-frustum approach out to ~11-15 units across all three awards. */
const AWARDS_LATERAL = 9;

/** Darker-than-paper tone for the plane (blueprint/primitives.tsx's default
 * `tone` is near-white, which reads as white-on-white against the sky mid
 * flight — see itomdev-research/world-judge/live-journey.png). */
const PLANE_TONE = '#d6d2c4';

// ---- cloud image sprites ----
// Drawn cloud textures (public/textures/clouds/) replace the old procedural
// cumulus/wisp canvases. seed % 8 keeps each Cloud/PartingClouds instance
// pinned to a stable image across re-renders.
const CLOUD_IMAGES = [
  '1131c3eb-dfae-423f-924b-ff39d8ccd6dc.webp',
  '254b8ec8-d6f7-4275-956f-7bab65b2ce2d.webp',
  '2cc88dd1-483c-466d-b07e-f8308c61ccbe.webp',
  '5606fcc0-3252-447d-a58a-7bcbac73229a.webp',
  '7882dc72-3d01-41fb-ac0e-d07b0184ebc1.webp',
  '9b2ca72f-7bd0-473b-ba6e-dd9e0eb79d35.webp',
  'c83293c6-d90c-4a32-8d9d-5ac9af7e2296.webp',
  'f6e358bc-d27c-41dd-95f4-6787a835c41e.webp',
];

function cloudImageTexture(seed: number): THREE.Texture {
  const idx = ((seed % CLOUD_IMAGES.length) + CLOUD_IMAGES.length) % CLOUD_IMAGES.length;
  return assetTexture(`textures/clouds/${CLOUD_IMAGES[idx]}`);
}

/** Billboard cloud sprite — drawn-image stand-in for blueprint/props.tsx's
 * procedural Cloud (that file is frozen, not editable here). Same
 * seed/width/wisp/opacity/billboard contract as the procedural version, so
 * every existing call site (AwardsRun, SkillsMoment) is unchanged; only the
 * texture source and material differ. `wisp` still picks the old aspect
 * ratio (not the image) so each instance keeps its previously-tuned scale. */
function Cloud({
  seed = 1,
  width = 6,
  wisp = false,
  opacity = 1,
  billboard = true,
  position,
}: {
  seed?: number;
  width?: number;
  wisp?: boolean;
  opacity?: number;
  billboard?: boolean;
  position?: [number, number, number];
}) {
  const texture = useMemo(() => cloudImageTexture(seed), [seed]);
  const aspect = wisp ? 512 / 200 : 512 / 340;
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (billboard && ref.current) ref.current.quaternion.copy(camera.quaternion);
  });
  return (
    <group ref={ref} position={position}>
      <mesh>
        <planeGeometry args={[width, width / aspect]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.05} depthWrite={false} opacity={opacity} />
      </mesh>
    </group>
  );
}

// ---- brighter station-sheet texture ----
// sheets.ts's sheetTexture() renders BLUEPRINT.face (off-white) panels that
// read grey/washed against the cumulus clouds at flight distance. sheets.ts
// is frozen, so this is a Journey-local variant: a near-white
// (BLUEPRINT.faceRaised) face, larger type, and a pinned tape-corner accent —
// cached the same way sketch.ts's generators are (session-lifetime, never
// disposed; see Warehouse.tsx's exhibitBoardTexture for the identical
// pattern).
const stationSheetCache = new Map<string, THREE.CanvasTexture>();

interface StationSheetSpec {
  title: string;
  date?: string;
  body?: string;
  sheetNo?: string;
  accent: string;
  tapeSide: 'left' | 'right';
  index: number;
}

function wrapStationLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

function stationSheetTexture(spec: StationSheetSpec): THREE.CanvasTexture {
  const key = `${spec.title}/${spec.date ?? ''}/${spec.sheetNo ?? ''}/${spec.tapeSide}/${spec.index}`;
  const hit = stationSheetCache.get(key);
  if (hit) return hit;

  const w = 720;
  const h = Math.round(w * (440 / 640));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    // panel — near-white so the sheet still reads clean against clouds
    ctx.fillStyle = BLUEPRINT.faceRaised;
    ctx.fillRect(0, 0, w, h);
    // double frame
    ctx.strokeStyle = BLUEPRINT.line;
    ctx.lineWidth = 3.4;
    ctx.strokeRect(11, 11, w - 22, h - 22);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(22, 22, w - 44, h - 44);

    const blockH = 62;
    const pad = 46;
    const innerW = w - pad * 2;

    // title — sized up from the standard sheet
    ctx.fillStyle = BLUEPRINT.textPrimary;
    ctx.textBaseline = 'alphabetic';
    let titleSize = 50;
    ctx.font = `${titleSize}px "${DRAFT_FONT_FAMILY}", cursive`;
    while (ctx.measureText(spec.title.toUpperCase()).width > innerW && titleSize > 26) {
      titleSize -= 2;
      ctx.font = `${titleSize}px "${DRAFT_FONT_FAMILY}", cursive`;
    }
    ctx.fillText(spec.title.toUpperCase(), pad, 22 + pad + titleSize * 0.6);

    // accent rule under title
    ctx.strokeStyle = spec.accent;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(pad, 22 + pad + titleSize * 0.6 + 15);
    ctx.lineTo(pad + Math.min(innerW, ctx.measureText(spec.title.toUpperCase()).width + 8), 22 + pad + titleSize * 0.6 + 15);
    ctx.stroke();

    // body
    if (spec.body) {
      ctx.fillStyle = BLUEPRINT.textDim;
      ctx.font = `27px "${DRAFT_FONT_FAMILY}", cursive`;
      const lines = wrapStationLines(ctx, spec.body, innerW);
      const lineH = 37;
      const top = 22 + pad + titleSize * 0.6 + 48;
      const maxLines = Math.floor((h - blockH - 32 - top) / lineH);
      lines.slice(0, maxLines).forEach((line, i) => {
        ctx.fillText(line, pad, top + i * lineH + 22);
      });
    }

    // title block strip
    const by = h - 22 - blockH;
    ctx.strokeStyle = BLUEPRINT.line;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(22, by);
    ctx.lineTo(w - 22, by);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.55, by);
    ctx.lineTo(w * 0.55, h - 22);
    ctx.stroke();
    const leftCellW = w * 0.55 - 54;
    let blockSize = 20;
    ctx.font = `${blockSize}px "${DRAFT_FONT_FAMILY}", cursive`;
    const blockLabel = 'SUBHAYU KUMAR BALA — NOTEBOOK';
    while (ctx.measureText(blockLabel).width > leftCellW && blockSize > 11) {
      blockSize -= 1;
      ctx.font = `${blockSize}px "${DRAFT_FONT_FAMILY}", cursive`;
    }
    ctx.fillStyle = BLUEPRINT.textDim;
    ctx.fillText(blockLabel, 38, by + blockH / 2 + blockSize * 0.35);
    ctx.font = `18px "${DRAFT_FONT_FAMILY}", cursive`;
    ctx.fillStyle = spec.accent;
    if (spec.date) ctx.fillText(spec.date.toUpperCase(), w * 0.55 + 16, by + 24);
    ctx.fillStyle = BLUEPRINT.textDim;
    if (spec.sheetNo) ctx.fillText(spec.sheetNo, w * 0.55 + 16, by + 48);

    // pinned tape corner — a small colour-pencil pop, alternating side/hue
    // per sheet so the run doesn't feel stamped from one template
    const accentColors = [BLUEPRINT.accentCool, BLUEPRINT.accent, BLUEPRINT.accentWarm];
    const tapeColor = accentColors[spec.index % accentColors.length];
    const tapeX = spec.tapeSide === 'left' ? w * 0.2 : w * 0.8;
    ctx.save();
    ctx.translate(tapeX, 4);
    ctx.rotate(spec.tapeSide === 'left' ? -0.16 : 0.16);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = tapeColor;
    ctx.fillRect(-46, -15, 92, 32);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = tapeColor;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(-46, -15, 92, 32);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.fillStyle = tapeColor;
    ctx.arc(tapeX, 11, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = BLUEPRINT.line;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  };

  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  void ensureDraftFont().then(() => {
    draw();
    texture.needsUpdate = true;
  });
  stationSheetCache.set(key, texture);
  return texture;
}

// ---- soft drop-shadow blob for the award certificates ----
let certShadowTex: THREE.CanvasTexture | null = null;
function certShadowTexture(): THREE.CanvasTexture {
  if (certShadowTex) return certShadowTex;
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  const grad = ctx.createRadialGradient(s / 2, s / 2, s * 0.06, s / 2, s / 2, s * 0.5);
  grad.addColorStop(0, 'rgba(58,58,56,0.3)');
  grad.addColorStop(0.7, 'rgba(58,58,56,0.12)');
  grad.addColorStop(1, 'rgba(58,58,56,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  certShadowTex = texture;
  return texture;
}

interface Station {
  beat: JourneyBeat;
  t: number;
  pathPoint: THREE.Vector3;
  sheetPos: THREE.Vector3;
  rotY: number;
  side: number;
}

function buildStations(beats: JourneyBeat[], curve: THREE.CatmullRomCurve3, lateral: number): Station[] {
  return beats.map((beat, i) => {
    // leave the first stretch of the ride clear (intro title + open sky)
    const t = 0.1 + (0.52 * i) / Math.max(1, beats.length - 1);
    const p = curve.getPoint(t);
    const side = i % 2 === 0 ? -1 : 1;
    const sheetPos = p.clone().add(new THREE.Vector3(side * lateral, 0.6, 0));
    return { beat, t, pathPoint: p, sheetPos, rotY: side * -0.55, side };
  });
}

function StationSheet({ station, index, total }: { station: Station; index: number; total: number }) {
  const texture = useMemo(
    () =>
      stationSheetTexture({
        title: station.beat.title,
        date: station.beat.date,
        body: station.beat.body,
        sheetNo: `SHT ${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`,
        accent: station.beat.kind === 'award' ? BLUEPRINT.accentWarm : BLUEPRINT.accent,
        tapeSide: station.side < 0 ? 'left' : 'right',
        index,
      }),
    [station.beat, station.side, index, total],
  );
  // stationSheetTexture is session-cached (like sketch.ts's generators) —
  // never dispose a cached texture, the next visit would reuse a dead one.

  const w = 4.3;
  const h = w * (440 / 640);
  return (
    <group>
      <group position={station.sheetPos.toArray()} rotation={[0, station.rotY, 0]}>
        {/* opaque + renderOrder so the semi-transparent clouds never wash it
         * out mid-flight regardless of camera-distance sort order */}
        <mesh renderOrder={4}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={texture} />
        </mesh>
        {/* clean paper back — the loop's return leg flies past the sheets
         * from behind; a DoubleSide face showed mirrored text there */}
        <mesh rotation={[0, Math.PI, 0]} position={[0, 0, -0.012]} renderOrder={4}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial color="#eceae2" />
        </mesh>
      </group>
    </group>
  );
}

/** Award certificate floating among the finale clouds. */
function Certificate({ x, i, title, issuer, date }: { x: number; i: number; title: string; issuer: string; date: string }) {
  const texture = useMemo(() => certificateTexture(title, issuer, date, i + 1), [title, issuer, date, i]);
  const shadow = useMemo(() => certShadowTexture(), []);
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = 0.6 + Math.sin(t * 0.6 + i * 2.4) * 0.22;
    ref.current.rotation.z = Math.sin(t * 0.45 + i) * 0.04;
  });
  const w = 4.1;
  const h = w * (320 / 460);
  return (
    <group ref={ref} position={[x, 0.6, 0]} rotation={[0, (i - 1) * 0.16, 0]}>
      {/* soft drop-shadow blob behind everything so the certificate pops
       * off the sky instead of floating flat against it */}
      <mesh position={[0.14, -0.18, -0.08]}>
        <planeGeometry args={[w * 1.4, h * 1.55]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>
      {/* paper backing gives it body */}
      <mesh position={[0.05, -0.07, -0.03]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#d9d7cf" />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} transparent />
      </mesh>
    </group>
  );
}

/** Awards line the SIDES of the flight path (no terminal gallery — the ride
 * is an endless loop, so nothing may read as "the end"). Each certificate
 * floats beside the path like a station, with a cloud tucked behind it. */
function AwardsRun({ curve, titleT }: { curve: THREE.CatmullRomCurve3; titleT: number }) {
  const data = useWorldData();
  const titlePos = useMemo(() => curve.getPoint(titleT).clone().add(new THREE.Vector3(0, 5.0, 0)), [curve, titleT]);
  const spots = useMemo(
    () =>
      data.journey.awards.map((award, i) => {
        const t = 0.64 + i * 0.055;
        const p = curve.getPoint(t);
        const tangent = curve.getTangent(t);
        // lateral offset perpendicular to the actual flight direction here
        // (see rightFromTangent) instead of a flat world-x shift
        const right = rightFromTangent(tangent);
        const side = i % 2 === 0 ? 1 : -1;
        const pos = p.clone().addScaledVector(right, side * AWARDS_LATERAL);
        pos.y += 0.6;
        // face back toward the oncoming camera (opposite the flight tangent)
        // instead of a fixed yaw, so it still reads correctly through a bend,
        // plus the same stylistic inward tilt as before
        const facing = Math.atan2(-tangent.x, -tangent.z);
        return {
          award,
          pos: pos.toArray() as [number, number, number],
          rotY: facing + side * -0.45,
          side,
        };
      }),
    [curve, data.journey.awards],
  );
  return (
    <group>
      <OutlineTitle text="AWARDS" height={1.5} position={titlePos.toArray()} />
      {spots.map((s, i) => (
        <group key={s.award.id} position={s.pos} rotation={[0, s.rotY, 0]}>
          <Cloud seed={71 + i} width={5.2} opacity={0.8} position={[s.side * 1.4, 0.6, -3.8]} />
          <Certificate x={0} i={i} title={s.award.title} issuer={s.award.issuer} date={s.award.date} />
        </group>
      ))}
    </group>
  );
}

interface CloudSeed {
  base: THREE.Vector3;
  width: number;
  phase: number;
  texture: THREE.Texture;
}

/** Cumulus billboards flanking the flight path. Clouds drift slowly and PART
 * away from the plane as it approaches (the itomdev signature move), easing
 * back once it has passed. */
function PartingClouds({ curve, planePos, zOffset = 0 }: { curve: THREE.CatmullRomCurve3; planePos: React.MutableRefObject<THREE.Vector3>; zOffset?: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const clouds = useMemo<CloudSeed[]>(() => {
    const list: CloudSeed[] = [];
    for (let i = 0; i < 22; i++) {
      const t = (i + 0.5) / 22;
      const p = curve.getPoint(t);
      const side = i % 2 === 0 ? -1 : 1;
      const lateral = 4.5 + (i % 4) * 2.6;
      list.push({
        base: p.clone().add(new THREE.Vector3(side * lateral, -1.5 + (i % 5) * 1.6, -1 - (i % 3) * 2)),
        width: 3.6 + (i % 4) * 1.8,
        phase: i * 1.7,
        texture: cloudImageTexture(i + 1),
      });
    }
    return list;
  }, [curve]);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const plane = planePos.current;
    g.children.forEach((child, i) => {
      const c = clouds[i];
      if (!c) return;
      // proximity falloff on path-distance (z is the ride axis)
      const dz = Math.abs(c.base.z + zOffset - plane.z);
      const falloff = Math.max(0, 1 - dz / 14);
      const push = falloff * falloff * 4.2;
      // push straight away from the plane in the XY plane
      const dx = c.base.x - plane.x;
      const dy = c.base.y - plane.y;
      const len = Math.max(0.6, Math.hypot(dx, dy));
      const targetX = c.base.x + (dx / len) * push + Math.sin(t * 0.12 + c.phase) * 1.1;
      const targetY = c.base.y + (dy / len) * push * 0.6 + Math.sin(t * 0.2 + c.phase) * 0.3;
      child.position.x += (targetX - child.position.x) * 0.04;
      child.position.y += (targetY - child.position.y) * 0.04;
      child.quaternion.copy(state.camera.quaternion);
    });
  });

  return (
    <group ref={groupRef}>
      {clouds.map((c, i) => (
        <mesh key={i} position={c.base.toArray()} renderOrder={-1}>
          <planeGeometry args={[c.width, c.width * (340 / 512)]} />
          <meshBasicMaterial map={c.texture} transparent alphaTest={0.05} depthWrite={false} opacity={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** The poppable skills moment around the upper half of the ride. */
function SkillsMoment({
  curve,
  skills,
  onPop,
  titleT,
}: {
  curve: THREE.CatmullRomCurve3;
  skills: string[];
  onPop: () => void;
  titleT: number;
}) {
  const titlePos = useMemo(() => curve.getPoint(titleT).clone().add(new THREE.Vector3(0, 5.4, 0)), [curve, titleT]);
  const spots = useMemo(
    () =>
      skills.map((label, i) => {
        const t = 0.52 + (i / Math.max(1, skills.length - 1)) * 0.34;
        const p = curve.getPoint(t);
        const side = i % 2 === 0 ? -1 : 1;
        // varied 0.8-1.4 scale so the cluster doesn't read as one flat rank
        // of same-size balloons, and the bigger ones carry their labels
        const scale = 0.8 + seededRand(i, 'journey-balloon-scale') * 0.6;
        return {
          label,
          pos: [p.x + side * (2.6 + (i % 3) * 1.4), p.y + 1 + (i % 4) * 1.1, p.z - 1 - (i % 2) * 2] as [number, number, number],
          seed: i + 1,
          scale,
        };
      }),
    [curve, skills],
  );
  // a few clouds drifting through the balloon field (itomdev reference:
  // reference-shots/image-1783349276160.png mixes clouds among the balloons)
  const clouds = useMemo(() => {
    const mid = curve.getPoint(0.68);
    return [0, 1, 2].map((i) => {
      const side = i % 2 === 0 ? 1 : -1;
      return {
        seed: 50 + i,
        width: 3.4 + i * 0.5,
        pos: [mid.x + side * (5.4 + i * 1.2), mid.y + 2.6 - i * 1.3, mid.z - 2.4 - i] as [number, number, number],
      };
    });
  }, [curve]);
  return (
    <group>
      <OutlineTitle text="SKILLS" sub="tools I build with" height={1.7} position={titlePos.toArray()} />
      {clouds.map((c) => (
        <Cloud key={`skills-cloud-${c.seed}`} seed={c.seed} width={c.width} opacity={0.85} position={c.pos} />
      ))}
      {spots.map((s) => (
        <Balloon key={s.label} label={s.label} seed={s.seed} position={s.pos} scale={s.scale} onPop={onPop} />
      ))}
    </group>
  );
}

const DEBRIS_COUNT = 6;
const DEBRIS_DROP = 1.1;

/** A few pebbles that continuously crumble off an island's grass-plate rim
 * and fade out — cheap ambient motion so the islands don't read as static
 * cardboard cutouts. Positions are local to the island's own group (matches
 * RockIsland's `children` contract: children render inside its `<group>`,
 * so [0,0,0] here is the island's center).
 *
 * Deliberately kept near the plate's OUTER rim (|x| ~ 0.36-0.56 of width,
 * i.e. at/just past the grass plate's own half-width) and close to plate
 * level (y starts just above the plate at +0.15, falls <=1.1 unit): the
 * island's rock underbelly
 * (RockIsland's icosahedron chunks, frozen prop) is a solid, camera-facing
 * mass — pebbles spawned toward its core, or left to fall multiple units
 * into its shadow, render fully occluded from most flight angles (verified
 * empirically: a radius-1 sphere dropped straight under the island center
 * was two-thirds hidden by the rock chunks alone). Staying at the rim and
 * falling only a short distance keeps them outside that mass instead. */
function IslandDebris({ width, seed }: { width: number; seed: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const data = useMemo(
    () =>
      Array.from({ length: DEBRIS_COUNT }, (_, i) => {
        const side = seededRand(seed + i, 'journey-pebble-side') > 0.5 ? 1 : -1;
        return {
          x: side * width * (0.4 + seededRand(seed + i, 'journey-pebble-x') * 0.24),
          z: (seededRand(seed + i, 'journey-pebble-z') - 0.5) * width * 0.22,
          speed: 0.24 + seededRand(seed + i, 'journey-pebble-speed') * 0.22,
          phase: seededRand(seed + i, 'journey-pebble-phase') * DEBRIS_DROP,
          size: 0.08 + seededRand(seed + i, 'journey-pebble-size') * 0.05,
        };
      }),
    [seed, width],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    data.forEach((d, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      const fall = (t * d.speed + d.phase) % DEBRIS_DROP;
      mesh.position.set(d.x, 0.15 - fall, d.z);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.6 * (1 - fall / DEBRIS_DROP);
    });
  });
  return (
    // lapFadeExempt: this group runs its own opacity animation per pebble
    // (the sawtooth fall/reset above) — LapFade's traversal (below) must skip
    // it rather than caching/overwriting a transient mid-fall opacity as the
    // pebble's "base" forever.
    <group userData={{ lapFadeExempt: true }}>
      {data.map((d, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[d.x, 0.15, d.z]}
        >
          <sphereGeometry args={[d.size, 6, 6]} />
          <meshBasicMaterial color={BLUEPRINT.line} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Fraction of a material's base opacity below which its owning group is
 * treated as fully hidden and skipped from rendering — avoids sorting/
 * drawing near-invisible transparent geometry every frame. */
const LAP_FADE_HIDE_THRESHOLD = 0.015;

const lapFadeBaseOpacity = new WeakMap<THREE.Material, number>();

/** Recursively scales every material's opacity in `root` by `fade`, relative
 * to each material's own opacity the first time it's seen (cached in
 * `lapFadeBaseOpacity` so repeated frames multiply from the original value,
 * not the previous frame's already-scaled one). Forces `transparent = true`
 * so a fade below 1 actually reads as see-through. Skips any subtree rooted
 * at a node whose `userData.lapFadeExempt` is set (content that runs its own
 * opacity animation, e.g. IslandDebris) so it isn't permanently overwritten
 * mid-animation. Sets `root.visible = false` below `LAP_FADE_HIDE_THRESHOLD`
 * so hidden lap content (and everything nested in it) isn't drawn at all. */
function applyLapFade(root: THREE.Object3D, fade: number) {
  root.visible = fade > LAP_FADE_HIDE_THRESHOLD;
  if (!root.visible) return;
  const visit = (obj: THREE.Object3D) => {
    if (obj.userData?.lapFadeExempt) return;
    const mats = (obj as THREE.Mesh | THREE.Line).material;
    if (mats) {
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        const mat = m as THREE.Material & { opacity?: number };
        if (typeof mat.opacity !== 'number') continue;
        let base = lapFadeBaseOpacity.get(mat);
        if (base === undefined) {
          base = mat.opacity;
          lapFadeBaseOpacity.set(mat, base);
        }
        mat.transparent = true;
        mat.opacity = base * fade;
      }
    }
    obj.children.forEach(visit);
  };
  visit(root);
}

/** Wraps a lap's chapter title + stations + islands so they fade in/out by
 * how close the flight actually is to that lap (see `lapWindowFade`) instead
 * of sitting at constant opacity — see that function's doc comment for why
 * (fog alone doesn't hide adjacent-lap content soon enough). `k` is the lap
 * index this content belongs to; `progressRef` is the room's live (unbounded)
 * flight progress in lap units. */
function LapFade({
  k,
  progressRef,
  children,
}: {
  k: number;
  progressRef: React.RefObject<number>;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const rel = (progressRef.current ?? 0) - k;
    applyLapFade(ref.current, lapWindowFade(rel));
  });
  return <group ref={ref}>{children}</group>;
}

const TRAIL_STEPS = 6;
/** Cumulative backward distance (world units) of each trail vertex behind
 * the plane, growing toward the tail (a "comet" spacing, not evenly-spaced
 * dashes). Reach (~4.3 units) is roughly twice the plane's own length. */
const TRAIL_DIST = [0.5, 1.05, 1.7, 2.45, 3.3, 4.3];

function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** A short, fading dashed line trailing straight back from the plane along
 * its current heading — the itomdev plane is faint white-on-white; this
 * reads as a motion cue without needing a brighter/thicker plane. Rebuilt
 * from the plane's live position + heading every frame (not sampled
 * history), so it's correct immediately and independent of scroll speed —
 * a history buffer would need real elapsed motion to fill in and, worse,
 * reads as nearly a single point from a chase camera flying almost the same
 * line the plane just flew. Colour is baked per-vertex, blended from ink
 * (near the plane) toward the paper background (the tail), since
 * LineDashedMaterial has no per-vertex alpha. */
function PlaneTrail({
  planeRef,
  tangentRef,
}: {
  planeRef: React.RefObject<THREE.Group>;
  tangentRef: React.RefObject<THREE.Vector3>;
}) {
  const nearRgb = useMemo(() => hexToRgb01(BLUEPRINT.line), []);
  const farRgb = useMemo(() => hexToRgb01(BLUEPRINT.ground), []);
  const pointCount = TRAIL_STEPS + 1;

  const line = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pointCount * 3), 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pointCount * 3), 3));
    const material = new THREE.LineDashedMaterial({
      color: 0xffffff,
      vertexColors: true,
      dashSize: 0.3,
      gapSize: 0.22,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const l = new THREE.Line(geom, material);
    // positions start at the origin and are rewritten every frame; without
    // this, Three caches a degenerate zero-radius bounding sphere from that
    // first (0,0,0) frame and never recomputes it, so the trail gets
    // frustum-culled for the rest of the flight
    l.frustumCulled = false;
    return l;
  }, [pointCount]);

  useFrame(() => {
    const plane = planeRef.current;
    const tangent = tangentRef.current;
    if (!plane || !tangent) return;
    const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = line.geometry.getAttribute('color') as THREE.BufferAttribute;
    posAttr.setXYZ(0, plane.position.x, plane.position.y, plane.position.z);
    colorAttr.setXYZ(0, nearRgb[0], nearRgb[1], nearRgb[2]);
    for (let i = 0; i < TRAIL_STEPS; i++) {
      const d = TRAIL_DIST[i];
      posAttr.setXYZ(i + 1, plane.position.x - tangent.x * d, plane.position.y - tangent.y * d, plane.position.z - tangent.z * d);
      const age = (i + 1) / TRAIL_STEPS;
      colorAttr.setXYZ(
        i + 1,
        THREE.MathUtils.lerp(nearRgb[0], farRgb[0], age),
        THREE.MathUtils.lerp(nearRgb[1], farRgb[1], age),
        THREE.MathUtils.lerp(nearRgb[2], farRgb[2], age),
      );
    }
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    line.computeLineDistances();
  });

  return <primitive object={line} />;
}

export function Journey({ active, onReady }: JourneyProps): JSX.Element {
  const data = useWorldData();
  const audio = useAudio();
  const achievements = useAchievements();
  const { camera, size } = useThree();

  // TREADMILL ride, not a circuit: the x/y weave is a closed periodic curve
  // but z runs forward forever — one "lap" of content spans LAP_DEPTH in z
  // and the whole content group repeats ahead (and behind, for rewind),
  // exactly like the corridor's segments. No return leg, no visible line
  // looping back to the start: near the end, the next lap's beginning
  // simply appears ahead.
  const { curve, flight } = useMemo(() => {
    const xy = new THREE.CatmullRomCurve3(
      PATH_POINTS.map((p) => new THREE.Vector3(p[0], p[1], 0)),
      true,
      'catmullrom',
      0.3,
    );
    const getPointU = (p: number, out = new THREE.Vector3()) => {
      const local = ((p % 1) + 1) % 1;
      xy.getPoint(local, out);
      out.z = PATH_POINTS[0][2] - p * LAP_DEPTH;
      return out;
    };
    // lap-0 view for content layout (t in [0,1])
    const getPoint = (t: number, out = new THREE.Vector3()) => {
      const local = ((t % 1) + 1) % 1;
      return getPointU(local, out);
    };
    const ta = new THREE.Vector3();
    const tb = new THREE.Vector3();
    const getTangentU = (p: number, out = new THREE.Vector3()) => {
      getPointU(p - 0.002, ta);
      getPointU(p + 0.002, tb);
      return out.subVectors(tb, ta).normalize();
    };
    // world length of one lap (for camera offsets in world units)
    let length = 0;
    const s0 = new THREE.Vector3();
    const s1 = new THREE.Vector3();
    getPointU(0, s0);
    for (let i = 1; i <= 200; i++) {
      getPointU(i / 200, s1);
      length += s1.distanceTo(s0);
      s0.copy(s1);
    }
    const fake = { getPoint, getTangent: (t: number, out?: THREE.Vector3) => getTangentU(t, out) } as unknown as THREE.CatmullRomCurve3;
    return { curve: fake, flight: { getPointU, getTangentU, length } };
  }, []);

  const lateral = size.width / size.height < 0.7 ? 3 : 5.8;
  const stations = useMemo(() => buildStations(data.journey.beats, curve, lateral), [data.journey.beats, curve, lateral]);
  // camera chase offsets in WORLD UNITS (the closed loop is much longer than
  // the old open path — a fractional offset put the camera ~25 units behind
  // the plane, shrinking it to a drawn line)
  const curveLen = flight.length;
  const skills = data.journey.skills?.length ? data.journey.skills : FALLBACK_SKILLS;

  const islands = useMemo(
    () =>
      stations
        .filter((s) => ERA_ISLANDS[s.beat.id])
        .map((s, i) => ({
          name: ERA_ISLANDS[s.beat.id],
          years: s.beat.date.toUpperCase(),
          // pulled closer and less far below the path than before (was
          // side*8.5 / y-4.6 / z-3) so each era is clearly seen as the plane
          // passes, not a speck far under the flight line
          pos: [s.pathPoint.x - s.side * 6.2, s.pathPoint.y - 2.8, s.pathPoint.z - 1.2] as [number, number, number],
          width: 7.2 + i * 1.1,
        })),
    [stations],
  );

  // Chapter-title placement derived from the actual last station's t (not a
  // hardcoded constant), so a title never lands within a station's own
  // footprint regardless of beats.length (see journeyLayout's
  // chapterTitleT/CHAPTER_TITLE_GAP).
  const lastStationT = stations.length ? stations[stations.length - 1].t : 0.1;
  const skillsTitleT = chapterTitleT(lastStationT);
  const awardsTitleT = chapterTitleT(skillsTitleT);
  // "JOURNEY" chapter title tracks the curve near the very start of the lap
  // (was a flat world position fixed at z=-2, which landed almost exactly
  // between the "community" (t~0.15) and "intern" (t~0.2) stations
  // regardless of camera angle — a same-lap collision, not just a cross-lap
  // one).
  const journeyTitlePos = useMemo(() => curve.getPoint(0.035).clone().add(new THREE.Vector3(0, 6.2, 0)), [curve]);

  const progress = useRef(0);
  const target = useRef(0);
  const planeRef = useRef<THREE.Group>(null);
  const planePos = useRef(new THREE.Vector3(0, 2, 6));
  const planeTangent = useRef(new THREE.Vector3(0, 0, -1));
  const bankRef = useRef(0);
  const flyUnlocked = useRef(false);
  const [lap, setLap] = useState(0);

  // Input while active
  useEffect(() => {
    if (!active) return;
    const onWheel = (e: WheelEvent) => {
      target.current += e.deltaY * SCROLL_PER_WHEEL;
    };
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      target.current += (touchY - y) * SCROLL_PER_WHEEL * 3;
      touchY = y;
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [active]);

  // Progress reset per visit. (Music is world-wide now — WorldMode starts
  // the generative lo-fi bed on entry; the room no longer owns it.)
  useEffect(() => {
    if (!active) return;
    progress.current = 0;
    target.current = 0;
  }, [active]);

  useEffect(() => {
    onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anchor = useMemo(() => new THREE.Vector3(0, 0, ROOM_ANCHORS.journey), []);
  const scratch = useMemo(
    () => ({
      plane: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      cam: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      prevTangent: new THREE.Vector3(0, 0, -1),
    }),
    [],
  );

  useFrame((state, delta) => {
    if (!active) return;
    const damp = Math.min(1, delta / DAMPING * 0.06);
    progress.current = THREE.MathUtils.lerp(progress.current, target.current, damp);
    (window as unknown as { __jp?: { p: number; t: number } }).__jp = { p: progress.current, t: target.current };
    const t = ((progress.current % 1) + 1) % 1; // endless loop: the ride wraps

    if (!flyUnlocked.current && t > FLY_ACHIEVEMENT_PROGRESS) {
      flyUnlocked.current = true;
      achievements.unlock('fly_journey');
    }

    const p = progress.current; // unbounded — the ride never turns around
    flight.getPointU(p, scratch.plane).add(anchor);
    flight.getTangentU(p, scratch.tangent);
    planeTangent.current.copy(scratch.tangent); // exported for PlaneTrail below

    // banking from turn rate of the tangent
    const turn = scratch.prevTangent.x * scratch.tangent.z - scratch.prevTangent.z * scratch.tangent.x;
    bankRef.current = THREE.MathUtils.lerp(bankRef.current, THREE.MathUtils.clamp(-turn * 40, -0.6, 0.6), 0.08);
    scratch.prevTangent.copy(scratch.tangent);

    const clock = state.clock.elapsedTime;
    const bob = Math.sin(clock * 1.4) * 0.1;
    const sway = Math.sin(clock * 0.7) * 0.55;
    scratch.plane.x += sway;
    if (planeRef.current) {
      planeRef.current.position.set(scratch.plane.x, scratch.plane.y + bob, scratch.plane.z);
      planeRef.current.lookAt(
        scratch.plane.x + scratch.tangent.x,
        scratch.plane.y + scratch.tangent.y + bob,
        scratch.plane.z + scratch.tangent.z,
      );
      // banking + a light continuous wing waggle
      planeRef.current.rotation.z += bankRef.current + Math.sin(clock * 1.9) * 0.1;
    }
    // room-local plane position for the parting clouds
    planePos.current.set(scratch.plane.x - anchor.x, scratch.plane.y - anchor.y, scratch.plane.z - anchor.z);

    // camera chases from behind/above (offsets in world units)
    flight.getPointU(p - 8.5 / curveLen, scratch.cam).add(anchor);
    scratch.cam.y += 1.15;
    camera.position.lerp(scratch.cam, 0.12);
    flight.getPointU(p + 3.2 / curveLen, scratch.ahead).add(anchor);
    camera.lookAt(scratch.ahead.x, scratch.ahead.y + 0.6, scratch.ahead.z);

    // which lap of content the plane is on — drives the repeating groups
    const curLap = Math.floor(p);
    setLap((prev) => (prev === curLap ? prev : curLap));
  });

  const floor = useMemo(() => {
    const t = gridTexture();
    t.repeat.set(50, 50);
    return t;
  }, []);
  useEffect(() => () => floor.dispose(), [floor]);

  return (
    <group position={[0, 0, ROOM_ANCHORS.journey]}>
      {/* ground grid follows the current lap so it never runs out */}
      <mesh position={[0, -0.6, -45 - lap * LAP_DEPTH]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[220, 220]} />
        <meshBasicMaterial map={floor} />
      </mesh>
      {/* the plane + camera fly forward forever; the trail is world-space */}
      <group ref={planeRef}>
        <PaperPlane scale={1.25} tone={PLANE_TONE} />
      </group>
      <PlaneTrail planeRef={planeRef} tangentRef={planeTangent} />
      {/* one lap of content, repeated behind/current/ahead — the treadmill:
          nearing the end of a lap, the next lap's beginning appears ahead */}
      {[lap - 1, lap, lap + 1].map((k) => (
        <group key={k} position={[0, 0, -k * LAP_DEPTH]}>
          <PartingClouds curve={curve} planePos={planePos} zOffset={-k * LAP_DEPTH} />
          {/* title + stations + islands fade by how close the flight actually
              is to this lap (LapFade/lapWindowFade) — otherwise the next
              lap's opening content sits at full opacity well before the
              current lap's own closing content (skills/awards) is out of
              view, since LAP_DEPTH is close to the room's fog far-plane. */}
          <LapFade k={k} progressRef={progress}>
            <OutlineTitle text="JOURNEY" sub="my path so far…" height={1.9} position={journeyTitlePos.toArray()} />
            {stations.map((s, i) => (
              <StationSheet key={s.beat.id} station={s} index={i} total={stations.length} />
            ))}
            {islands.map((isl, i) => (
              <RockIsland key={isl.name} title={isl.name} years={isl.years} width={isl.width} position={isl.pos}>
                <IslandDebris width={isl.width} seed={i * 13 + 3} />
              </RockIsland>
            ))}
          </LapFade>
          <SkillsMoment curve={curve} skills={skills} onPop={() => audio.play('pop')} titleT={skillsTitleT} />
          <AwardsRun curve={curve} titleT={awardsTitleT} />
        </group>
      ))}
    </group>
  );
}
