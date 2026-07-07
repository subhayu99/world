// Engine interfaces + tuned constants for world mode. Values derive from the
// itomdev.com research (itomdev-research/REPORT.md). Leaf modules implement or
// consume these — never redefine them locally.

import type * as THREE from 'three';
import type { AchievementDef, AchievementId, RoomId, SoundName, WorldState } from './types';

// ---- Camera / corridor tuning ----

export const CORRIDOR = {
  segmentLength: 80,
  scrollSpeed: 0.025,
  parallaxIntensity: 0.4,
  smoothing: 0.06,
  glanceIntensity: 0.15,
  rollClamp: 0.26,
  rollStep: 0.08,
  keyImpulse: { arrow: 100, page: 400, space: 200 },
  touchwalkFactor: 1.5,
  touchLookFactor: 0.003,
  // door z-offsets within a segment, alternating sides
  doorSlots: [
    { z: -18, side: 'left' as const },
    { z: -32, side: 'right' as const },
    { z: -48, side: 'left' as const },
    { z: -62, side: 'right' as const },
  ],
  glanceZone: { start: 15, peak: 8, end: -2 },
  cameraY: 1.5, // eye level — 0.2 read as crawling on the floor
  lookAhead: 10,
} as const;

export const CANVAS_DEFAULTS = {
  camera: { position: [0, CORRIDOR.cameraY, 28] as [number, number, number], fov: 60, near: 0.1, far: 150 },
  // Pencil-and-pastel world: warm paper ground, graphite linework. Kept in
  // sync with blueprint/palette.ts (not imported to avoid a cycle).
  background: '#f6f4ee',
  fog: { color: '#f6f4ee', near: 16, far: 90 },
} as const;

// Room camera anchors (teleport .set() targets while paper is closed)
export const ROOM_ANCHORS: Record<RoomId, number> = {
  journey: -6,
  warehouse: -20,
  registry: -36,
  contact: -50,
};

// Door open/enter choreography (seconds)
export const DOOR_TIMING = {
  hoverAjar: 0.3,
  hoverReveal: 0.8,
  unhoverReveal: 0.5,
  approach: 1.0,
  swing: 0.7,
  walkThrough: 1.5,
  enterDelay: 0.25,
  closeDelay: 0.5,
  roomReadyTimeoutMs: 8000,
} as const;

// ---- Materials ----

// RevealMaterial: MeshBasicMaterial patched via onBeforeCompile.
// Uniforms contract (exact names):
//   uProgress: number 0..1  — brush-stroke reveal driven by hover (gsap power2.out)
//   noise mask: value-noise(vUv*15)*0.15, threshold = uProgress*1.5, discard below
export const REVEAL_UNIFORMS = { progress: 'uProgress' } as const;

// Paint-wash (room entry): planar boundary sweep in world space.
//   uPaintProgress: 0..1, uRoomOrigin: vec3; glow rgb += vec3(g*.4,g*.5,g*.7)
export const PAINT_UNIFORMS = { progress: 'uPaintProgress', origin: 'uRoomOrigin' } as const;

export interface PaintWashConfig {
  dir: [number, number, number];
  startDist: number;
  endDist: number;
}

export interface PaintWashHandle {
  onBeforeCompile: (shader: { uniforms: Record<string, { value: unknown }>; fragmentShader: string; vertexShader: string }) => void;
  animatePaint: (delay?: number, duration?: number) => void;
  resetPaint: () => void;
  setRoomOrigin: (v: [number, number, number]) => void;
}

// ---- Texture pairs (the swappable art interface) ----
// V1 backs this with procedural notebook art (canvas). Later: file-based
// hand-drawn textures behind the same ids without engine changes.

export interface TexturePair {
  sketch: THREE.Texture;
  painted: THREE.Texture;
}

export interface TextureFactory {
  // stable ids, e.g. 'paper', 'graph', 'door/journey', 'sign/journey',
  // 'parcel/sqlstream', 'exhibit/cv-advisors', 'egg/rubberDuck' ...
  get(id: string): TexturePair;
  // canvas-rendered ink text (Caveat/Patrick Hand via FontFace, same-origin)
  text(text: string, opts?: { font?: 'caveat' | 'hand'; size?: number; color?: string; maxWidth?: number }): THREE.Texture;
  dispose(): void;
}

// ---- Audio ----

export interface AudioEngine {
  play(name: SoundName, opts?: { loop?: boolean; volume?: number }): void;
  stop(name: SoundName): void;
  setMusicVolume(v: number): void; // 0..1, default 0.3
  setSfxVolume(v: number): void; // 0..1, default 0.5
  toggleMute(): boolean;
  isMuted(): boolean;
  unlock(): void; // call on first user gesture (cover click)
}

// ---- Store ----

export interface WorldActions {
  setStage(stage: WorldState['stage']): void;
  enterRoom(room: RoomId): void;
  exitRoom(): void;
  teleportTo(room: RoomId): void;
  advanceTeleport(): void; // closing -> teleporting -> opening -> null
}

// ---- Achievements ----

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'open_notebook', title: 'Explorer', label: 'Open the notebook' },
  { id: 'walk_corridor', title: 'Wanderer', label: 'Scroll to walk the corridor' },
  { id: 'fly_journey', title: 'Time Traveler', label: 'Scroll to fly through the journey' },
  { id: 'inspect_exhibit', title: 'Inspector', label: 'Open a project card' },
  { id: 'open_parcel', title: 'Collector', label: 'Pick up a package' },
  { id: 'reach_out', title: 'Pen Pal', label: 'Find a way to reach me' },
];

export const ACHIEVEMENTS_STORAGE_KEY = 'world-achievements';

export interface AchievementsApi {
  unlock(id: AchievementId): void;
  unlocked: AchievementId[];
  current: AchievementDef | null; // active toast/tutorial hint
}

// ---- Misc ----

export const WORLD_DATA_URL = 'data/world.json'; // relative to BASE_URL, like resume.json
export const FONTS = {
  caveat: 'fonts/Caveat-Variable.ttf',
  hand: 'fonts/PatrickHand-Regular.ttf',
  draft: 'fonts/ArchitectsDaughter-Regular.ttf',
} as const;

// Device tiers (mirrors research §5)
export type Tier = 'HIGH' | 'MEDIUM' | 'LOW';
export const TIERS: Record<Tier, { dpr: [number, number]; antialias: boolean; shadows: boolean; powerPreference: WebGLPowerPreference }> = {
  HIGH: { dpr: [1, 2], antialias: true, shadows: false, powerPreference: 'high-performance' },
  MEDIUM: { dpr: [1, 1.5], antialias: true, shadows: false, powerPreference: 'default' },
  LOW: { dpr: [0.8, 1], antialias: false, shadows: false, powerPreference: 'low-power' },
};
