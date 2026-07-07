// Brush-stroke reveal material: an onBeforeCompile patch of MeshBasicMaterial.
// See REPORT.md §7.1. The mask discards fragments below a noise-perturbed
// diagonal-ish threshold driven by uProgress (REVEAL_UNIFORMS.progress).
//
// `makeRevealMaterial` builds ONE patched material (the sketch layer).
// `makeRevealPair` composes the documented two-mesh pattern on top of it:
// a sketch mesh (material from makeRevealMaterial) sits in front, a painted
// mesh sits 0.001 behind (composed by the consumer — this module just hands
// back both materials + the hover choreography).
import type * as THREE from 'three';
import gsap from 'gsap';
import { patchShader, revealMaskGlsl, revealUniformsGlsl, valueNoiseGlsl } from './glsl';
import type { TexturePair } from '../contracts';

export interface RevealMaterialHandle {
  material: THREE.MeshBasicMaterial;
  setProgress(v: number): void;
  tweenProgress(v: number, dur?: number, ease?: string): gsap.core.Tween;
}

export interface RevealPairHandle {
  sketchMaterial: THREE.MeshBasicMaterial;
  paintedMaterial: THREE.MeshBasicMaterial;
  hoverIn(): void;
  hoverOut(): void;
}

/**
 * Builds the sketch-layer reveal material. `THREE_` is injected (never
 * imported directly) so this module carries no runtime dependency on any
 * particular three.js instance — the caller's own `three` import is reused.
 */
export function makeRevealMaterial(
  THREE_: typeof THREE,
  opts: { map: THREE.Texture; mapPainted?: THREE.Texture },
): RevealMaterialHandle {
  // Shared ref: gsap tweens this object directly, and it's the exact object
  // handed to the compiled shader's uniforms via Object.assign below, so
  // tweening it after compilation still drives the live shader.
  const uniforms = { uProgress: { value: 0 } };

  const material = new THREE_.MeshBasicMaterial({
    map: opts.map,
    transparent: true,
  });

  if (opts.mapPainted) {
    material.userData.mapPainted = opts.mapPainted;
  }

  material.customProgramCacheKey = () => 'world-reveal-v1';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = patchShader(
      shader.fragmentShader,
      '#include <common>',
      `${revealUniformsGlsl()}\n${valueNoiseGlsl()}`,
    );
    shader.fragmentShader = patchShader(
      shader.fragmentShader,
      '#include <alphatest_fragment>',
      revealMaskGlsl(),
    );
  };
  material.needsUpdate = true;

  return {
    material,
    setProgress(v: number) {
      uniforms.uProgress.value = v;
    },
    tweenProgress(v: number, dur = 0.8, ease = 'power2.out') {
      return gsap.to(uniforms.uProgress, { value: v, duration: dur, ease });
    },
  };
}

/**
 * The full two-mesh reveal pattern: a sketch-layer material (front) plus a
 * painted-layer material (consumer places its mesh ~0.001 behind), wired to
 * the hover choreography from REPORT.md §7.1 — hoverIn 0→1 over 0.8s
 * power2.out with the painted mesh made visible immediately; hoverOut 1→0
 * over 0.5s, hiding the painted mesh 0.55s later (so the discard mask has
 * fully closed before the layer disappears).
 */
export function makeRevealPair(THREE_: typeof THREE, pair: TexturePair): RevealPairHandle {
  const reveal = makeRevealMaterial(THREE_, { map: pair.sketch, mapPainted: pair.painted });

  const paintedMaterial = new THREE_.MeshBasicMaterial({
    map: pair.painted,
    transparent: true,
  });
  paintedMaterial.visible = false;

  let hideTimer: gsap.core.Tween | null = null;

  function hoverIn(): void {
    if (hideTimer) {
      hideTimer.kill();
      hideTimer = null;
    }
    paintedMaterial.visible = true;
    reveal.tweenProgress(1, 0.8, 'power2.out');
  }

  function hoverOut(): void {
    reveal.tweenProgress(0, 0.5, 'power2.out');
    hideTimer = gsap.delayedCall(0.55, () => {
      paintedMaterial.visible = false;
      hideTimer = null;
    });
  }

  return {
    sketchMaterial: reveal.material,
    paintedMaterial,
    hoverIn,
    hoverOut,
  };
}
