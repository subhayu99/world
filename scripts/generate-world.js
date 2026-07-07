#!/usr/bin/env node

/**
 * World-mode data generator
 *
 * Compiles world.yaml (repo root) + client/public/data/resume.json into
 * client/public/data/world.json, shaped exactly as the `WorldData` contract
 * in client/src/world/types.ts:
 *
 *   { meta, rooms, journey, warehouse, registry, contact, easterEggs }
 *
 * - meta.name    <- resume.json cv.name
 * - meta.tagline <- world.yaml meta.tagline
 * - meta.generatedAt <- ISO timestamp, generated at build time
 * - rooms/journey/warehouse/registry/contact/easterEggs <- world.yaml, verbatim
 *   (the YAML's shorthand keys already map 1:1 onto the WorldData shape)
 *
 * Usage:
 *   node scripts/generate-world.js          # validate + write world.json
 *   node scripts/generate-world.js --check  # validate only, no write
 *
 * Fails loudly (process.exit(1) + message) on a missing resume.json or a
 * malformed / incomplete world.yaml.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const REQUIRED_ROOM_IDS = ['journey', 'warehouse', 'registry', 'contact'];
const REQUIRED_BEAT_FIELDS = ['id', 'date', 'title', 'body', 'kind'];

// ---------------------------------------------------------------------------
// Loaders (I/O boundary — throw descriptive Errors, never process.exit here)
// ---------------------------------------------------------------------------

/**
 * Reads resume.json and returns cv.name.
 * @param {string} resumeJsonPath
 * @returns {string}
 */
export function loadResumeName(resumeJsonPath) {
  if (!existsSync(resumeJsonPath)) {
    throw new Error(
      `resume.json not found at ${resumeJsonPath}. Run the resume generation step first (npm run build, or generate-resume.js).`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resumeJsonPath, 'utf8'));
  } catch (err) {
    throw new Error(`resume.json at ${resumeJsonPath} is not valid JSON: ${err.message}`);
  }

  const name = parsed && parsed.cv && parsed.cv.name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`resume.json at ${resumeJsonPath} is missing cv.name`);
  }

  return name;
}

/**
 * Reads and parses world.yaml.
 * @param {string} worldYamlPath
 * @returns {Record<string, unknown>}
 */
export function loadWorldYaml(worldYamlPath) {
  if (!existsSync(worldYamlPath)) {
    throw new Error(`world.yaml not found at ${worldYamlPath}`);
  }

  let parsed;
  try {
    parsed = parseYaml(readFileSync(worldYamlPath, 'utf8'));
  } catch (err) {
    throw new Error(`world.yaml at ${worldYamlPath} failed to parse: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`world.yaml at ${worldYamlPath} did not parse to an object`);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Pure assembly + validation (unit-testable, no fs access)
// ---------------------------------------------------------------------------

/**
 * Assembles the WorldData object. world.yaml's rooms/journey/warehouse/
 * registry/contact/easterEggs are passed through verbatim; only `meta` is
 * synthesized (name from resume.json, tagline from world.yaml, generatedAt
 * from the caller).
 *
 * @param {Record<string, unknown>} worldYaml
 * @param {string} resumeName
 * @param {string} generatedAt ISO timestamp
 */
export function buildWorldData(worldYaml, resumeName, generatedAt) {
  if (!worldYaml || typeof worldYaml !== 'object' || Array.isArray(worldYaml)) {
    throw new Error('world.yaml did not parse to an object');
  }
  if (typeof resumeName !== 'string' || !resumeName.trim()) {
    throw new Error('resume name is required to build meta.name (resume.json cv.name)');
  }

  const meta = worldYaml.meta;
  if (!meta || typeof meta.tagline !== 'string' || !meta.tagline.trim()) {
    throw new Error('world.yaml meta.tagline is required (string)');
  }
  if (typeof generatedAt !== 'string' || !generatedAt.trim()) {
    throw new Error('generatedAt is required (ISO timestamp string)');
  }

  return {
    meta: {
      name: resumeName,
      tagline: meta.tagline,
      generatedAt,
    },
    rooms: worldYaml.rooms,
    journey: worldYaml.journey,
    warehouse: worldYaml.warehouse,
    registry: worldYaml.registry,
    contact: worldYaml.contact,
    easterEggs: worldYaml.easterEggs,
  };
}

/**
 * Validates the assembled WorldData against the shape the engine expects.
 * Throws a single Error whose message lists every problem found (fail loud,
 * fail once).
 *
 * @param {Record<string, unknown>} data
 */
export function validateWorldData(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    throw new Error('world.json data is not an object');
  }

  // meta
  const meta = data.meta;
  if (!meta || typeof meta !== 'object') {
    errors.push('meta is missing');
  } else {
    if (typeof meta.name !== 'string' || !meta.name.trim()) errors.push('meta.name is missing');
    if (typeof meta.tagline !== 'string' || !meta.tagline.trim()) errors.push('meta.tagline is missing');
    if (typeof meta.generatedAt !== 'string' || !meta.generatedAt.trim()) errors.push('meta.generatedAt is missing');
  }

  // rooms: all 4 RoomIds present, each with label + hint
  const rooms = Array.isArray(data.rooms) ? data.rooms : null;
  if (!rooms) {
    errors.push('rooms is missing or not an array');
  } else {
    const roomIds = new Set(rooms.map((r) => r && r.id));
    for (const id of REQUIRED_ROOM_IDS) {
      if (!roomIds.has(id)) errors.push(`rooms is missing required room id "${id}"`);
    }
    rooms.forEach((r, i) => {
      if (!r || typeof r.label !== 'string' || !r.label.trim()) errors.push(`rooms[${i}] missing "label"`);
      if (!r || typeof r.hint !== 'string' || !r.hint.trim()) errors.push(`rooms[${i}] missing "hint"`);
    });
  }

  // journey.beats: every beat has id/date/title/body/kind
  const journey = data.journey;
  const beats = journey && Array.isArray(journey.beats) ? journey.beats : null;
  if (!beats) {
    errors.push('journey.beats is missing or not an array');
  } else {
    beats.forEach((b, i) => {
      for (const field of REQUIRED_BEAT_FIELDS) {
        if (!b || typeof b[field] !== 'string' || !b[field].trim()) {
          errors.push(`journey.beats[${i}] missing "${field}"`);
        }
      }
    });
  }
  if (!journey || !Array.isArray(journey.awards)) {
    errors.push('journey.awards is missing or not an array');
  }

  // warehouse.exhibits: every exhibit has metric
  const warehouse = data.warehouse;
  const exhibits = warehouse && Array.isArray(warehouse.exhibits) ? warehouse.exhibits : null;
  if (!exhibits) {
    errors.push('warehouse.exhibits is missing or not an array');
  } else {
    exhibits.forEach((e, i) => {
      if (!e || typeof e.metric !== 'string' || !e.metric.trim()) {
        errors.push(`warehouse.exhibits[${i}] missing "metric"`);
      }
    });
  }

  // registry.parcels: every parcel has name + body + links
  const registry = data.registry;
  const parcels = registry && Array.isArray(registry.parcels) ? registry.parcels : null;
  if (!parcels) {
    errors.push('registry.parcels is missing or not an array');
  } else {
    parcels.forEach((p, i) => {
      if (!p || typeof p.name !== 'string' || !p.name.trim()) errors.push(`registry.parcels[${i}] missing "name"`);
      if (!p || typeof p.body !== 'string' || !p.body.trim()) errors.push(`registry.parcels[${i}] missing "body"`);
      if (!p || !Array.isArray(p.links) || p.links.length === 0) errors.push(`registry.parcels[${i}] missing "links"`);
    });
  }
  if (!registry || typeof registry.headline !== 'string' || !registry.headline.trim()) {
    errors.push('registry.headline is missing');
  }

  // contact
  const contact = data.contact;
  if (!contact || !Array.isArray(contact.links)) {
    errors.push('contact.links is missing or not an array');
  }
  if (!contact || !contact.form || typeof contact.form.mailto !== 'string' || !contact.form.mailto.trim()) {
    errors.push('contact.form.mailto is missing');
  }

  // easterEggs
  if (!Array.isArray(data.easterEggs)) {
    errors.push('easterEggs is missing or not an array');
  }

  if (errors.length) {
    throw new Error(`world.json validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const checkOnly = process.argv.slice(2).includes('--check');

  const resumeJsonPath = join(rootDir, 'public/data/resume.json');
  const worldYamlPath = join(rootDir, 'world.yaml');
  const outDir = join(rootDir, 'public/data');
  const outPath = join(outDir, 'world.json');

  const resumeName = loadResumeName(resumeJsonPath);
  const worldYaml = loadWorldYaml(worldYamlPath);
  const generatedAt = new Date().toISOString();

  const worldData = buildWorldData(worldYaml, resumeName, generatedAt);
  validateWorldData(worldData);

  if (checkOnly) {
    console.log('[world] OK — world.yaml + resume.json validate cleanly (--check, no write)');
    return;
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(worldData, null, 2)}\n`, 'utf8');
  console.log(`[world] Wrote ${outPath}`);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(`[world] ${err.message}`);
    process.exit(1);
  });
}
