// The entrance facade — the first screen after loading (stage 'cover'), the
// itomdev opening beat rebuilt with our content: a tall sketched brick wall,
// a double wooden door (hover colours the wood, click swings it open and
// walks you in), a hanging PORTFOLIO sign, a window where the figure pops up
// waving on hover, a tree with a computer mouse hanging from a branch, a
// stone path, a planter with a rubber duck, a crawling bug you can squash
// (BUG FIXED!), and the cat — relocated here from the corridor — whose
// pupils follow the cursor.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import gsap from 'gsap';
import { useAudio, useWorldData } from '../state/hooks';
import { BLUEPRINT } from '../blueprint/palette';
import { Edges } from '../blueprint/primitives';
import { CAT_EYES, catTexture, doorTexture, signTexture } from '../blueprint/sketch';
import {
  bricksTexture,
  doorwayHallTexture,
  bugFixedTexture,
  bugTexture,
  doorStickersTexture,
  grassTexture,
  hangingMouseTexture,
  planterTexture,
  stonePathTexture,
  treeTexture,
  windowFigureTexture,
  windowFrameTexture,
} from './textures';

export interface EntranceProps {
  onEnter: () => void;
}

const WALL_Z = 20;
const WALL_W = 26;
const WALL_H = 10;

const STICKERS_LEFT = ['Python', 'SQL', 'dbt'];
const STICKERS_RIGHT = ['Airflow', 'Docker', 'GCP'];

function setCursor(on: boolean) {
  document.body.style.cursor = on ? 'pointer' : 'auto';
}

/** One door panel: grey pencil wood + brown layer fading in on hover. */
function DoorPanel({ side, hoverMat, stickers }: {
  side: -1 | 1;
  hoverMat: THREE.MeshBasicMaterial;
  stickers: string[];
}) {
  const grey = useMemo(() => doorTexture(false), []);
  const stickerTex = useMemo(() => doorStickersTexture(stickers, side === -1 ? 5 : 11), [stickers, side]);
  const geom = useMemo(() => new THREE.BoxGeometry(1.25, 2.9, 0.08), []);
  return (
    <group position={[side * 1.25 / 2, 1.45, 0]}>
      <mesh geometry={geom}>
        <meshBasicMaterial attach="material-0" color="#d8d5cc" />
        <meshBasicMaterial attach="material-1" color="#d8d5cc" />
        <meshBasicMaterial attach="material-2" color="#d8d5cc" />
        <meshBasicMaterial attach="material-3" color="#d8d5cc" />
        <meshBasicMaterial attach="material-4" map={grey} />
        <meshBasicMaterial attach="material-5" map={grey} />
      </mesh>
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[1.25, 2.9]} />
        <primitive object={hoverMat} attach="material" />
      </mesh>
      <mesh position={[0, 0.25, 0.05]}>
        <planeGeometry args={[1.1, 1.65]} />
        <meshBasicMaterial map={stickerTex} transparent depthWrite={false} />
      </mesh>
      <Edges geometry={geom} color={BLUEPRINT.line} opacity={0.85} />
    </group>
  );
}

/** The double door: hover colours both panels + they crack ajar; click
 * swings them open, dollies the camera in, then enters the corridor. */
function DoubleDoor({ onEnter }: { onEnter: () => void }) {
  const audio = useAudio();
  const { camera } = useThree();
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  const entering = useRef(false);
  const brownL = useMemo(() => new THREE.MeshBasicMaterial({ map: doorTexture(true), transparent: true, opacity: 0 }), []);
  const brownR = useMemo(() => new THREE.MeshBasicMaterial({ map: doorTexture(true), transparent: true, opacity: 0 }), []);
  useEffect(() => {
    (window as unknown as { __door?: unknown }).__door = { brownL, brownR };
  }, [brownL, brownR]);
  useEffect(
    () => () => {
      gsap.killTweensOf([brownL, brownR]);
      brownL.dispose();
      brownR.dispose();
    },
    [brownL, brownR],
  );

  const hoverIn = (e: ThreeEvent<PointerEvent>) => {
    if (entering.current) return;
    e.stopPropagation();
    setCursor(true);
    audio.play('doorCreak', { volume: 0.5 });
    gsap.to([brownL, brownR], { opacity: 1, duration: 0.6, ease: 'power2.out' });
    if (leftRef.current) gsap.to(leftRef.current.rotation, { y: -0.22, duration: 0.5, ease: 'power2.out' });
    if (rightRef.current) gsap.to(rightRef.current.rotation, { y: 0.22, duration: 0.5, ease: 'power2.out' });
  };
  const hoverOut = () => {
    if (entering.current) return;
    setCursor(false);
    gsap.to([brownL, brownR], { opacity: 0, duration: 0.45, ease: 'power2.out' });
    if (leftRef.current) gsap.to(leftRef.current.rotation, { y: 0, duration: 0.45, ease: 'power2.out' });
    if (rightRef.current) gsap.to(rightRef.current.rotation, { y: 0, duration: 0.45, ease: 'power2.out' });
  };
  const enter = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (entering.current) return;
    entering.current = true;
    setCursor(false);
    audio.unlock();
    audio.play('doorCreak', { volume: 0.8 });
    if (leftRef.current) gsap.to(leftRef.current.rotation, { y: -1.9, duration: 0.8, ease: 'power2.inOut' });
    if (rightRef.current) gsap.to(rightRef.current.rotation, { y: 1.9, duration: 0.8, ease: 'power2.inOut' });
    gsap.to(camera.position, {
      z: WALL_Z + 3.2,
      duration: 1.0,
      delay: 0.25,
      ease: 'power2.in',
      onComplete: onEnter,
    });
  };

  return (
    <group position={[0, 0, WALL_Z + 0.06]}>
      {/* the corridor's first metres, visible through the open doors —
          sits IN FRONT of the wall plane (the wall has no real hole) but
          BEHIND the door panels, so the closed doors hide it completely */}
      <mesh position={[0, 1.45, -0.045]}>
        <planeGeometry args={[2.66, 2.96]} />
        <meshBasicMaterial map={doorwayHallTexture()} />
      </mesh>
      {/* hinged panels (hinges at the outer edges) */}
      <group ref={leftRef} position={[-1.25, 0, 0]}>
        <DoorPanel side={1} hoverMat={brownL} stickers={STICKERS_LEFT} />
      </group>
      <group ref={rightRef} position={[1.25, 0, 0]}>
        <DoorPanel side={-1} hoverMat={brownR} stickers={STICKERS_RIGHT} />
      </group>
      {/* door frame */}
      <mesh position={[0, 2.98, 0.02]}>
        <boxGeometry args={[2.8, 0.16, 0.14]} />
        <meshBasicMaterial color="#dcd9d0" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.36, 1.45, 0.02]}>
          <boxGeometry args={[0.14, 3.1, 0.14]} />
          <meshBasicMaterial color="#dcd9d0" />
        </mesh>
      ))}
      {/* invisible hit plane across both panels */}
      <mesh
        position={[0, 1.45, 0.2]}
        visible={false}
        onPointerOver={hoverIn}
        onPointerOut={hoverOut}
        onClick={enter}
      >
        <planeGeometry args={[2.9, 3.1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Hanging PORTFOLIO sign under a jutting beam, swaying gently. */
function HangingSign() {
  const sign = useMemo(() => signTexture('PORTFOLIO', { colored: false, w: 512, h: 150 }), []);
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.7) * 0.035;
  });
  const boardGeom = useMemo(() => new THREE.BoxGeometry(2.5, 0.72, 0.07), []);
  const beamGeom = useMemo(() => new THREE.BoxGeometry(3.1, 0.22, 0.24), []);
  return (
    <group position={[0, 4.6, WALL_Z + 0.3]}>
      {/* beam — wrapped in its own positioned group so the mesh and its
          Edges outline share the same local origin (matching the door
          panel pattern) instead of the Edges silently drawing at [0,0,0] */}
      <group position={[0, 0.55, -0.1]}>
        <mesh geometry={beamGeom}>
          <meshBasicMaterial color="#e0ddd4" />
        </mesh>
        <Edges geometry={beamGeom} color={BLUEPRINT.line} opacity={0.85} />
      </group>
      <group ref={ref}>
        {[-0.9, 0.9].map((x) => (
          <mesh key={x} position={[x, 0.18, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.55, 6]} />
            <meshBasicMaterial color="#8a8a88" />
          </mesh>
        ))}
        <mesh geometry={boardGeom} position={[0, -0.35, 0]}>
          <meshBasicMaterial attach="material-0" color="#e0ded6" />
          <meshBasicMaterial attach="material-1" color="#e0ded6" />
          <meshBasicMaterial attach="material-2" color="#e0ded6" />
          <meshBasicMaterial attach="material-3" color="#e0ded6" />
          <meshBasicMaterial attach="material-4" map={sign} />
          <meshBasicMaterial attach="material-5" map={sign} />
        </mesh>
        <Edges geometry={boardGeom} color={BLUEPRINT.line} opacity={0.8} />
      </group>
    </group>
  );
}

/** The window: figure slides up waving when hovered. */
function Window() {
  const frame = useMemo(() => windowFrameTexture(), []);
  const figure = useMemo(() => windowFigureTexture(), []);
  const figRef = useRef<THREE.Group>(null);
  const figMat = useRef<THREE.MeshBasicMaterial>(null);
  const [hover, setHover] = useState(false);
  const wave = useRef(0);
  useFrame((_, dt) => {
    if (!figRef.current) return;
    const targetY = hover ? 0.02 : -0.25;
    figRef.current.position.y += (targetY - figRef.current.position.y) * Math.min(1, dt * 7);
    if (figMat.current) {
      const targetO = hover ? 1 : 0;
      figMat.current.opacity += (targetO - figMat.current.opacity) * Math.min(1, dt * 8);
    }
    wave.current += dt;
    figRef.current.rotation.z = hover ? Math.sin(wave.current * 6) * 0.05 : 0;
  });
  return (
    <group position={[4.7, 2.2, WALL_Z + 0.08]}>
      {/* interior — in FRONT of the wall plane (which has no real hole),
          behind the frame; the frame's wood band covers its edges */}
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[1.62, 1.62]} />
        <meshBasicMaterial color="#b9b6ae" />
      </mesh>
      {/* the figure pops up INSIDE the panes: fade + a small rise (no
          slide-from-below — anything under the sill would need a mask) */}
      <group ref={figRef} position={[0, -0.25, -0.02]}>
        <mesh>
          <planeGeometry args={[1.5, 1.5]} />
          <meshBasicMaterial ref={figMat} map={figure} transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      >
        <planeGeometry args={[1.75, 1.75]} />
        <meshBasicMaterial map={frame} transparent />
      </mesh>
    </group>
  );
}

/** The cat, out front where it belongs — pupils follow the cursor. */
function EntranceCat({ lines }: { lines: string[] }) {
  const audio = useAudio();
  const texture = useMemo(() => catTexture(), []);
  const pupils = useRef<THREE.Group>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const lineIdx = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );
  const size = 1.35;
  useFrame(({ pointer }) => {
    if (!pupils.current) return;
    const r = CAT_EYES.radius * size;
    pupils.current.position.x = THREE.MathUtils.clamp(pointer.x, -1, 1) * r;
    pupils.current.position.y = THREE.MathUtils.clamp(pointer.y, -1, 1) * r * 0.8;
  });
  const eye = (uv: { u: number; v: number }): [number, number, number] => [
    (uv.u - 0.5) * size,
    (0.5 - uv.v) * size,
    0.012,
  ];
  const meow = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    audio.play('pop', { volume: 0.5 });
    setBubble(lines[lineIdx.current % Math.max(1, lines.length)] ?? 'meow.');
    lineIdx.current += 1;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBubble(null), 3000);
  };
  return (
    <group position={[-2.9, size / 2 - 0.06, WALL_Z + 0.6]}>
      <mesh
        onClick={meow}
        onPointerOver={(e) => {
          e.stopPropagation();
          setCursor(true);
        }}
        onPointerOut={() => setCursor(false)}
      >
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial map={texture} transparent />
      </mesh>
      <group ref={pupils}>
        {[CAT_EYES.left, CAT_EYES.right].map((uv, i) => (
          <mesh key={i} position={eye(uv)}>
            <circleGeometry args={[size * 0.022, 12]} />
            <meshBasicMaterial color="#2c2c2a" />
          </mesh>
        ))}
      </group>
      {bubble && (
        <Html position={[0, size * 0.75, 0]} center distanceFactor={8} occlude={false}>
          <div
            style={{
              maxWidth: 220,
              padding: '0.5rem 0.75rem',
              borderRadius: 10,
              background: '#f7f5ef',
              border: '1.5px solid #2a2a2a',
              color: '#2a2a2a',
              fontFamily: '"Caveat", cursive',
              fontSize: '1.05rem',
              boxShadow: '2px 3px 0 rgba(42,42,42,0.15)',
              whiteSpace: 'nowrap',
            }}
          >
            {bubble}
          </div>
        </Html>
      )}
    </group>
  );
}

/** The bug: crawls along the wall; click squashes it into BUG FIXED! */
function Bug() {
  const audio = useAudio();
  const tex = useMemo(() => bugTexture(), []);
  const splat = useMemo(() => bugFixedTexture(), []);
  const ref = useRef<THREE.Group>(null);
  const [fixed, setFixed] = useState<[number, number] | null>(null);
  const t0 = useRef(Math.random() * 20);
  useFrame(({ clock }) => {
    if (fixed || !ref.current) return;
    const t = clock.elapsedTime * 0.07 + t0.current;
    // slow figure-eight wander on the right half of the wall
    const x = 6.8 + Math.sin(t) * 1.6;
    const y = 4.6 + Math.sin(t * 2) * 0.9;
    const dx = Math.cos(t) * 1.6;
    const dy = Math.cos(t * 2) * 1.8;
    ref.current.position.set(x, y, WALL_Z + 0.08);
    ref.current.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
  });
  if (fixed) {
    return (
      <mesh position={[fixed[0] + 0.55, fixed[1], WALL_Z + 0.08]}>
        <planeGeometry args={[2.2, 1.1]} />
        <meshBasicMaterial map={splat} transparent depthWrite={false} />
      </mesh>
    );
  }
  return (
    <group ref={ref}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          audio.play('pop', { volume: 0.8 });
          if (ref.current) setFixed([ref.current.position.x, ref.current.position.y]);
          setCursor(false);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setCursor(true);
        }}
        onPointerOut={() => setCursor(false)}
      >
        <planeGeometry args={[0.42, 0.42]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Tree + the computer mouse hanging from its branch, swinging. */
function Tree() {
  const tree = useMemo(() => treeTexture(), []);
  const mouse = useMemo(() => hangingMouseTexture(), []);
  const mouseRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (mouseRef.current) mouseRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.9) * 0.09;
  });
  return (
    <group position={[-7.6, 0, WALL_Z + 0.9]}>
      <mesh position={[0, 3.1, 0]}>
        <planeGeometry args={[4.4, 6.6]} />
        <meshBasicMaterial map={tree} transparent depthWrite={false} />
      </mesh>
      {/* mouse hangs from the right branch; pivot at the branch point */}
      <group ref={mouseRef} position={[1.42, 3.15, 0.05]}>
        <mesh position={[0, -0.62, 0]}>
          <planeGeometry args={[0.62, 1.24]} />
          <meshBasicMaterial map={mouse} transparent depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

export function Entrance({ onEnter }: EntranceProps): JSX.Element {
  const data = useWorldData();
  const bricks = useMemo(() => {
    const t = bricksTexture();
    const clone = t.clone();
    clone.repeat.set(WALL_W / 7, WALL_H / 7);
    clone.needsUpdate = true;
    return clone;
  }, []);
  const path = useMemo(() => stonePathTexture(), []);
  const grass = useMemo(() => {
    const t = grassTexture();
    const clone = t.clone();
    clone.repeat.set(WALL_W / 4, 1);
    clone.needsUpdate = true;
    return clone;
  }, []);
  useEffect(
    () => () => {
      bricks.dispose();
      grass.dispose();
    },
    [bricks, grass],
  );

  const catLines = useMemo(() => {
    const egg = data.easterEggs.find((e) => e.id === 'quantumCat');
    return egg?.lines ?? ['…the cat is both asleep and awake.'];
  }, [data.easterEggs]);
  const planter = useMemo(() => planterTexture(), []);

  return (
    <group>
      {/* brick facade */}
      <mesh position={[0, WALL_H / 2, WALL_Z]}>
        <planeGeometry args={[WALL_W, WALL_H]} />
        <meshBasicMaterial map={bricks} />
      </mesh>
      {/* grass along the base */}
      <mesh position={[0, 0.24, WALL_Z + 0.12]}>
        <planeGeometry args={[WALL_W, 0.5]} />
        <meshBasicMaterial map={grass} transparent depthWrite={false} />
      </mesh>
      {/* ground */}
      <mesh position={[0, 0, WALL_Z + 5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WALL_W, 12]} />
        <meshBasicMaterial color="#f3f1ea" />
      </mesh>
      {/* stone path from the viewer to the door — far edge held at the
          original WALL_Z + 0.4 (still meets the door threshold), near edge
          pulled well back from the camera (and shortened) so the
          largest/nearest stone row doesn't grow into the screen region the
          fixed toast card occupies */}
      <mesh position={[0, 0.01, WALL_Z + 2.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.6, 4.6]} />
        <meshBasicMaterial map={path} transparent depthWrite={false} />
      </mesh>

      <DoubleDoor onEnter={onEnter} />
      <HangingSign />
      <Window />
      <EntranceCat lines={catLines} />
      <Tree />
      <Bug />

      {/* planter under the window */}
      <mesh position={[4.7, 0.62, WALL_Z + 0.45]}>
        <planeGeometry args={[2.3, 1.15]} />
        <meshBasicMaterial map={planter} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

export default Entrance;
