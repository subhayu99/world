// Registry room: the itomdev studio pattern applied to open source — a
// vertical floating column of cardboard parcels (one per package) that you
// scroll/drag through. Hovering a parcel colours its kraft cardboard; clicking
// spotlights it (everything else fades down) and opens the torn-paper detail
// card with the live PyPI download count. Binary doodles drift in the space
// between parcels.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as ReactDOM from 'react-dom/client';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { gsap } from 'gsap';
import { loadPyPIStats, type PyPIStatsData } from '@/lib/pypiStats';
import { ROOM_ANCHORS } from '../contracts';
import type { Parcel } from '../types';
import { useAchievements, useAudio, useWorldData } from '../state/hooks';
import { formatDownloads, pickStats } from './registryMath';
import { ParcelCard } from './ParcelCard';
import { BLUEPRINT } from '../blueprint/palette';
import { Edges, PaperPlane } from '../blueprint/primitives';
import { Cloud, OutlineTitle } from '../blueprint/props';
import { binaryTexture, parcelTexture } from '../blueprint/sketch';
import { plateTexture } from '../blueprint/sheets';

interface RegistryProps {
  active: boolean;
  onReady: () => void;
}

/** DOM modal in its own ReactDOM root, outside the R3F tree (r3f cannot
 * reconcile DOM children; react-dom createPortal in the tree crashes). */
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

// ---- column layout ----

const COLUMN = {
  z: -11.5, // relative to room anchor
  spacing: 1.65, // tighter than a full box height so plates and the next box overlap slightly — reads as one dense column, not a scatter
  topY: 3.1,
  xs: [-0.85, 0.95, -0.65, 1.1, -1.15, 0.7, -0.9, 1.0], // capped to +/-1.2, 3-4 fit a frame at a time
  zs: [-0.4, 0.5, 0.15, -0.6, 0.35, -0.25, 0.6, -0.45],
  yaws: [0.5, -0.6, 0.3, -0.4, 0.6, -0.25, 0.45, -0.55],
} as const;

/** Small colour-pencil sticker dot per parcel — cycles the three pastel accents. */
const STICKER_COLORS = [BLUEPRINT.accent, BLUEPRINT.accentWarm, BLUEPRINT.accentCool] as const;

function setCursor(on: boolean) {
  document.body.style.cursor = on ? 'pointer' : 'auto';
}

interface ParcelBoxProps {
  parcel: Parcel;
  index: number;
  total: number;
  scrollRef: React.MutableRefObject<{ target: number; current: number }>;
  downloads: string;
  dimmed: boolean;
  selected: boolean;
  onSelect: () => void;
}

/** One floating parcel: kraft box, taped top, marker label, download count
 * plate underneath. Hover colours it; the parent drives dim/spotlight. */
function ParcelBox({ parcel, index, total, scrollRef, downloads, dimmed, selected, onSelect }: ParcelBoxProps) {
  const [hover, setHover] = useState(false);
  const group = useRef<THREE.Group>(null);
  const size = useMemo(() => {
    const j = Math.sin(index * 37.7) * 0.5 + 0.5;
    return [1.35 + j * 0.35, 1.1 + (1 - j) * 0.3, 1.1 + j * 0.25] as [number, number, number];
  }, [index]);

  const colored = hover || selected;
  const front = useMemo(() => parcelTexture(parcel.name, { colored, face: 'front' }), [parcel.name, colored]);
  const top = useMemo(() => parcelTexture(parcel.name, { colored, face: 'top' }), [parcel.name, colored]);
  const side = useMemo(() => parcelTexture(parcel.name, { colored, face: 'side' }), [parcel.name, colored]);
  const geom = useMemo(() => new THREE.BoxGeometry(...size), [size]);

  // the count itself stays coral even unhovered (muted alpha; goes solid on hover/select),
  // "downloads" stays a plain grey label — mirrors the coral-count/grey-label split in ParcelCard's DOM modal
  const countPlate = useMemo(
    () => plateTexture(downloads, { size: 52, color: colored ? '#c96f5f' : 'rgba(201,111,95,0.82)' }),
    [downloads, colored],
  );
  const labelPlate = useMemo(() => plateTexture('downloads', { size: 30, color: 'rgba(90,90,88,0.8)' }), []);
  const plateH = 0.42;
  const countW = countPlate.aspect * plateH;
  const labelH = plateH * (30 / 52);
  const labelW = labelPlate.aspect * labelH;
  const plateGap = 0.08;
  const plateRowW = countW + plateGap + labelW;

  const stickerColor = STICKER_COLORS[index % STICKER_COLORS.length];

  // idle float + slow yaw sway — and the ENDLESS column: each box's y wraps
  // modulo the full column height as you scroll, so the stack cycles forever
  // in both directions (the itomdev studio loop).
  const baseY = COLUMN.topY - index * COLUMN.spacing;
  const columnH = total * COLUMN.spacing;
  const windowTop = COLUMN.topY + COLUMN.spacing;
  const yawSpeed = 0.26 + (index % 3) * 0.07;
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const yRaw = baseY + scrollRef.current.current;
    const wrapped = windowTop - ((((windowTop - yRaw) % columnH) + columnH) % columnH);
    group.current.position.y = wrapped + Math.sin(t * 0.55 + index * 1.7) * 0.12;
    group.current.rotation.y = COLUMN.yaws[index % COLUMN.yaws.length] + Math.sin(t * yawSpeed + index) * 0.16;
  });

  const opacity = dimmed ? 0.14 : 1;

  return (
    <group
      ref={group}
      position={[COLUMN.xs[index % COLUMN.xs.length], baseY, COLUMN.z + COLUMN.zs[index % COLUMN.zs.length]]}
      rotation={[0, COLUMN.yaws[index % COLUMN.yaws.length], 0]}
    >
      <mesh
        geometry={geom}
        onClick={(e) => {
          e.stopPropagation();
          if (!dimmed) onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (dimmed) return;
          setHover(true);
          setCursor(true);
        }}
        onPointerOut={() => {
          setHover(false);
          setCursor(false);
        }}
      >
        <meshBasicMaterial attach="material-0" map={side} transparent opacity={opacity} />
        <meshBasicMaterial attach="material-1" map={side} transparent opacity={opacity} />
        <meshBasicMaterial attach="material-2" map={top} transparent opacity={opacity} />
        <meshBasicMaterial attach="material-3" color={colored ? '#d3b184' : '#e6e4dc'} transparent opacity={opacity} />
        <meshBasicMaterial attach="material-4" map={front} transparent opacity={opacity} />
        <meshBasicMaterial attach="material-5" map={front} transparent opacity={opacity} />
      </mesh>
      <Edges geometry={geom} color={colored ? '#8a6238' : BLUEPRINT.line} opacity={dimmed ? 0.1 : 0.9} />
      {/* colour-pencil sticker/stamp near the top corner of the front face */}
      <mesh position={[size[0] / 2 - 0.22, size[1] / 2 - 0.22, size[2] / 2 + 0.02]}>
        <circleGeometry args={[0.15, 20]} />
        <meshBasicMaterial color={BLUEPRINT.line} transparent opacity={dimmed ? 0.05 : 0.55} depthWrite={false} />
      </mesh>
      <mesh position={[size[0] / 2 - 0.22, size[1] / 2 - 0.22, size[2] / 2 + 0.03]}>
        <circleGeometry args={[0.105, 20]} />
        <meshBasicMaterial color={stickerColor} transparent opacity={dimmed ? 0.06 : 1} depthWrite={false} />
      </mesh>
      {/* download count floats under the parcel, bumped up so the coral count reads at a glance */}
      <group position={[0, -size[1] / 2 - 0.36, 0]}>
        <mesh position={[-plateRowW / 2 + countW / 2, 0, 0]}>
          <planeGeometry args={[countW, plateH]} />
          <meshBasicMaterial map={countPlate.texture} transparent opacity={dimmed ? 0.08 : 1} depthWrite={false} />
        </mesh>
        <mesh position={[-plateRowW / 2 + countW + plateGap + labelW / 2, -0.02, 0]}>
          <planeGeometry args={[labelW, labelH]} />
          <meshBasicMaterial map={labelPlate.texture} transparent opacity={dimmed ? 0.06 : 0.9} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

// blueprint/sketch.ts's binaryTextureImpl (frozen, not editable here) draws a
// 6-9 char '0'/'1' string from a fixed seeded LCG with no guarantee of digit
// variety. Several low integer seeds happen to produce runs of 4-8
// consecutive '0's, and the handwritten font draws '0' as a bare oval — a run
// that long reads as a row of plain circles instead of "binary code" (e.g.
// seed 8 -> "000000001"). These replacements were checked against that same
// deterministic formula and each yields a mixed 0/1 string with no zero-run
// longer than 2, so every doodle still reads as code at a glance.
const BINARY_DOODLE_SEEDS = [104, 2, 3, 122, 130, 137, 148, 150, 9, 10, 171, 12, 13, 14] as const;
function binaryDoodleSeed(i: number): number {
  return BINARY_DOODLE_SEEDS[i] ?? i + 1;
}

/** Drifting binary doodles around the column. */
function BinaryDrift({ count = 12 }: { count?: number }) {
  const { camera } = useThree();
  const refs = useRef<(THREE.Group | null)[]>([]);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        seed: binaryDoodleSeed(i),
        x: Math.sin(i * 51.3) * 5.5,
        y: 3 - i * 1.7 - Math.sin(i * 7) * 1.2,
        z: COLUMN.z - 3.5 + Math.cos(i * 31.7) * 2.5, // biased behind the parcels' own z range so doodles don't slice through the coral download plates
        tex: binaryTexture(binaryDoodleSeed(i)),
      })),
    [count],
  );
  useFrame(({ clock }) => {
    refs.current.forEach((g, i) => {
      if (!g) return;
      const t = clock.elapsedTime * 0.22 + i * 2.1;
      g.position.x = seeds[i].x + Math.sin(t) * 0.6;
      g.position.y = seeds[i].y + Math.cos(t * 0.8) * 0.5;
      g.quaternion.copy(camera.quaternion);
    });
  });
  return (
    <>
      {seeds.map((s, i) => (
        <group key={s.seed} ref={(el) => (refs.current[i] = el)} position={[s.x, s.y, s.z]}>
          <mesh>
            <planeGeometry args={[1.6, 0.58]} />
            <meshBasicMaterial map={s.tex} transparent opacity={0.4} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ---- extra space dressing: sparkles, drifting paper planes, far clouds ----
// (blueprint/sketch.ts is frozen — small local canvas-texture helper here,
// following the exhibitBoardTexture pattern in Warehouse.tsx.)

const sparkleCache = new Map<string, THREE.CanvasTexture>();

/** Small hand-drawn asterisk/star doodle, graphite ink on transparent. */
function sparkleTexture(seed: number): THREE.CanvasTexture {
  const key = `sparkle-${seed}`;
  const hit = sparkleCache.get(key);
  if (hit) return hit;

  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');

  const r = (n: number) => Math.sin(seed * 12.9898 + n * 78.233) * 0.5 + 0.5;
  const points = r(1) > 0.5 ? 6 : 4;
  const len = s * 0.32 + r(2) * s * 0.1;
  const rot = r(3) * Math.PI;

  ctx.translate(s / 2, s / 2);
  ctx.rotate(rot);
  ctx.strokeStyle = 'rgba(88,88,86,0.55)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < points; i++) {
    const a = (Math.PI * 2 * i) / points;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(88,88,86,0.6)';
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // sparse strokes vanish under mip minification at distance — keep them crisp
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  sparkleCache.set(key, texture);
  return texture;
}

/** Drifting star/asterisk sparkles scattered through the void, denser and
 * closer to camera than the binary doodles so the column reads as "dressed". */
function SparkleDrift({ count = 10 }: { count?: number }) {
  const { camera } = useThree();
  const refs = useRef<(THREE.Group | null)[]>([]);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        seed: i + 1,
        x: Math.cos(i * 41.9) * 4.4,
        y: 4 - i * 1.35 - Math.cos(i * 5.3) * 1.4,
        z: COLUMN.z + 1.5 + Math.sin(i * 27.1) * 2.6,
        scale: 0.5 + (i % 3) * 0.22,
        tex: sparkleTexture(i + 1),
      })),
    [count],
  );
  useFrame(({ clock }) => {
    refs.current.forEach((g, i) => {
      if (!g) return;
      const t = clock.elapsedTime * 0.18 + i * 3.4;
      g.position.x = seeds[i].x + Math.sin(t) * 0.4;
      g.position.y = seeds[i].y + Math.cos(t * 0.7) * 0.35;
      g.quaternion.copy(camera.quaternion);
    });
  });
  return (
    <>
      {seeds.map((s, i) => (
        <group key={s.seed} ref={(el) => (refs.current[i] = el)} position={[s.x, s.y, s.z]} scale={s.scale}>
          <mesh>
            <planeGeometry args={[0.5, 0.5]} />
            <meshBasicMaterial map={s.tex} transparent opacity={0.55} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** A couple of small paper planes drifting slowly past the column. */
function DriftingPlanes() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const specs = useMemo(
    () => [
      { seed: 1, x0: -3.4, y0: 2.4, z: COLUMN.z + 3, scale: 0.4 },
      { seed: 2, x0: 2.6, y0: -4.5, z: COLUMN.z + 1.2, scale: 0.32 },
    ],
    [],
  );
  useFrame(({ clock }) => {
    refs.current.forEach((g, i) => {
      if (!g) return;
      const spec = specs[i];
      const t = clock.elapsedTime * 0.15 + spec.seed * 4;
      g.position.x = spec.x0 + Math.sin(t) * 1.6;
      g.position.y = spec.y0 + Math.sin(t * 0.6) * 0.8;
      g.rotation.y = Math.PI * 0.15 * spec.seed + Math.sin(t * 0.4) * 0.2;
      g.rotation.z = Math.sin(t * 0.5) * 0.08;
    });
  });
  return (
    <>
      {specs.map((s, i) => (
        <group key={s.seed} ref={(el) => (refs.current[i] = el)} position={[s.x0, s.y0, s.z]} scale={s.scale}>
          <PaperPlane />
        </group>
      ))}
    </>
  );
}

/** Soft distant clouds far behind the column, for the "airy space" the
 * reference column floats in. */
function BackgroundClouds() {
  // The room camera sits at anchor - 3 (WorldMode.tsx's registry framing) and
  // the column sits at anchor + COLUMN.z, so camera-to-column distance is
  // ~8.5 while these clouds, at COLUMN.z - (9..13), sit ~18-22 away — roughly
  // 2-2.5x farther. A cloud's screen footprint scales with (world offset -
  // half its own width) / distance-from-camera, so simply pushing a wide
  // (8-12 unit) cloud's x out a couple of units past the column's own
  // ~+-2 unit screen footprint still lands its near edge behind a box: the
  // cloud's own half-width ate the offset. Shrunk each cloud's width and
  // pushed its x far enough that (x - width/2), scaled by that ~0.4-0.46x
  // distance ratio, clears the column's footprint with margin.
  const specs = useMemo(
    () => [
      { seed: 2, x: -11, y: 5.5, z: COLUMN.z - 10, width: 7 },
      { seed: 5, x: 11.5, y: -1, z: COLUMN.z - 13, width: 8 },
      { seed: 8, x: -10.5, y: -6.5, z: COLUMN.z - 9, width: 6 },
    ],
    [],
  );
  return (
    <>
      {specs.map((s) => (
        <Cloud key={s.seed} seed={s.seed} wisp width={s.width} opacity={0.4} position={[s.x, s.y, s.z]} />
      ))}
    </>
  );
}

export function Registry({ active, onReady }: RegistryProps): JSX.Element {
  const data = useWorldData();
  const audio = useAudio();
  const achievements = useAchievements();
  const parcels = data.registry.parcels;

  const [stats, setStats] = useState<PyPIStatsData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const readyFiredRef = useRef(false);

  const columnRef = useRef<THREE.Group>(null);
  const scroll = useRef({ target: 0, current: 0 });

  // live PyPI counts
  useEffect(() => {
    let cancelled = false;
    loadPyPIStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // scroll / drag cycles the endless column — unclamped in both directions;
  // each parcel wraps its own y modulo the column height (see ParcelBox).
  useEffect(() => {
    if (!active) return;
    const onWheel = (e: WheelEvent) => {
      if (selectedId) return;
      scroll.current.target += e.deltaY * 0.008;
    };
    let dragY: number | null = null;
    const onDown = (e: PointerEvent) => {
      dragY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (dragY === null || selectedId) return;
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
  }, [active, selectedId]);

  useFrame(() => {
    const s = scroll.current;
    s.current += (s.target - s.current) * 0.08;
  });

  useEffect(() => {
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    const raf = requestAnimationFrame(onReady);
    return () => cancelAnimationFrame(raf);
  }, [onReady]);

  useEffect(() => {
    if (!active) setSelectedId(null);
  }, [active]);

  const selected = parcels.find((p) => p.id === selectedId) ?? null;
  const downloadsFor = (p: Parcel) => formatDownloads(pickStats(stats, p.pypiPackage), p.fallbackDownloads ?? '—');

  const select = (p: Parcel) => {
    audio.play('pop');
    achievements.unlock('open_parcel');
    setSelectedId(p.id);
  };

  useDomOverlay(
    selected ? <ParcelCard parcel={selected} downloads={downloadsFor(selected)} onClose={() => setSelectedId(null)} /> : null,
  );

  // paper veil that dims the world during spotlight
  const veilOpacity = useRef({ v: 0 });
  const veilMat = useRef<THREE.MeshBasicMaterial>(null);
  useEffect(() => {
    gsap.to(veilOpacity.current, {
      v: selected ? 0.5 : 0,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => {
        if (veilMat.current) veilMat.current.opacity = veilOpacity.current.v;
      },
    });
  }, [selected]);

  return (
    <group position={[0, 0, ROOM_ANCHORS.registry]}>
      {/* far, fixed backdrop — doesn't scroll with the column, reads as distant sky */}
      <BackgroundClouds />

      <mesh position={[0, 2, COLUMN.z - 5.5]}>
        <planeGeometry args={[60, 40]} />
        <meshBasicMaterial ref={veilMat} color="#efede5" transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={columnRef}>
        {/* room title crowns the column: forward and up, like SKILLS in Journey.
            Raised well above the column's own wrap ceiling: the endless-wrap column
            caps every box's y at windowTop (COLUMN.topY + COLUMN.spacing = 4.75) plus
            up to +-0.12 idle bob and +-0.7 half box height, so a box can reach y ~ 5.57
            at ANY scroll position, not just at rest — some box is always cycling through
            that top slot. The title used to sit low enough (y=6.0) that the subtitle
            band (y - height*0.58) fell inside that envelope and got painted over. */}
        <OutlineTitle text="THE REGISTRY" sub="open source, on PyPI" height={1.6} position={[0, 7.2, COLUMN.z - 1]} />
        {parcels.map((p, i) => (
          <ParcelBox
            key={p.id}
            parcel={p}
            index={i}
            total={parcels.length}
            scrollRef={scroll}
            downloads={downloadsFor(p)}
            dimmed={selectedId !== null && selectedId !== p.id}
            selected={selectedId === p.id}
            onSelect={() => select(p)}
          />
        ))}
        <BinaryDrift count={Math.min(14, parcels.length * 2)} />
        <SparkleDrift count={10} />
        <DriftingPlanes />
      </group>
    </group>
  );
}

export default Registry;
