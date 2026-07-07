// World mode composition root — the only file that wires every world module
// together. Lazy-loaded from App.tsx so three/R3F/gsap stay out of the main
// bundle until the user enters the world.

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Canvas, useThree } from '@react-three/fiber';
import { createAudioEngine } from './audio/engine';
import { createTextureFactory } from './textures/factory';
import { loadWorldData } from './state/dataLoader';
import { WorldProviders } from './state/store';
import { useAchievements, useAudio, useWorldStore } from './state/hooks';
import { Preloader } from './ui/Preloader';
import { Entrance } from './entrance/Entrance';
import { EntranceToast } from './entrance/EntranceToast';
import { Hud } from './ui/Hud';
import { PaperTear } from './ui/PaperTear';
import { A11yNav } from './ui/A11yNav';
import { SeoFallback } from './ui/SeoFallback';
import { Corridor } from './scene/Corridor';
import { Journey } from './rooms/Journey';
import Warehouse from './rooms/Warehouse';
import { Registry } from './rooms/Registry';
import { Contact } from './rooms/Contact';
import { useCorridorCamera } from './camera/useCorridorCamera';
import { CANVAS_DEFAULTS, CORRIDOR, ROOM_ANCHORS, TIERS, type Tier } from './contracts';
import type { RoomId, WorldData } from './types';

function detectTier(): Tier {
  if (typeof navigator === 'undefined') return 'MEDIUM';
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  if (memory <= 4) return 'LOW';
  if (cores <= 4) return mobile ? 'LOW' : 'MEDIUM';
  return mobile ? 'MEDIUM' : 'HIGH';
}

/** z of the corridor door leading to a room (slots run journey→contact). */
const DOOR_Z: Record<RoomId, number> = {
  journey: CORRIDOR.doorSlots[0].z,
  warehouse: CORRIDOR.doorSlots[1].z,
  registry: CORRIDOR.doorSlots[2].z,
  contact: CORRIDOR.doorSlots[3].z,
};

/** Camera controller — must live inside <Canvas>. */
function CameraRig() {
  const store = useWorldStore();
  const achievements = useAchievements();
  const { camera } = useThree();
  const api = useCorridorCamera({
    enabled: store.stage === 'corridor' && store.teleport.phase === null,
    zMin: -CORRIDOR.segmentLength,
    onWalk: () => achievements.unlock('walk_corridor'),
  });

  // Door focus: hovering a door keeps the walk rig in control and simply
  // turns the head toward the door (soft look-target blend inside the rig).
  // The old approach — pausing the rig and gsap-flying the camera to a
  // staged spot — read as a pointless hijack and is gone.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const { x, z } = (e as CustomEvent<{ x: number; z: number }>).detail;
      api.setFocus([x, 1.5, z]);
    };
    const onBlur = () => api.setFocus(null);
    window.addEventListener('world:door-focus', onFocus);
    window.addEventListener('world:door-blur', onBlur);
    return () => {
      window.removeEventListener('world:door-focus', onFocus);
      window.removeEventListener('world:door-blur', onBlur);
    };
  }, [api]);

  // Stage-driven camera placement: the walk hook owns the camera only in
  // the corridor; entering/leaving rooms snaps to a known viewpoint (the
  // paper-tear overlay covers teleports; door entries are a hard cut in v1).
  const prevStage = useRef(store.stage);
  const prevRoom = useRef<RoomId | null>(null);
  useEffect(() => {
    const was = prevStage.current;
    const wasRoom = prevRoom.current;
    prevStage.current = store.stage;
    prevRoom.current = store.currentRoom;

    if (store.stage === 'corridor' && was !== 'corridor') {
      const z = wasRoom ? DOOR_Z[wasRoom] + 4 : 10;
      camera.position.set(0, CORRIDOR.cameraY, z);
      camera.lookAt(0, 1.35, z - CORRIDOR.lookAhead);
      api.setFocus(null);
      api.setOverride(true);
    }
    if (store.stage === 'room' && was !== 'room') {
      api.setFocus(null);
    }
    if (store.stage === 'room' && store.currentRoom && (was !== 'room' || wasRoom !== store.currentRoom)) {
      const anchor = ROOM_ANCHORS[store.currentRoom];
      // Per-room framing tuned against E2E screenshots: each room's content
      // sits at a different offset/height relative to its anchor.
      const framing: Record<RoomId, { pos: [number, number, number]; look: [number, number, number] }> = {
        journey: { pos: [0, 4, anchor + 6], look: [0, 5, anchor - 20] },
        warehouse: { pos: [0, 1.9, anchor - 2], look: [0, 1.5, anchor - 13] },
        registry: { pos: [0, 2.5, anchor - 3], look: [0, 2.4, anchor - 11.5] },
        contact: { pos: [0, 2.6, anchor + 2.5], look: [0, 0.8, anchor - 12] },
      };
      const f = framing[store.currentRoom];
      camera.position.set(...f.pos);
      camera.lookAt(...f.look);
    }
  }, [store.stage, store.currentRoom, camera, api]);

  return null;
}

/** Corridor artwork zoom: WallDoodle clicks dispatch world:art-open with a
 * data-URL of the painted canvas; this renders it big in a wooden frame on
 * paper. Plain DOM — WorldShell sits outside the R3F Canvas. */
function ArtLightbox(): JSX.Element | null {
  const [art, setArt] = useState<{ src: string; title: string } | null>(null);
  useEffect(() => {
    const onOpen = (e: Event) => setArt((e as CustomEvent<{ src: string; title: string }>).detail);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArt(null);
    };
    window.addEventListener('world:art-open', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('world:art-open', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  if (!art) return null;
  return (
    <div
      onClick={() => setArt(null)}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(58,56,50,0.45)',
        cursor: 'zoom-out',
      }}
    >
      <div
        style={{
          background: '#f6f4ee',
          padding: '1.4rem',
          border: '10px solid #c69a63',
          outline: '3px solid #4a4a48',
          boxShadow: '0 18px 60px rgba(40,38,32,0.4)',
          transform: 'rotate(-0.6deg)',
          maxWidth: 'min(72vw, 640px)',
        }}
      >
        <img src={art.src} alt={art.title} style={{ display: 'block', width: '100%', imageRendering: 'auto' }} />
        <p
          style={{
            margin: '0.7rem 0 0',
            textAlign: 'center',
            fontFamily: '"Caveat", cursive',
            fontSize: '1.2rem',
            color: '#4a4a48',
          }}
        >
          — from the hallway wall —
        </p>
      </div>
    </div>
  );
}

const ROOM_COMPONENTS: Record<RoomId, (props: { active: boolean; onReady: () => void }) => JSX.Element> = {
  journey: Journey,
  warehouse: Warehouse,
  registry: Registry,
  contact: Contact,
};

function Rooms() {
  const store = useWorldStore();
  // Only the current room renders — anchors are close enough together that
  // neighbouring rooms would bleed into each other's frame otherwise.
  if (store.stage !== 'room' || !store.currentRoom) return null;
  const RoomComponent = ROOM_COMPONENTS[store.currentRoom];
  return <RoomComponent key={store.currentRoom} active onReady={() => undefined} />;
}

/** Everything that needs the provider tree. */
function WorldShell({ progress, canvasReady, onCanvasCreated }: {
  progress: number;
  canvasReady: boolean;
  onCanvasCreated: () => void;
}) {
  const store = useWorldStore();
  const audio = useAudio();
  const achievements = useAchievements();
  const tier = useMemo(detectTier, []);
  const tierCfg = TIERS[tier];

  const handleOpen = () => {
    audio.unlock();
    try {
      audio.play('pageFlip', { volume: 0.6 });
      // the generative lo-fi bed runs for the whole visit, world-wide
      audio.play('ambience', { loop: true, volume: 0.5 });
    } catch {
      // audio must never block entry
    }
    achievements.unlock('open_notebook');
    store.setStage('corridor');
  };

  // Escape exits a room (HUD back button is the pointer path).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && store.stage === 'room' && store.teleport.phase === null) {
        store.exitRoom();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  return (
    <>
      <Canvas
        camera={{
          position: [...CANVAS_DEFAULTS.camera.position],
          fov: CANVAS_DEFAULTS.camera.fov,
          near: CANVAS_DEFAULTS.camera.near,
          far: CANVAS_DEFAULTS.camera.far,
        }}
        dpr={tierCfg.dpr}
        gl={{ antialias: tierCfg.antialias, alpha: false, powerPreference: tierCfg.powerPreference }}
        onCreated={onCanvasCreated}
        style={{ position: 'absolute', inset: 0 }}
      >
        <color attach="background" args={[CANVAS_DEFAULTS.background]} />
        <fog attach="fog" args={[CANVAS_DEFAULTS.fog.color, CANVAS_DEFAULTS.fog.near, CANVAS_DEFAULTS.fog.far]} />
        <CameraRig />
        {store.stage === 'cover' && <Entrance onEnter={handleOpen} />}
        {store.stage === 'corridor' && <Corridor />}
        <Rooms />
      </Canvas>

      {store.stage === 'loading' && (
        <Preloader progress={progress} ready={canvasReady} onDone={() => store.setStage('cover')} />
      )}
      {store.stage === 'cover' && <EntranceToast onOpen={handleOpen} />}
      {(store.stage === 'corridor' || store.stage === 'room') && <Hud />}
      <ArtLightbox />
      <PaperTear />
      <A11yNav />
      <SeoFallback />
    </>
  );
}

export default function WorldMode() {
  const [data, setData] = useState<WorldData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  // One engine + factory per world-mode mount.
  const audio = useMemo(() => createAudioEngine(), []);
  const textures = useMemo(() => createTextureFactory(), []);

  useEffect(() => {
    let cancelled = false;
    loadWorldData()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => textures.dispose(), [textures]);

  // Coarse but honest progress: data fetch is the only network step; the
  // rest (procedural textures, first frame) is signaled by canvasReady.
  const progress = data ? (canvasReady ? 1 : 0.7) : 0.15;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full h-dvh overflow-hidden relative"
      style={{ background: '#f7f5ef' }}
    >
      {error && (
        <div className="w-full h-full flex items-center justify-center font-mono text-sm" style={{ color: '#2a2a2a' }}>
          <p>Could not open the notebook: {error}</p>
        </div>
      )}
      {!error && data && (
        <WorldProviders data={data} audio={audio} textures={textures}>
          <WorldShell
            progress={progress}
            canvasReady={canvasReady}
            onCanvasCreated={() => setCanvasReady(true)}
          />
        </WorldProviders>
      )}
    </motion.div>
  );
}
