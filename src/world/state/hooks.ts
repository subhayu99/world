// Shared context seams between world modules. Frozen contract: leaf modules
// import these hooks; the providers in state/store.tsx (and WorldMode.tsx)
// populate them. Do not add module-level state here.

import { createContext, useContext } from 'react';
import type { WorldData, WorldState } from '../types';
import type { AchievementsApi, AudioEngine, TextureFactory, WorldActions } from '../contracts';

function makeCtx<T>(name: string) {
  const Ctx = createContext<T | null>(null);
  const useCtx = (): T => {
    const v = useContext(Ctx);
    if (v === null) throw new Error(`${name} used outside its provider`);
    return v;
  };
  return [Ctx, useCtx] as const;
}

export const [WorldDataCtx, useWorldData] = makeCtx<WorldData>('useWorldData');
export const [WorldStoreCtx, useWorldStore] = makeCtx<WorldState & WorldActions>('useWorldStore');
export const [AudioCtx, useAudio] = makeCtx<AudioEngine>('useAudio');
export const [TexturesCtx, useTextures] = makeCtx<TextureFactory>('useTextures');
export const [AchievementsCtx, useAchievements] = makeCtx<AchievementsApi>('useAchievements');
