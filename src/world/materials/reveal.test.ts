// TDD: written before reveal.ts. Uses the real `three` module for Material/Texture
// construction only (pure JS, no canvas/WebGL context is ever created) and manually
// invokes onBeforeCompile with a synthetic shader object — never a real renderer.
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import gsap from 'gsap';
import type { TexturePair } from '../contracts';
import { makeRevealMaterial, makeRevealPair } from './reveal';

// A minified stand-in for the real MeshBasicMaterial fragment/vertex chunk
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

function fakeShader(): THREE.WebGLProgramParametersWithUniforms {
  return {
    uniforms: {},
    fragmentShader: FAKE_FRAGMENT,
    vertexShader: FAKE_VERTEX,
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
}

const fakeRenderer = {} as unknown as THREE.WebGLRenderer;

afterEach(() => {
  gsap.globalTimeline.clear();
});

describe('makeRevealMaterial', () => {
  it('creates a transparent MeshBasicMaterial using the sketch map', () => {
    const map = new THREE.Texture();
    const { material } = makeRevealMaterial(THREE, { map });
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(material.transparent).toBe(true);
    expect(material.map).toBe(map);
  });

  it('patches only the fragment shader with the noise-mask discard test, leaving the vertex shader untouched', () => {
    const map = new THREE.Texture();
    const { material } = makeRevealMaterial(THREE, { map });
    const shader = fakeShader();
    material.onBeforeCompile(shader, fakeRenderer);
    expect(shader.fragmentShader).toContain('uProgress');
    expect(shader.fragmentShader).toContain('discard');
    expect(shader.fragmentShader).toContain('wnValueNoise');
    expect(shader.vertexShader).toBe(FAKE_VERTEX);
  });

  it('shares the uniforms object by reference so setProgress mutates the compiled shader uniform', () => {
    const map = new THREE.Texture();
    const { material, setProgress } = makeRevealMaterial(THREE, { map });
    const shader = fakeShader();
    material.onBeforeCompile(shader, fakeRenderer);
    expect(shader.uniforms.uProgress.value).toBe(0);
    setProgress(0.6);
    expect(shader.uniforms.uProgress.value).toBe(0.6);
  });

  it('tweenProgress animates the shared uniform toward the target value', () => {
    const map = new THREE.Texture();
    const { material, tweenProgress } = makeRevealMaterial(THREE, { map });
    const shader = fakeShader();
    material.onBeforeCompile(shader, fakeRenderer);
    const tween = tweenProgress(1, 0.05);
    tween.progress(1);
    expect(shader.uniforms.uProgress.value).toBeCloseTo(1);
  });

  it('stores the optional painted map on userData for consumers building the second mesh', () => {
    const map = new THREE.Texture();
    const mapPainted = new THREE.Texture();
    const { material } = makeRevealMaterial(THREE, { map, mapPainted });
    expect(material.userData.mapPainted).toBe(mapPainted);
  });

  it('assigns a stable customProgramCacheKey', () => {
    const map = new THREE.Texture();
    const { material } = makeRevealMaterial(THREE, { map });
    expect(typeof material.customProgramCacheKey).toBe('function');
    expect(typeof material.customProgramCacheKey()).toBe('string');
    expect(material.customProgramCacheKey().length).toBeGreaterThan(0);
  });
});

describe('makeRevealPair', () => {
  function texturePair(): TexturePair {
    return { sketch: new THREE.Texture(), painted: new THREE.Texture() };
  }

  it('builds a front sketch material and a hidden-by-default painted material behind it', () => {
    const pair = texturePair();
    const { sketchMaterial, paintedMaterial } = makeRevealPair(THREE, pair);
    expect(sketchMaterial.map).toBe(pair.sketch);
    expect(paintedMaterial.map).toBe(pair.painted);
    expect(paintedMaterial.transparent).toBe(true);
    expect(paintedMaterial.visible).toBe(false);
  });

  it('hoverIn makes the painted layer visible immediately and tweens progress toward 1', () => {
    const { sketchMaterial, paintedMaterial, hoverIn } = makeRevealPair(THREE, texturePair());
    const shader = fakeShader();
    sketchMaterial.onBeforeCompile(shader, fakeRenderer);
    hoverIn();
    expect(paintedMaterial.visible).toBe(true);
  });

  it('hoverOut keeps the painted layer visible immediately, then hides it after its delay', async () => {
    const { paintedMaterial, hoverIn, hoverOut } = makeRevealPair(THREE, texturePair());
    hoverIn();
    hoverOut();
    expect(paintedMaterial.visible).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(paintedMaterial.visible).toBe(false);
  });

  it('hoverIn cancels a pending hide scheduled by a previous hoverOut', async () => {
    const { paintedMaterial, hoverIn, hoverOut } = makeRevealPair(THREE, texturePair());
    hoverIn();
    hoverOut();
    hoverIn(); // re-entered before the 0.55s hide fired
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(paintedMaterial.visible).toBe(true);
  });
});
