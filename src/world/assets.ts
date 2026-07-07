// Shared loader for file-based textures (the itomdev reference assets under
// public/textures + public/images — see public/textures/README.md for
// provenance). Session-cached; never dispose the returned textures.
import * as THREE from 'three';

const BASE = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
const cache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

/** Loads (and caches) a texture from public/, path relative to BASE_URL,
 * e.g. assetTexture('textures/corridor/wall_texture.webp'). Returns
 * immediately; the image streams in async. */
export function assetTexture(path: string): THREE.Texture {
  let tex = cache.get(path);
  if (!tex) {
    tex = loader.load(BASE + path);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    cache.set(path, tex);
  }
  return tex;
}

/** Same, but configured to tile (RepeatWrapping) with the given repeats. */
export function tiledAssetTexture(path: string, repeatX = 1, repeatY = 1): THREE.Texture {
  const key = `${path}|${repeatX}x${repeatY}`;
  let tex = cache.get(key);
  if (!tex) {
    tex = loader.load(BASE + path);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    cache.set(key, tex);
  }
  return tex;
}
