// Contact room: the pier. First-person on a wooden pier over a hand-drawn
// swirly sea; the ways to reach Subhayu are wooden signposts planted on
// floating barrels (GitHub, LinkedIn, Email, Resume from data.contact.links,
// plus MESSAGE which opens the paper form). Hovering a sign colours its wood
// (the itomdev move — colour only ever appears as a deliberate accent), a
// paper boat bobs between the barrels, a lighthouse sits on rocks off to
// the left, and cumulus billboards drift in the sky. Every floating thing
// bobs on its own phase so the water reads alive without any water shader.
//
// ContactForm stays a real DOM modal via useDomOverlay (separate ReactDOM
// root — r3f cannot reconcile DOM children, and react-dom createPortal
// inside the R3F tree crashes).

import { useEffect, useMemo, useRef, useState } from 'react';
import * as ReactDOM from 'react-dom/client';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ContactLink } from '../types';
import { ROOM_ANCHORS } from '../contracts';
import { WorldDataCtx, useAchievements, useAudio, useWorldData } from '../state/hooks';
import { BLUEPRINT } from '../blueprint/palette';
import { Edges } from '../blueprint/primitives';
import { Barrel, Cloud, Lighthouse, PaperBoat, Signpost } from '../blueprint/props';
import { pierTexture, seaTexture, woodTexture } from '../blueprint/sketch';
import { ContactForm } from './ContactForm';

interface ContactProps {
  active: boolean;
  onReady: () => void;
}

/** Mounts `node` into a standalone ReactDOM root appended to document.body,
 * unmounting and cleaning up automatically when `node` becomes null. */
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

/** Gentle sine bob + sway for anything floating on the sea. */
function Bobbing({ phase, amp = 0.06, sway = 0.02, speed = 0.9, position, children }: {
  phase: number;
  amp?: number;
  sway?: number;
  speed?: number;
  position: [number, number, number];
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed + phase;
    ref.current.position.y = position[1] + Math.sin(t) * amp;
    ref.current.rotation.z = Math.sin(t * 0.8 + 1.3) * sway;
    ref.current.rotation.x = Math.cos(t * 0.7) * sway * 0.7;
  });
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  );
}

/** The paper boat bobs in place with a lazy heading sway and tiny drift,
 * angled so the camera always sees hull side + sail profile. */
function DriftingBoat({ center }: { center: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.x = center[0] + Math.sin(t * 0.14) * 0.9;
    ref.current.position.z = center[2] + Math.cos(t * 0.11) * 0.6;
    ref.current.position.y = center[1] + Math.sin(t * 1.1) * 0.05;
    ref.current.rotation.y = Math.PI * 0.32 + Math.sin(t * 0.2) * 0.35;
    ref.current.rotation.z = Math.sin(t * 0.9) * 0.07;
    ref.current.rotation.x = Math.cos(t * 0.75) * 0.04;
  });
  return (
    <group ref={ref} position={center}>
      <PaperBoat scale={1.8} />
    </group>
  );
}

/** Sea plane with slowly drifting swirl texture. */
function Sea() {
  const tex = useMemo(() => {
    const t = seaTexture();
    t.repeat.set(16, 16);
    // Mipmapped minification averages the sparse strokes into blank paper by
    // mid-distance; keep them crisp and let the fog soften the far field.
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }, []);
  useFrame((_, dt) => {
    tex.offset.y += dt * 0.004;
    tex.offset.x += dt * 0.0015;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -40]}>
      <planeGeometry args={[260, 260]} />
      <meshBasicMaterial map={tex} />
    </mesh>
  );
}

/** Second sea plane just for the near field (under/around the pier). The far
 * Sea()'s 16x16 repeat over a 260-unit plane puts ~16 world-units per tile —
 * fine at distance, but hugely magnified at the bottom corners where the
 * camera is close to the water, which is what reads as blurry smudged
 * strokes there. A smaller plane with a much denser repeat (own cached
 * texture instance — seaTexture(seed) keys the session cache by seed, so
 * mutating this one's repeat/offset never touches the far plane's shared
 * instance) keeps the same stroke vocabulary but at a texel density that
 * matches how close the camera actually gets. */
function NearSea() {
  const tex = useMemo(() => {
    const t = seaTexture(37);
    t.repeat.set(24, 9);
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }, []);
  useFrame((_, dt) => {
    tex.offset.y += dt * 0.007;
    tex.offset.x += dt * 0.0022;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 5]}>
      <planeGeometry args={[62, 24]} />
      <meshBasicMaterial map={tex} />
    </mesh>
  );
}

/** Faint ripple rings around anything that floats. */
function Ripple({ position, r = 0.95 }: { position: [number, number, number]; r?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 0.9 + position[0]) * 0.05;
    ref.current.scale.setScalar(pulse);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <ringGeometry args={[r, r + 0.1, 28]} />
      <meshBasicMaterial color="#77756f" transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
}

const PIER = {
  deckY: 0.55,
  // Widened + extended toward the camera (was 3.4 x 11 at z -1.5, deck ran
  // +4..-7): the old narrow ribbon left huge wedges of open sea at the
  // bottom-left/bottom-right corners — exactly where texture magnification
  // reads as blurry smudges. A wider, longer deck fills that frame area with
  // structure instead of asking the sea texture to hold up under a close camera.
  deckW: 6.2,
  deckLen: 15,
  deckZ: 0.5, // deck runs z = +8 .. -7
} as const;

/** Original deck footprint the pier texture/plank scale was tuned against —
 * repeat is scaled relative to this so plank width stays constant while the
 * deck itself grows (see deckTex below). */
const PIER_BASE = { w: 3.4, len: 11 } as const;

/** Slight random yaw per sign so the arc doesn't read machine-aligned.
 * Indices 1 (LINKEDIN) and 4 (MESSAGE) were both leaning toward each
 * other's shared edge (-0.1 / +0.1), which combined with how close their
 * slots sit (see SIGN_SLOTS) made their board faces converge on screen.
 * Flipped so both edges facing each other lean away instead. */
const SIGN_YAW = [0.16, 0.08, 0.04, -0.14, -0.08];

/** Per-sign board size variety (was a flat 2.4x0.8, MESSAGE 2.7 wide) so the
 * arc doesn't read like five copies of one prefab. Index matches the
 * rendered `signs` array order: [link0, link1, link2, link3, MESSAGE]. */
const SIGN_BOARD_W = [2.3, 2.55, 2.4, 2.6, 2.75];
const SIGN_BOARD_H = [0.78, 0.84, 0.76, 0.82, 0.86];
const SIGN_POST_H = [1.5, 1.28, 1.62, 1.34, 1.52];

/** Indices (into the rendered `signs` array) that get a small second plank
 * stacked under the main board — itomdev's signs double up like a real
 * trail post. */
const SECOND_PLANK_AT = new Set([0, 4]);

/** Sign arc: [x, z, phase] — loose arc past the pier end, like the reference.
 * Slot 0 (GITHUB, the leftmost link) was pulled further left and a touch
 * nearer the camera than the original -5.4/-10.5 — at the old position its
 * screen-space angle from camera nearly matched the (much more distant)
 * lighthouse, so the two silhouettes overlapped.
 * Slot 1 (LINKEDIN) and slot 2 (MESSAGE) sat close enough in x/z (-2.7/-12.6
 * vs 0/-11.2) that their board footprints interpenetrated on screen — MESSAGE
 * is both nearer the camera and wider (boardW 2.75 vs 2.55), so it visually
 * swallowed LINKEDIN's near edge. Pulled LINKEDIN further left and pushed
 * MESSAGE further back (not right, which would instead crowd EMAIL at slot 3)
 * to open a real gap between the two. */
const SIGN_SLOTS: [number, number, number][] = [
  [-7.6, -9.2, 0.3],
  [-3.5, -12.6, 2.1],
  [0, -12.2, 4.4],
  [2.9, -13.0, 1.2],
  [5.5, -11.6, 3.6],
];

/** Lighthouse anchor — nudged up from y=1.2 so its rock base clears the sea
 * plane instead of reading as a flat sand patch half-buried at the waterline. */
const LIGHTHOUSE_POS: [number, number, number] = [-13, 1.55, -35];
const LIGHTHOUSE_SCALE = 2.2;

/** CLOUDS[0] used to sit at [-15, 8.5, -34] with width 7 — only ~2 world
 * units in x/z from LIGHTHOUSE_POS ([-13, 1.55, -35]) and at a y that falls
 * within the tower's silhouette height, so its right lobe cut across the
 * tower body at the topmost window. Moved further left/back and narrowed
 * so its footprint clears the tower's x-range at every height it passes. */
const CLOUDS: { pos: [number, number, number]; seed: number; width: number }[] = [
  { pos: [-21, 9, -42], seed: 3, width: 6 },
  { pos: [-6, 11.5, -46], seed: 8, width: 9 },
  { pos: [7, 7.2, -38], seed: 12, width: 6.5 },
  { pos: [16, 10, -30], seed: 5, width: 7.5 },
  { pos: [11, 13, -54], seed: 21, width: 10 },
  { pos: [-21, 6, -26], seed: 17, width: 5 },
  { pos: [2, 5.6, -21], seed: 26, width: 3.6 },
  { pos: [22, 7, -44], seed: 31, width: 8 },
];

/** A gently sagging rope between two points — a real catenary droop (control
 * point pulled down at the midpoint), not hand-drawn wobble. A thin solid
 * tube (real geometry) rather than a THREE.Line — JSX's `<line>` intrinsic
 * collides with the SVG line element in this project's type setup and
 * (matching the never-visible RockIsland root strokes elsewhere) does not
 * reliably paint a stroke here, so this sticks to the mesh-based vocabulary
 * every other prop in this room already uses. */
function ropeGeometry(a: THREE.Vector3, b: THREE.Vector3, sag: number): THREE.BufferGeometry {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  return new THREE.TubeGeometry(curve, 12, 0.022, 5, false);
}

/** Upright rail posts along both edges of the deck with a sagging rope
 * strung between consecutive posts on each side — the deck previously had
 * only under-deck support pilings, so its edges met open sea with nothing
 * marking the boundary. `zs` are local-to-deck-group z positions. */
function PierRailing({ zs, halfWidth, topY }: { zs: number[]; halfWidth: number; topY: number }) {
  const postH = 0.52;
  const postGeom = useMemo(() => new THREE.CylinderGeometry(0.045, 0.055, postH, 8), []);
  const postCenterY = topY + postH / 2;
  const ropeY = topY + postH - 0.04; // tied near the post top, not its centre
  const ropeGeoms = useMemo(
    () =>
      [-1, 1].map((sx) =>
        zs.slice(1).map((z, i) => {
          const a = new THREE.Vector3(sx * halfWidth, ropeY, zs[i]);
          const b = new THREE.Vector3(sx * halfWidth, ropeY, z);
          return ropeGeometry(a, b, 0.1);
        }),
      ),
    [zs, halfWidth, ropeY],
  );
  return (
    <>
      {[-1, 1].map((sx) =>
        zs.map((z) => (
          <group key={`post/${sx}/${z}`} position={[sx * halfWidth, postCenterY, z]}>
            <mesh geometry={postGeom}>
              <meshBasicMaterial color="#d8d6ce" />
            </mesh>
            <Edges geometry={postGeom} color={BLUEPRINT.line} opacity={0.55} threshold={30} />
          </group>
        )),
      )}
      {ropeGeoms.map((side, si) =>
        side.map((g, i) => (
          <mesh key={`rope/${si}/${i}`} geometry={g}>
            <meshBasicMaterial color={BLUEPRINT.line} transparent opacity={0.75} />
          </mesh>
        )),
      )}
    </>
  );
}

/** Small second board stacked under a sign's main plank — real trail posts
 * often carry two. Carries the same wood-grain texture as the main board
 * (grain running along the wide axis, no knots — this plank is too small
 * for one to read cleanly) instead of a flat, untextured fill so it doesn't
 * look like placeholder geometry next to the fully-rendered sign above it. */
function SecondPlank({ width, y, yaw }: { width: number; y: number; yaw: number }) {
  const geom = useMemo(() => new THREE.BoxGeometry(width, 0.24, 0.1), [width]);
  const wood = useMemo(() => woodTexture({ w: 256, h: 56, knots: 0, seed: 19 }), []);
  return (
    <group position={[0, y, 0]} rotation={[0, yaw, 0]}>
      <mesh geometry={geom}>
        <meshBasicMaterial attach="material-0" color="#e0ded6" />
        <meshBasicMaterial attach="material-1" color="#e0ded6" />
        <meshBasicMaterial attach="material-2" color="#e0ded6" />
        <meshBasicMaterial attach="material-3" color="#e0ded6" />
        <meshBasicMaterial attach="material-4" map={wood} />
        <meshBasicMaterial attach="material-5" map={wood} />
      </mesh>
      <Edges geometry={geom} color={BLUEPRINT.line} opacity={0.75} />
    </group>
  );
}

/** Simple flat 'v' stroke bird silhouette, drawn once into a small cached
 * canvas texture (local to this room, not the shared sketch.ts cache — a
 * plain module-level singleton is enough since it never varies). */
let birdTex: THREE.CanvasTexture | null = null;
function birdTexture(): THREE.CanvasTexture {
  if (birdTex) return birdTex;
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 40;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = 'rgba(120,120,116,0.65)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(6, 24);
    ctx.quadraticCurveTo(26, 6, 48, 19);
    ctx.quadraticCurveTo(70, 6, 90, 24);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  birdTex = t;
  return t;
}

/** Subtle grey bird billboard, drifting slowly in a lazy loop. */
function Bird({ seed, basePos, ampX = 12, ampZ = 3.5, speed = 0.045 }: {
  seed: number;
  basePos: [number, number, number];
  ampX?: number;
  ampZ?: number;
  speed?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const tex = useMemo(birdTexture, []);
  const { camera } = useThree();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed + seed;
    ref.current.position.set(
      basePos[0] + Math.sin(t) * ampX,
      basePos[1] + Math.sin(t * 1.7 + seed) * 0.35,
      basePos[2] + Math.cos(t * 0.6) * ampZ,
    );
    ref.current.quaternion.copy(camera.quaternion);
  });
  return (
    <group ref={ref} position={basePos}>
      <mesh>
        <planeGeometry args={[0.9, 0.38]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

const BIRDS: { seed: number; pos: [number, number, number] }[] = [
  { seed: 4, pos: [9, 9.2, -30] },
  { seed: 11, pos: [-4, 7.6, -22] },
];

/** Door + two windows on the lighthouse's camera-facing side, added as real
 * geometry (small boxes + Edges) rather than editing the shared
 * lighthouseTexture — the body is a tapered cylinder (r 0.72 base -> 0.42
 * top over height 4.6), so each plane's z-offset interpolates the radius at
 * its height to sit flush against the tapered surface. Coordinates are in
 * the Lighthouse prop's own local space; this group is given the identical
 * position+scale as the <Lighthouse> call so the numbers line up. */
function LighthouseDetail() {
  const bodyBottomY = -0.3;
  const bodyTopY = 4.3;
  const rBottom = 0.72;
  const rTop = 0.42;
  const radiusAt = (y: number) => {
    const t = (y - bodyBottomY) / (bodyTopY - bodyBottomY);
    return rBottom + (rTop - rBottom) * t;
  };
  const doorY = 0.28;
  const winYs = [1.55, 2.55];
  const doorGeom = useMemo(() => new THREE.BoxGeometry(0.46, 0.72, 0.04), []);
  const winGeom = useMemo(() => new THREE.BoxGeometry(0.26, 0.32, 0.04), []);
  return (
    <group position={LIGHTHOUSE_POS} scale={LIGHTHOUSE_SCALE}>
      <group position={[0, doorY, radiusAt(doorY) + 0.02]}>
        <mesh geometry={doorGeom}>
          <meshBasicMaterial color="#cfcdc3" />
        </mesh>
        <Edges geometry={doorGeom} color={BLUEPRINT.line} opacity={0.8} />
      </group>
      {winYs.map((y) => (
        <group key={y} position={[0, y, radiusAt(y) + 0.02]}>
          <mesh geometry={winGeom}>
            <meshBasicMaterial color="#cfcdc3" />
          </mesh>
          <Edges geometry={winGeom} color={BLUEPRINT.line} opacity={0.8} />
        </group>
      ))}
    </group>
  );
}

export function Contact({ active, onReady }: ContactProps): JSX.Element {
  const data = useWorldData();
  const audio = useAudio();
  const achievements = useAchievements();

  const audioRef = useRef(audio);
  useEffect(() => {
    audioRef.current = audio;
  }, [audio]);
  const achievementsRef = useRef(achievements);
  useEffect(() => {
    achievementsRef.current = achievements;
  }, [achievements]);

  const [formOpen, setFormOpen] = useState(false);
  const readyFiredRef = useRef(false);

  const links = data.contact.links;

  const deckTex = useMemo(() => {
    const t = pierTexture();
    // Scale repeat by how much wider/longer the deck grew relative to the
    // footprint this ratio was originally tuned against (repeat 1x2.4 at
    // 3.4x11), so plank width on screen stays constant instead of stretching.
    t.repeat.set(PIER.deckW / PIER_BASE.w, 2.4 * (PIER.deckLen / PIER_BASE.len));
    return t;
  }, []);

  const openLink = (link: ContactLink): void => {
    if (link.url.startsWith('mailto:')) {
      window.location.href = link.url;
    } else {
      window.open(link.url, '_blank', 'noopener');
    }
    audioRef.current.play('pop');
    achievementsRef.current.unlock('reach_out');
  };

  const openForm = (): void => {
    audioRef.current.play('pageFlip');
    achievementsRef.current.unlock('reach_out');
    setFormOpen(true);
  };

  const closeForm = (): void => setFormOpen(false);

  // Signs: MESSAGE takes the centre slot; the data links fill the others.
  const signs = useMemo(() => {
    const items: { label: string; slot: [number, number, number]; action: () => void }[] = [];
    const sideSlots = [0, 1, 3, 4];
    links.slice(0, 4).forEach((link, i) => {
      items.push({ label: link.label.toUpperCase(), slot: SIGN_SLOTS[sideSlots[i]], action: () => openLink(link) });
    });
    items.push({ label: 'MESSAGE', slot: SIGN_SLOTS[2], action: openForm });
    return items;
    // openLink/openForm are stable through refs; links from world.json
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  useEffect(() => {
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    const raf = requestAnimationFrame(onReady);
    return () => cancelAnimationFrame(raf);
  }, [onReady]);

  useEffect(() => {
    if (!active) setFormOpen(false);
  }, [active]);

  useDomOverlay(
    formOpen ? (
      <WorldDataCtx.Provider value={data}>
        <ContactForm onClose={closeForm} />
      </WorldDataCtx.Provider>
    ) : null,
  );

  const deckGeom = useMemo(() => new THREE.BoxGeometry(PIER.deckW, 0.22, PIER.deckLen), []);
  const postGeom = useMemo(() => new THREE.CylinderGeometry(0.11, 0.13, 1.6, 8), []);

  return (
    <group position={[0, 0, ROOM_ANCHORS.contact]}>
      <Sea />
      <NearSea />

      {/* Pier deck + posts */}
      <group position={[0, PIER.deckY, PIER.deckZ]}>
        <mesh geometry={deckGeom}>
          <meshBasicMaterial attach="material-0" color="#e3e1d9" />
          <meshBasicMaterial attach="material-1" color="#e3e1d9" />
          <meshBasicMaterial attach="material-2" map={deckTex} />
          <meshBasicMaterial attach="material-3" color="#dddbd3" />
          <meshBasicMaterial attach="material-4" color="#e3e1d9" />
          <meshBasicMaterial attach="material-5" color="#e3e1d9" />
        </mesh>
        <Edges geometry={deckGeom} color={BLUEPRINT.line} opacity={0.7} />
        {[-1, 1].map((sx) =>
          [-6.6, -3.2, 0.2, 3.6].map((pz) => (
            <group key={`${sx}/${pz}`} position={[sx * (PIER.deckW / 2 - 0.14), -0.85, pz]} rotation={[0, 0, sx * 0.03]}>
              <mesh geometry={postGeom}>
                <meshBasicMaterial color="#d8d6ce" />
              </mesh>
              <Edges geometry={postGeom} color={BLUEPRINT.line} opacity={0.5} threshold={30} />
            </group>
          )),
        )}
        <PierRailing zs={[-6.5, -3.0, 0.5, 4.0, 7.0]} halfWidth={PIER.deckW / 2 - 0.2} topY={0.11} />
      </group>

      {/* Signposts on floating barrels */}
      {signs.map((s, i) => (
        <group key={s.label}>
          <Bobbing phase={s.slot[2]} position={[s.slot[0], 0.32, s.slot[1]]} amp={0.07} sway={0.03}>
            <Barrel r={0.62} h={1.0} position={[0, 0.08, 0]} />
            <Signpost
              label={s.label}
              onSelect={s.action}
              boardW={SIGN_BOARD_W[i]}
              boardH={SIGN_BOARD_H[i]}
              postH={SIGN_POST_H[i]}
              position={[0, 0.5, 0]}
              rotation={[0, SIGN_YAW[i], 0]}
            />
            {SECOND_PLANK_AT.has(i) && (
              <SecondPlank width={SIGN_BOARD_W[i] * 0.55} y={0.5 + SIGN_POST_H[i] * 0.62} yaw={SIGN_YAW[i]} />
            )}
          </Bobbing>
          <Ripple position={[s.slot[0], 0.02 + i * 0.001, s.slot[1]]} />
        </group>
      ))}

      {/* Paper boat drifting between the barrels */}
      <DriftingBoat center={[14, 0.16, -23]} />

      {/* Lighthouse on rocks, off to the left */}
      <Lighthouse position={LIGHTHOUSE_POS} scale={LIGHTHOUSE_SCALE} />
      <LighthouseDetail />
      <Ripple position={[LIGHTHOUSE_POS[0], 0.02, LIGHTHOUSE_POS[2]]} r={3.4} />

      {/* Sky */}
      {CLOUDS.map((c) => (
        <Cloud key={c.seed} seed={c.seed} width={c.width} position={c.pos} />
      ))}
      <Cloud seed={41} wisp width={8} position={[-28, 13, -62]} opacity={0.65} />
      {BIRDS.map((b) => (
        <Bird key={b.seed} seed={b.seed} basePos={b.pos} />
      ))}
    </group>
  );
}

export default Contact;
