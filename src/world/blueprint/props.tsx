// Sketch-world 3D props, v2 — clouds, balloons, signposts, barrels, boats,
// lighthouses, rock islands, outlined display titles. Composed from the
// texture generators in sketch.ts; rooms lay these out, props own their own
// micro-interactions (hover colouring, pop-and-return, bobbing).

import { useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { BLUEPRINT } from './palette';
import { Edges } from './primitives';
import {
  balloonTexture,
  barrelTexture,
  cumulusTexture,
  lighthouseTexture,
  outlineTitleTexture,
  rockTexture,
  signTexture,
  wispTexture,
} from './sketch';

interface Vec3Props {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
}

function setCursor(on: boolean) {
  document.body.style.cursor = on ? 'pointer' : 'auto';
}

// ---- Cloud ----

/** Billboard cumulus. width in world units; height follows texture aspect. */
export function Cloud({ seed = 1, width = 6, wisp = false, opacity = 1, billboard = true, ...t }: Vec3Props & {
  seed?: number;
  width?: number;
  wisp?: boolean;
  opacity?: number;
  billboard?: boolean;
}) {
  const texture = useMemo(() => (wisp ? wispTexture(seed) : cumulusTexture(seed)), [seed, wisp]);
  const aspect = wisp ? 512 / 200 : 512 / 340;
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (billboard && ref.current) ref.current.quaternion.copy(camera.quaternion);
  });
  return (
    <group ref={ref} {...t}>
      <mesh>
        <planeGeometry args={[width, width / aspect]} />
        <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---- Balloon (poppable, returns) ----

const POP_FRAGMENTS = 8;

export function Balloon({ label, seed = 1, floatAmp = 0.25, floatSpeed = 0.6, onPop, ...t }: Vec3Props & {
  label: string;
  seed?: number;
  floatAmp?: number;
  floatSpeed?: number;
  onPop?: () => void;
}) {
  const texture = useMemo(() => balloonTexture(label, seed), [label, seed]);
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const frags = useRef<THREE.Group>(null);
  const state = useRef<{ popped: boolean; t: number; respawn: number }>({ popped: false, t: 0, respawn: 0 });
  const { camera } = useThree();

  const fragData = useMemo(() => {
    const r = (n: number) => Math.sin(seed * 91.7 + n * 47.3) * 0.5 + 0.5;
    return Array.from({ length: POP_FRAGMENTS }, (_, i) => ({
      dir: new THREE.Vector3(Math.cos((i / POP_FRAGMENTS) * Math.PI * 2), Math.sin((i / POP_FRAGMENTS) * Math.PI * 2), (r(i) - 0.5) * 0.8).normalize(),
      speed: 2.2 + r(i + 9) * 2.2,
      size: 0.1 + r(i + 4) * 0.12,
    }));
  }, [seed]);

  // string curve (drawn once, points down from the knot)
  const stringGeom = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      pts.push(new THREE.Vector3(Math.sin(u * Math.PI * 2.2 + seed) * 0.08 * u, -0.62 - u * 0.9, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [seed]);

  useFrame((s, dt) => {
    const st = state.current;
    st.t += dt;
    if (group.current) {
      group.current.position.y = (t.position?.[1] ?? 0) + Math.sin(st.t * floatSpeed + seed * 3.1) * floatAmp;
      group.current.quaternion.copy(camera.quaternion); // billboard
    }
    if (st.popped) {
      st.respawn -= dt;
      if (frags.current) {
        frags.current.children.forEach((c, i) => {
          const f = fragData[i];
          c.position.addScaledVector(f.dir, f.speed * dt);
          c.position.y -= st.t * dt * 0.6; // gravity-ish
          const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
          m.opacity = Math.max(0, m.opacity - dt * 1.6);
        });
      }
      if (st.respawn <= 0 && body.current) {
        st.popped = false;
        body.current.visible = true;
        body.current.scale.setScalar(0.01);
      }
    } else if (body.current && body.current.scale.x < 1) {
      // elastic-ish return
      const ns = Math.min(1, body.current.scale.x + dt * 2.2);
      body.current.scale.setScalar(ns);
    }
  });

  const pop = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    const st = state.current;
    if (st.popped) return;
    st.popped = true;
    st.respawn = 2.6;
    if (body.current) body.current.visible = false;
    if (frags.current) {
      frags.current.children.forEach((c, i) => {
        c.position.set(0, 0, 0.01);
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = 0.95;
        void fragData[i];
      });
    }
    setCursor(false);
    onPop?.();
  };

  return (
    <group ref={group} position={t.position} rotation={t.rotation} scale={t.scale}>
      <group ref={body}>
        <mesh
          onClick={pop}
          onPointerOver={(e) => {
            e.stopPropagation();
            setCursor(true);
          }}
          onPointerOut={() => setCursor(false)}
        >
          <planeGeometry args={[1.3, 1.62]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} />
        </mesh>
        <line>
          {/* eslint-disable-next-line react/no-unknown-property */}
          <primitive object={stringGeom} attach="geometry" />
          <lineBasicMaterial color={BLUEPRINT.line} transparent opacity={0.7} />
        </line>
      </group>
      <group ref={frags}>
        {fragData.map((f, i) => (
          <mesh key={i} position={[0, 0, 0.01]}>
            <planeGeometry args={[f.size, f.size * 0.7]} />
            <meshBasicMaterial color="#dcdad2" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---- Signpost ----

/** Wooden sign on a post. Hover colours the wood (itomdev move). */
export function Signpost({ label, onSelect, boardW = 2.6, boardH = 0.85, postH = 1.5, ...t }: Vec3Props & {
  label: string;
  onSelect?: () => void;
  boardW?: number;
  boardH?: number;
  postH?: number;
}) {
  const [hover, setHover] = useState(false);
  const grey = useMemo(() => signTexture(label, { colored: false }), [label]);
  const brown = useMemo(() => signTexture(label, { colored: true }), [label]);
  const boardGeom = useMemo(() => new THREE.BoxGeometry(boardW, boardH, 0.12), [boardW, boardH]);
  const postGeom = useMemo(() => new THREE.CylinderGeometry(0.07, 0.09, postH, 8), [postH]);

  return (
    <group {...t}>
      <mesh geometry={postGeom} position={[0, postH / 2, 0]}>
        <meshBasicMaterial color={hover ? INKWOOD.hoverPost : INKWOOD.post} />
      </mesh>
      <Edges geometry={postGeom} color={BLUEPRINT.line} opacity={0.5} threshold={30} />
      <group position={[0, postH + boardH / 2 - 0.06, 0]}>
        <mesh
          geometry={boardGeom}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHover(true);
            setCursor(true);
          }}
          onPointerOut={() => {
            setHover(false);
            setCursor(false);
          }}
        >
          <meshBasicMaterial attach="material-0" color={hover ? '#b98d5a' : '#e0ded6'} />
          <meshBasicMaterial attach="material-1" color={hover ? '#b98d5a' : '#e0ded6'} />
          <meshBasicMaterial attach="material-2" color={hover ? '#b98d5a' : '#e0ded6'} />
          <meshBasicMaterial attach="material-3" color={hover ? '#b98d5a' : '#e0ded6'} />
          <meshBasicMaterial attach="material-4" map={hover ? brown : grey} />
          <meshBasicMaterial attach="material-5" map={hover ? brown : grey} />
        </mesh>
        <Edges geometry={boardGeom} color={BLUEPRINT.line} opacity={0.85} />
      </group>
    </group>
  );
}

const INKWOOD = { post: '#dddbd3', hoverPost: '#b98d5a' } as const;

// ---- Barrel ----

export function Barrel({ colored = false, r = 0.55, h = 0.9, ...t }: Vec3Props & { colored?: boolean; r?: number; h?: number }) {
  const tex = useMemo(() => barrelTexture(colored), [colored]);
  const geom = useMemo(() => new THREE.CylinderGeometry(r * 0.94, r * 0.94, h, 14), [r, h]);
  const midGeom = useMemo(() => new THREE.CylinderGeometry(r, r, h * 0.55, 14), [r, h]);
  return (
    <group {...t}>
      <mesh geometry={geom}>
        <meshBasicMaterial map={tex} />
      </mesh>
      <mesh geometry={midGeom}>
        <meshBasicMaterial map={tex} />
      </mesh>
      <mesh position={[0, h / 2 + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 0.94, 14]} />
        <meshBasicMaterial color="#e2e0d8" />
      </mesh>
      <Edges geometry={geom} color={BLUEPRINT.line} opacity={0.5} threshold={40} />
    </group>
  );
}

// ---- Paper boat ----

function trisToGeometry(tris: [number, number, number][][]): THREE.BufferGeometry {
  const positions: number[] = [];
  tris.forEach((tri) => tri.forEach((v) => positions.push(...v)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

// classic origami boat: hull (two sloped side quads meeting at bow/stern
// points) + the centre sail. Sail kept separate so it renders brighter
// than the hull — pure white-on-white reads as wireframe from a distance.
const BOAT = {
  bow: [0, 0.26, -0.9] as [number, number, number],
  stern: [0, 0.26, 0.9] as [number, number, number],
  keelF: [0, -0.16, -0.38] as [number, number, number],
  keelB: [0, -0.16, 0.38] as [number, number, number],
  gunL: [-0.46, 0.26, 0] as [number, number, number],
  gunR: [0.46, 0.26, 0] as [number, number, number],
  sailT: [0, 0.92, 0] as [number, number, number],
};

export function paperBoatGeometry(): THREE.BufferGeometry {
  const { bow, stern, keelF, keelB, gunL, gunR } = BOAT;
  return trisToGeometry([
    [bow, gunL, keelF],
    [gunL, keelB, keelF],
    [gunL, stern, keelB],
    [bow, keelF, gunR],
    [gunR, keelF, keelB],
    [gunR, keelB, stern],
  ]);
}

function paperBoatSailGeometry(): THREE.BufferGeometry {
  const { bow, stern, sailT } = BOAT;
  return trisToGeometry([[bow, sailT, stern]]);
}

export function PaperBoat(t: Vec3Props) {
  const hull = useMemo(paperBoatGeometry, []);
  const sail = useMemo(paperBoatSailGeometry, []);
  return (
    <group {...t}>
      <mesh geometry={hull}>
        <meshBasicMaterial color="#e8e6de" side={THREE.DoubleSide} />
      </mesh>
      <Edges geometry={hull} color={BLUEPRINT.line} threshold={5} />
      <mesh geometry={sail}>
        <meshBasicMaterial color="#fbfaf6" side={THREE.DoubleSide} />
      </mesh>
      <Edges geometry={sail} color={BLUEPRINT.line} threshold={5} />
    </group>
  );
}

// ---- Lighthouse ----

export function Lighthouse(t: Vec3Props) {
  const bodyTex = useMemo(() => lighthouseTexture(), []);
  const rockTex = useMemo(() => rockTexture(5), []);
  const body = useMemo(() => new THREE.CylinderGeometry(0.42, 0.72, 4.6, 12), []);
  const gallery = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 0.5, 10), []);
  const roof = useMemo(() => new THREE.ConeGeometry(0.56, 0.66, 10), []);
  const rocks = useMemo(
    () =>
      [0, 1, 2].map((i) => ({
        geom: new THREE.IcosahedronGeometry(0.75 + (i % 2) * 0.35, 1),
        pos: [Math.cos(i * 2.2) * 0.7, -0.5 - (i % 2) * 0.2, Math.sin(i * 2.2) * 0.6] as [number, number, number],
        scaleY: 0.55 + (i % 3) * 0.1,
      })),
    [],
  );
  return (
    <group {...t}>
      {rocks.map((r, i) => (
        <group key={i} position={r.pos} scale={[1, r.scaleY, 1]}>
          <mesh geometry={r.geom}>
            <meshBasicMaterial map={rockTex} />
          </mesh>
          <Edges geometry={r.geom} color={BLUEPRINT.line} opacity={0.35} threshold={35} />
        </group>
      ))}
      <mesh geometry={body} position={[0, 2.0, 0]}>
        <meshBasicMaterial map={bodyTex} />
      </mesh>
      <Edges geometry={body} color={BLUEPRINT.line} opacity={0.6} threshold={40} />
      <mesh geometry={gallery} position={[0, 4.55, 0]}>
        <meshBasicMaterial color="#b8b6ae" />
      </mesh>
      <Edges geometry={gallery} color={BLUEPRINT.line} opacity={0.7} threshold={30} />
      <mesh position={[0, 4.55, 0]}>
        <boxGeometry args={[0.42, 0.3, 0.42]} />
        <meshBasicMaterial color="#d9b45f" />
      </mesh>
      <mesh geometry={roof} position={[0, 5.1, 0]}>
        <meshBasicMaterial color="#9c9a92" />
      </mesh>
      <Edges geometry={roof} color={BLUEPRINT.line} opacity={0.7} threshold={20} />
    </group>
  );
}

// ---- Outline display title ----

/** Big outlined bubble-letter title (flat, like the reference), with an
 * optional plain-handwriting sub-line on its own plane. */
export function OutlineTitle({ text, sub, height = 1.6, fill, ...t }: Vec3Props & {
  text: string;
  sub?: string;
  height?: number;
  fill?: string;
}) {
  const title = useMemo(() => outlineTitleTexture(text, fill ? { fill } : undefined), [text, fill]);
  const subPlate = useMemo(() => (sub ? outlineTitleTexture(sub, { subStyle: true }) : null), [sub]);
  const w = height * title.aspect;
  return (
    <group {...t}>
      <mesh>
        <planeGeometry args={[w, height]} />
        <meshBasicMaterial map={title.texture} transparent depthWrite={false} />
      </mesh>
      {subPlate && (
        <mesh position={[0, -height * 0.58, 0]}>
          <planeGeometry args={[height * 0.34 * subPlate.aspect, height * 0.34]} />
          <meshBasicMaterial map={subPlate.texture} transparent depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

// ---- Rock island ----

/** Floating rock island with a grass lip, hanging roots and a name. */
export function RockIsland({ title, years, width = 6, children, ...t }: Vec3Props & {
  title: string;
  years?: string;
  width?: number;
  children?: ReactNode;
}) {
  const rockTex = useMemo(() => rockTexture(title.length), [title]);
  const topGeom = useMemo(() => new THREE.CylinderGeometry(width / 2, width / 2.6, 0.5, 9), [width]);
  const chunkGeoms = useMemo(
    () => [0, 1, 2].map((i) => new THREE.IcosahedronGeometry(width / (3.2 + i * 0.7), 0)),
    [width],
  );
  const roots = useMemo(() => {
    const geoms: THREE.BufferGeometry[] = [];
    const r = rng2(title.length * 7 + 3);
    for (let i = 0; i < 7; i++) {
      const x = (r() - 0.5) * width * 0.7;
      const z = (r() - 0.5) * width * 0.5;
      const len = 0.8 + r() * 1.6;
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 8; s++) {
        const u = s / 8;
        pts.push(new THREE.Vector3(x + Math.sin(u * 5 + i) * 0.12, -0.2 - u * len, z + Math.cos(u * 4 + i) * 0.1));
      }
      geoms.push(new THREE.BufferGeometry().setFromPoints(pts));
    }
    return geoms;
  }, [title, width]);

  return (
    <group {...t}>
      {/* rock underbelly chunks */}
      {chunkGeoms.map((g, i) => (
        <group key={i} position={[(i - 1) * width * 0.18, -0.6 - i * 0.35, (i % 2) * 0.3 - 0.15]} scale={[1, 0.75, 0.85]}>
          <mesh geometry={g}>
            <meshBasicMaterial map={rockTex} />
          </mesh>
          <Edges geometry={g} color={BLUEPRINT.line} opacity={0.25} threshold={20} />
        </group>
      ))}
      {/* grass/earth top plate */}
      <mesh geometry={topGeom}>
        <meshBasicMaterial color="#eceae0" />
      </mesh>
      <Edges geometry={topGeom} color={BLUEPRINT.line} opacity={0.7} threshold={30} />
      {/* hanging roots */}
      {roots.map((g, i) => (
        <line key={i}>
          {/* eslint-disable-next-line react/no-unknown-property */}
          <primitive object={g} attach="geometry" />
          <lineBasicMaterial color={BLUEPRINT.line} transparent opacity={0.55} />
        </line>
      ))}
      {/* era name — grey fill so it holds against the white sky */}
      <OutlineTitle text={title} fill="#d6d3ca" height={Math.min(1.5, width * 0.22)} position={[0, 1.15, 0]} />
      {years && <YearsBoard years={years} width={width} />}
      {children}
    </group>
  );
}

function YearsBoard({ years, width }: { years: string; width: number }) {
  const tex = useMemo(() => signTexture(years, { colored: false, w: 384, h: 128 }), [years]);
  const geom = useMemo(() => new THREE.BoxGeometry(width * 0.42, width * 0.14, 0.08), [width]);
  return (
    <group position={[0, 0.28, width / 2.6 + 0.1]} rotation={[0.12, 0, 0]}>
      <mesh geometry={geom}>
        <meshBasicMaterial attach="material-0" color="#e0ded6" />
        <meshBasicMaterial attach="material-1" color="#e0ded6" />
        <meshBasicMaterial attach="material-2" color="#e0ded6" />
        <meshBasicMaterial attach="material-3" color="#e0ded6" />
        <meshBasicMaterial attach="material-4" map={tex} />
        <meshBasicMaterial attach="material-5" map={tex} />
      </mesh>
      <Edges geometry={geom} color={BLUEPRINT.line} opacity={0.8} />
    </group>
  );
}

function rng2(seed: number): () => number {
  let a = seed * 9301 + 49297;
  return () => ((a = (a * 233280 + 49297) % 233280) / 233280);
}
