// Composition root for world-mode context: wires the pure reducer + the
// achievements controller into the context seams declared in hooks.ts.
// Kept intentionally thin — all interesting logic lives in reducer.ts and
// achievements.tsx, both independently unit-tested.

import { useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { WorldData } from '../types';
import type { AudioEngine, TextureFactory } from '../contracts';
import { AudioCtx, TexturesCtx, WorldDataCtx, WorldStoreCtx } from './hooks';
import { bindWorldActions, initialWorldState, worldReducer } from './reducer';
import { AchievementsProvider } from './achievements';

export interface WorldProvidersProps {
  data: WorldData;
  audio: AudioEngine;
  textures: TextureFactory;
  children: ReactNode;
}

/** <WorldProviders data audio textures> — the single provider tree leaf modules render under. */
export function WorldProviders({ data, audio, textures, children }: WorldProvidersProps): JSX.Element {
  const [state, dispatch] = useReducer(worldReducer, initialWorldState);
  const actions = useMemo(() => bindWorldActions(dispatch), [dispatch]);
  const storeValue = useMemo(() => ({ ...state, ...actions }), [state, actions]);

  return (
    <WorldDataCtx.Provider value={data}>
      <AudioCtx.Provider value={audio}>
        <TexturesCtx.Provider value={textures}>
          <AchievementsProvider audio={audio} currentRoom={state.currentRoom}>
            <WorldStoreCtx.Provider value={storeValue}>{children}</WorldStoreCtx.Provider>
          </AchievementsProvider>
        </TexturesCtx.Provider>
      </AudioCtx.Provider>
    </WorldDataCtx.Provider>
  );
}
