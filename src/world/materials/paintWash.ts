// Room paint-wash material patch: an onBeforeCompile patch of MeshBasicMaterial
// implementing the planar boundary sweep from REPORT.md §7.2. Unlike reveal.ts,
// this module never creates or owns a THREE.Material itself — per the frozen
// PaintWashHandle contract (contracts.ts), it only hands back an
// `onBeforeCompile` callback (typed against a minimal structural shader shape,
// not THREE's own heavy type) that the room component assigns onto its own
// wall/floor material. That keeps this module free of any `three` dependency
// at all, so it's testable as pure string/uniform logic.
import gsap from 'gsap';
import type { PaintWashConfig, PaintWashHandle } from '../contracts';
import {
  paintWashFragmentGlsl,
  paintWashUniformsGlsl,
  paintWashVaryingGlsl,
  paintWashVertexAssignGlsl,
  patchShader,
  valueNoiseGlsl,
} from './glsl';

/**
 * Builds the paint-wash patch for one room's config. `config.dir` /
 * `startDist` / `endDist` are baked into the injected GLSL as literals (see
 * glsl.ts doc) — each distinct config therefore compiles to distinct
 * fragment-shader text. Because three.js's default program cache key doesn't
 * account for onBeforeCompile-injected text, the room component must give its
 * material a config-derived `customProgramCacheKey` (use
 * `paintWashCacheKey(config)` from `./glsl`) so two rooms never share a
 * compiled program with the wrong baked-in numbers.
 */
export function usePaintWashMaterialPatch(config: PaintWashConfig): PaintWashHandle {
  // Shared refs: gsap tweens uPaintProgress directly, and setRoomOrigin
  // mutates uRoomOrigin's `.value` in place — both are the exact objects
  // Object.assign'd onto the compiled shader's uniforms, so changes after
  // compilation still drive the live shader.
  const uniforms = {
    uPaintProgress: { value: 0 },
    uRoomOrigin: { value: [0, 0, 0] as [number, number, number] },
  };

  function onBeforeCompile(shader: {
    uniforms: Record<string, { value: unknown }>;
    fragmentShader: string;
    vertexShader: string;
  }): void {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = patchShader(shader.vertexShader, '#include <common>', paintWashVaryingGlsl());
    shader.vertexShader = patchShader(
      shader.vertexShader,
      '#include <worldpos_vertex>',
      paintWashVertexAssignGlsl(),
    );

    shader.fragmentShader = patchShader(
      shader.fragmentShader,
      '#include <common>',
      `${paintWashVaryingGlsl()}\n${paintWashUniformsGlsl()}\n${valueNoiseGlsl()}`,
    );
    shader.fragmentShader = patchShader(
      shader.fragmentShader,
      '#include <dithering_fragment>',
      paintWashFragmentGlsl(config),
    );
  }

  function animatePaint(delay = 0.2, duration = 2.5): void {
    gsap.to(uniforms.uPaintProgress, { value: 1, duration, delay, ease: 'power2.inOut' });
  }

  function resetPaint(): void {
    gsap.killTweensOf(uniforms.uPaintProgress);
    uniforms.uPaintProgress.value = 0;
  }

  function setRoomOrigin(v: [number, number, number]): void {
    uniforms.uRoomOrigin.value = v;
  }

  return { onBeforeCompile, animatePaint, resetPaint, setRoomOrigin };
}
