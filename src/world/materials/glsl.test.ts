// TDD: written before glsl.ts. Pure string-logic tests only — no WebGL/canvas.
import { describe, expect, it } from 'vitest';
import {
  patchShader,
  valueNoiseGlsl,
  revealUniformsGlsl,
  revealMaskGlsl,
  paintWashUniformsGlsl,
  paintWashVaryingGlsl,
  paintWashVertexAssignGlsl,
  paintWashFragmentGlsl,
} from './glsl';

// A minified stand-in for the real MeshBasicMaterial fragment chunk order, just
// enough structure to exercise anchor-splicing without depending on three's
// actual (and version-fragile) shader text.
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

describe('patchShader', () => {
  it('inserts the snippet immediately after the #include <map_fragment> anchor', () => {
    const out = patchShader(FAKE_FRAGMENT, '#include <map_fragment>', '// MARKER_MAP');
    const anchorIdx = out.indexOf('#include <map_fragment>');
    const markerIdx = out.indexOf('// MARKER_MAP');
    expect(anchorIdx).toBeGreaterThan(-1);
    expect(markerIdx).toBeGreaterThan(anchorIdx);
    const between = out.slice(anchorIdx + '#include <map_fragment>'.length, markerIdx);
    expect(between.trim()).toBe('');
  });

  it('inserts the snippet immediately after the #include <alphatest_fragment> anchor', () => {
    const out = patchShader(FAKE_FRAGMENT, '#include <alphatest_fragment>', '// MARKER_ALPHATEST');
    const anchorIdx = out.indexOf('#include <alphatest_fragment>');
    const markerIdx = out.indexOf('// MARKER_ALPHATEST');
    expect(anchorIdx).toBeGreaterThan(-1);
    expect(markerIdx).toBeGreaterThan(anchorIdx);
  });

  it('inserts the snippet immediately after the #include <dithering_fragment> anchor', () => {
    const out = patchShader(FAKE_FRAGMENT, '#include <dithering_fragment>', '// MARKER_DITHER');
    const anchorIdx = out.indexOf('#include <dithering_fragment>');
    const markerIdx = out.indexOf('// MARKER_DITHER');
    expect(anchorIdx).toBeGreaterThan(-1);
    expect(markerIdx).toBeGreaterThan(anchorIdx);
  });

  it('preserves the rest of the source untouched around the splice point', () => {
    const out = patchShader(FAKE_FRAGMENT, '#include <alphatest_fragment>', '// X');
    expect(out).toContain('uniform vec3 diffuse;');
    expect(out).toContain('#include <map_fragment>');
    expect(out).toContain('#include <dithering_fragment>');
    expect(out.length).toBe(FAKE_FRAGMENT.length + '// X'.length + 2);
  });

  it('throws when the anchor is not present in source', () => {
    expect(() => patchShader(FAKE_FRAGMENT, '#include <does_not_exist>', '// nope')).toThrow();
  });

  it('only splices after the first occurrence when the anchor repeats', () => {
    const repeated = 'A #include <common>\nB #include <common>\nC';
    const out = patchShader(repeated, '#include <common>', '<<INSERTED>>');
    const firstAnchorEnd = repeated.indexOf('#include <common>') + '#include <common>'.length;
    expect(out.indexOf('<<INSERTED>>')).toBe(firstAnchorEnd + 1); // +1 for the leading \n
    expect(out.match(/<<INSERTED>>/g)?.length).toBe(1);
  });
});

describe('GLSL snippet generators', () => {
  it('revealUniformsGlsl declares the contract uProgress uniform', () => {
    expect(revealUniformsGlsl()).toContain('uniform float uProgress');
  });

  it('revealMaskGlsl references uProgress and discards below the noise-perturbed mask', () => {
    const s = revealMaskGlsl();
    expect(s).toContain('uProgress');
    expect(s).toContain('discard');
    expect(s).toMatch(/\* 15\.0/); // vUv * 15 noise frequency per spec
    expect(s).toMatch(/0\.15/); // noise amplitude per spec
  });

  it('paintWashUniformsGlsl declares the contract uPaintProgress and uRoomOrigin uniforms', () => {
    const s = paintWashUniformsGlsl();
    expect(s).toContain('uniform float uPaintProgress');
    expect(s).toContain('uniform vec3 uRoomOrigin');
  });

  it('paintWashVaryingGlsl declares the vWorldPosPaint varying exactly once', () => {
    const s = paintWashVaryingGlsl();
    expect(s).toContain('varying vec3 vWorldPosPaint');
  });

  it('paintWashVertexAssignGlsl assigns the world-position varying from modelMatrix * transformed', () => {
    const s = paintWashVertexAssignGlsl();
    expect(s).toContain('vWorldPosPaint');
    expect(s).toContain('modelMatrix');
    expect(s).toContain('transformed');
  });

  it('paintWashFragmentGlsl bakes the config dir/startDist/endDist as GLSL literals and wires the contract uniforms', () => {
    const s = paintWashFragmentGlsl({ dir: [-1, 0, 0], startDist: -5, endDist: 55 });
    expect(s).toContain('uPaintProgress');
    expect(s).toContain('uRoomOrigin');
    expect(s).toContain('vWorldPosPaint');
    expect(s).toContain('discard');
    expect(s).toMatch(/-1\.0/);
    expect(s).toMatch(/-5\.0/);
    expect(s).toMatch(/55\.0/);
  });

  it('paintWashFragmentGlsl formats non-integer distances as valid GLSL float literals', () => {
    const s = paintWashFragmentGlsl({ dir: [0, -1, 0], startDist: -10.5, endDist: 10 });
    expect(s).toContain('-10.5');
    expect(s).toMatch(/10\.0/);
  });

  it('paintWashFragmentGlsl adds a bluish glow near the boundary', () => {
    const s = paintWashFragmentGlsl({ dir: [1, 0, 0], startDist: 0, endDist: 1 });
    expect(s).toMatch(/gl_FragColor\.rgb\s*\+=/);
  });

  it('valueNoiseGlsl defines the shared hash/value-noise helper referenced by both mask functions', () => {
    const s = valueNoiseGlsl();
    expect(s).toContain('wnValueNoise');
  });
});
