// Pure GLSL snippet builders + an onBeforeCompile string-splice helper.
// Deliberately has zero THREE/DOM/canvas dependency — every export here is a
// plain string function, safe to unit test in happy-dom. See REPORT.md §7 for
// the mechanics being replicated (brush-stroke reveal + room paint wash).
import type { PaintWashConfig } from '../contracts';

/**
 * Splices `snippet` into `source` immediately after the first occurrence of
 * `anchor` (typically a three.js `#include <chunk_name>` line). Throws if the
 * anchor isn't found, so a shader-chunk-layout change in a three.js upgrade
 * fails loudly at patch time instead of silently no-op'ing.
 */
export function patchShader(source: string, anchor: string, snippet: string): string {
  const idx = source.indexOf(anchor);
  if (idx === -1) {
    throw new Error(`patchShader: anchor "${anchor}" not found in shader source`);
  }
  const insertAt = idx + anchor.length;
  return `${source.slice(0, insertAt)}\n${snippet}\n${source.slice(insertAt)}`;
}

/** Formats a JS number as a valid GLSL float literal (always has a decimal point). */
function glslFloat(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : `${n}`;
}

// ---- Shared value-noise library ----
// Cheap hash-based value noise, no textures. Both the reveal mask and the
// paint-wash boundary perturb their edges with this. Guarded so re-injecting
// it into the same compiled source twice is harmless.
export function valueNoiseGlsl(): string {
  return /* glsl */ `
#ifndef WN_VALUE_NOISE
#define WN_VALUE_NOISE
float wnHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float wnValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = wnHash(i);
  float b = wnHash(i + vec2(1.0, 0.0));
  float c = wnHash(i + vec2(0.0, 1.0));
  float d = wnHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
#endif
`;
}

// ---- Reveal (brush-stroke) ----
// Contract uniform: uProgress (REVEAL_UNIFORMS.progress).

/** Declares the reveal material's uniform. Insert once, e.g. after `#include <common>`. */
export function revealUniformsGlsl(): string {
  return `uniform float uProgress;\n`;
}

/**
 * The brush-stroke discard test. Insert after `#include <alphatest_fragment>`.
 * Uses vMapUv (three's per-map UV varying, present whenever `USE_MAP` is
 * defined — true here since the reveal material always has a diffuse map).
 */
export function revealMaskGlsl(): string {
  return /* glsl */ `
{
  float rvNoise = wnValueNoise(vMapUv * 15.0) * 0.15;
  float rvMask = (1.0 - vMapUv.y) + rvNoise;
  if (rvMask < uProgress * 1.5) discard;
}
`;
}

// ---- Paint wash (room-entry boundary sweep) ----
// Contract uniforms: uPaintProgress, uRoomOrigin (PAINT_UNIFORMS). The sweep
// direction and start/end distances come from PaintWashConfig and are baked
// in as GLSL literals at compile time (they're per-room constants, not
// runtime-tweened values) — that's why callers must give the patched
// material a config-derived `customProgramCacheKey` so three.js doesn't
// reuse one room's compiled program (with another room's baked-in numbers)
// for a different room's material.

/** Declares the paint-wash material's uniforms. Insert once, e.g. after `#include <common>`. */
export function paintWashUniformsGlsl(): string {
  return /* glsl */ `
uniform float uPaintProgress;
uniform vec3 uRoomOrigin;
`;
}

/** The world-position varying shared between vertex and fragment stages. */
export function paintWashVaryingGlsl(): string {
  return /* glsl */ `
#ifndef WN_WORLD_POS_PAINT
#define WN_WORLD_POS_PAINT
varying vec3 vWorldPosPaint;
#endif
`;
}

/**
 * Assigns the world-position varying. Insert after `#include <worldpos_vertex>`
 * in the vertex shader. Deliberately computes its own `modelMatrix * transformed`
 * rather than reusing three's `worldPosition` local — that variable is only
 * declared by `worldpos_vertex` under envmap/shadow/transmission defines, which
 * a plain paint-wash wall/floor material won't have set.
 */
export function paintWashVertexAssignGlsl(): string {
  return `vWorldPosPaint = (modelMatrix * vec4(transformed, 1.0)).xyz;\n`;
}

/**
 * The boundary-sweep discard + wet-paint-edge glow. Insert after
 * `#include <dithering_fragment>`. `config` is baked in as literals (see
 * module doc above) — this is a pure function of its argument, safe to unit
 * test without any THREE/WebGL involved.
 */
export function paintWashFragmentGlsl(config: PaintWashConfig): string {
  const [dx, dy, dz] = config.dir;
  return /* glsl */ `
{
  vec3 pwDir = normalize(vec3(${glslFloat(dx)}, ${glslFloat(dy)}, ${glslFloat(dz)}));
  vec3 pwLocalPos = vWorldPosPaint - uRoomOrigin;
  float pwBoundary = mix(${glslFloat(config.startDist)}, ${glslFloat(config.endDist)}, uPaintProgress) - dot(pwLocalPos, pwDir);
  float pwNoise = wnValueNoise(vWorldPosPaint.xz * 0.5) * 0.6 + wnValueNoise(vWorldPosPaint.xz * 1.9 + 11.0) * 0.3;
  if (pwBoundary + pwNoise < 0.0) discard;
  if (pwBoundary < 2.0) {
    float pwGlow = 1.0 - clamp(pwBoundary / 2.0, 0.0, 1.0);
    gl_FragColor.rgb += vec3(pwGlow * 0.4, pwGlow * 0.5, pwGlow * 0.7);
  }
}
`;
}

/**
 * Stable cache-key string for a given paint-wash config. Callers must assign
 * `material.customProgramCacheKey = () => paintWashCacheKey(config)` — three.js's
 * default program cache key doesn't account for onBeforeCompile-injected GLSL
 * literals, so two rooms with different configs could otherwise silently
 * share (and corrupt) one compiled program.
 */
export function paintWashCacheKey(config: PaintWashConfig): string {
  return `paint-wash:${config.dir.join(',')}:${config.startDist}:${config.endDist}`;
}
