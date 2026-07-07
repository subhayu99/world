// TDD: written before paintWash.ts. Pure logic + gsap-uniform-ref tests — no
// THREE/WebGL instantiation. `onBeforeCompile` here is typed against the
// frozen PaintWashHandle contract's minimal shader shape (contracts.ts), not
// THREE's own heavy WebGLProgramParametersWithUniforms — that's the whole
// point of the frozen shape: this module and its tests never need `three`.
import { afterEach, describe, expect, it } from 'vitest';
import gsap from 'gsap';
import type { PaintWashConfig } from '../contracts';
import { usePaintWashMaterialPatch } from './paintWash';

// A minified stand-in for the real MeshBasicMaterial vertex/fragment chunk
// order — just enough anchors for the patch to find.
const FAKE_FRAGMENT = `
uniform vec3 diffuse;
#include <common>
#include <map_pars_fragment>
void main() {
  vec4 diffuseColor = vec4(diffuse, 1.0);
  #include <map_fragment>
  #include <alphatest_fragment>
  #include <dithering_fragment>
}
`;
const FAKE_VERTEX = `
#include <common>
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
}
`;

function fakeShader() {
  return {
    uniforms: {} as Record<string, { value: unknown }>,
    fragmentShader: FAKE_FRAGMENT,
    vertexShader: FAKE_VERTEX,
  };
}

const GALLERY_CONFIG: PaintWashConfig = { dir: [-1, 0, 0], startDist: -5, endDist: 55 };

afterEach(() => {
  gsap.globalTimeline.clear();
});

describe('usePaintWashMaterialPatch', () => {
  it('patches both vertex and fragment shaders, declaring the world-position varying in both', () => {
    const handle = usePaintWashMaterialPatch(GALLERY_CONFIG);
    const shader = fakeShader();
    handle.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain('vWorldPosPaint');
    expect(shader.vertexShader).toContain('modelMatrix');
    expect(shader.fragmentShader).toContain('varying vec3 vWorldPosPaint');
    expect(shader.fragmentShader).toContain('uPaintProgress');
    expect(shader.fragmentShader).toContain('uRoomOrigin');
    expect(shader.fragmentShader).toContain('discard');
  });

  it('bakes the config direction/distances as GLSL literals in the fragment patch', () => {
    const handle = usePaintWashMaterialPatch(GALLERY_CONFIG);
    const shader = fakeShader();
    handle.onBeforeCompile(shader);
    expect(shader.fragmentShader).toMatch(/-1\.0/);
    expect(shader.fragmentShader).toMatch(/-5\.0/);
    expect(shader.fragmentShader).toMatch(/55\.0/);
  });

  it('adds a bluish wet-paint glow near the boundary', () => {
    const handle = usePaintWashMaterialPatch(GALLERY_CONFIG);
    const shader = fakeShader();
    handle.onBeforeCompile(shader);
    expect(shader.fragmentShader).toMatch(/gl_FragColor\.rgb\s*\+=/);
  });

  it('shares the uniforms object by reference so setRoomOrigin mutates the compiled shader uniform', () => {
    const handle = usePaintWashMaterialPatch(GALLERY_CONFIG);
    const shader = fakeShader();
    handle.onBeforeCompile(shader);
    expect(shader.uniforms.uRoomOrigin.value).toEqual([0, 0, 0]);
    handle.setRoomOrigin([1, 2, 3]);
    expect(shader.uniforms.uRoomOrigin.value).toEqual([1, 2, 3]);
  });

  it('animatePaint tweens the shared uPaintProgress uniform toward 1', () => {
    const handle = usePaintWashMaterialPatch(GALLERY_CONFIG);
    const shader = fakeShader();
    handle.onBeforeCompile(shader);
    expect(shader.uniforms.uPaintProgress.value).toBe(0);
    handle.animatePaint(0, 0.05);
    // Force the just-created tween on uPaintProgress to completion synchronously.
    gsap.getTweensOf(shader.uniforms.uPaintProgress).forEach((t) => t.progress(1));
    expect(shader.uniforms.uPaintProgress.value).toBeCloseTo(1);
  });

  it('resetPaint kills any in-flight tween and snaps uPaintProgress back to 0', () => {
    const handle = usePaintWashMaterialPatch(GALLERY_CONFIG);
    const shader = fakeShader();
    handle.onBeforeCompile(shader);
    handle.animatePaint(0, 5);
    handle.resetPaint();
    expect(shader.uniforms.uPaintProgress.value).toBe(0);
    expect(gsap.getTweensOf(shader.uniforms.uPaintProgress).length).toBe(0);
  });

  it('produces a distinct fragment patch per config (so a cache key derived from config would differ)', () => {
    const a = usePaintWashMaterialPatch({ dir: [-1, 0, 0], startDist: -5, endDist: 55 });
    const b = usePaintWashMaterialPatch({ dir: [0, -1, 0], startDist: -10, endDist: 10 });
    const shaderA = fakeShader();
    const shaderB = fakeShader();
    a.onBeforeCompile(shaderA);
    b.onBeforeCompile(shaderB);
    expect(shaderA.fragmentShader).not.toBe(shaderB.fragmentShader);
  });
});
