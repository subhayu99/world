// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load as parseYaml } from 'js-yaml';

import {
  loadResumeName,
  loadWorldYaml,
  buildWorldData,
  validateWorldData,
} from './generate-world.js';

const VALID_WORLD_YAML = `
meta:
  tagline: "Data & Infra Engineer"

rooms:
  - id: journey
    label: "JOURNEY"
    hint: "Scroll to fly through the journey"
  - id: warehouse
    label: "WAREHOUSE"
    hint: "Click a card to inspect the work"
  - id: registry
    label: "REGISTRY"
    hint: "Pick up a package"
  - id: contact
    label: "CONTACT"
    hint: "Find a way to reach me"

journey:
  beats:
    - id: beat1
      date: "2020"
      kind: work
      title: "Thing happened"
      body: "It happened, briefly."
  awards:
    - id: award1
      title: "Award"
      issuer: "Someone"
      date: "2020"
      caption: "Nice."

warehouse:
  exhibits:
    - id: ex1
      client: "Client"
      title: "Title"
      metric: "10x"
      body: "Body copy."
      tags: ["A"]
      date: "2020"

registry:
  headline: "Open source"
  parcels:
    - id: pkg1
      name: "Package"
      body: "Does a thing."
      links:
        - { label: "GitHub", url: "https://example.com" }

contact:
  links:
    - { id: email, label: "EMAIL", url: "mailto:test@example.com" }
  form:
    endpoint: ""
    accessKey: ""
    mailto: "test@example.com"

easterEggs:
  - id: rubberDuck
    lines: ["quack"]
`;

function freshWorldYamlObj() {
  return parseYaml(VALID_WORLD_YAML);
}

describe('generate-world: file loaders', () => {
  let dir;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'world-gen-test-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loadResumeName reads cv.name from resume.json (meta.name sourcing)', () => {
    const p = join(dir, 'resume.json');
    writeFileSync(p, JSON.stringify({ cv: { name: 'Test Person' } }));
    expect(loadResumeName(p)).toBe('Test Person');
  });

  it('loadResumeName throws loudly when resume.json is missing', () => {
    expect(() => loadResumeName(join(dir, 'does-not-exist.json'))).toThrow(/not found/i);
  });

  it('loadResumeName throws when cv.name is absent', () => {
    const p = join(dir, 'no-name.json');
    writeFileSync(p, JSON.stringify({ cv: {} }));
    expect(() => loadResumeName(p)).toThrow(/cv\.name/i);
  });

  it('loadResumeName throws on malformed JSON', () => {
    const p = join(dir, 'bad.json');
    writeFileSync(p, '{ this is not json');
    expect(() => loadResumeName(p)).toThrow();
  });

  it('loadWorldYaml parses a well-formed file', () => {
    const p = join(dir, 'world.yaml');
    writeFileSync(p, VALID_WORLD_YAML);
    const parsed = loadWorldYaml(p);
    expect(parsed.meta.tagline).toBe('Data & Infra Engineer');
    expect(parsed.rooms).toHaveLength(4);
  });

  it('loadWorldYaml throws loudly when the file is missing', () => {
    expect(() => loadWorldYaml(join(dir, 'missing.yaml'))).toThrow(/not found/i);
  });

  it('loadWorldYaml throws on malformed YAML', () => {
    const p = join(dir, 'bad.yaml');
    writeFileSync(p, 'meta: [unterminated');
    expect(() => loadWorldYaml(p)).toThrow();
  });
});

describe('generate-world: buildWorldData', () => {
  it('assembles WorldData verbatim from world.yaml, with meta.name sourced from resume.json', () => {
    const worldYaml = freshWorldYamlObj();
    const data = buildWorldData(worldYaml, 'Test Person', '2026-01-01T00:00:00.000Z');

    expect(data.meta).toEqual({
      name: 'Test Person',
      tagline: 'Data & Infra Engineer',
      generatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(data.rooms).toBe(worldYaml.rooms);
    expect(data.journey).toBe(worldYaml.journey);
    expect(data.warehouse).toBe(worldYaml.warehouse);
    expect(data.registry).toBe(worldYaml.registry);
    expect(data.contact).toBe(worldYaml.contact);
    expect(data.easterEggs).toBe(worldYaml.easterEggs);
  });

  it('throws when resume name is missing or blank', () => {
    const worldYaml = freshWorldYamlObj();
    expect(() => buildWorldData(worldYaml, '', '2026-01-01T00:00:00.000Z')).toThrow(/name/i);
    expect(() => buildWorldData(worldYaml, undefined, '2026-01-01T00:00:00.000Z')).toThrow(/name/i);
  });

  it('throws when world.yaml is missing meta.tagline', () => {
    const worldYaml = { ...freshWorldYamlObj(), meta: {} };
    expect(() => buildWorldData(worldYaml, 'Test Person', '2026-01-01T00:00:00.000Z')).toThrow(/tagline/i);
  });

  it('throws when world.yaml did not parse to an object', () => {
    expect(() => buildWorldData(null, 'Test Person', '2026-01-01T00:00:00.000Z')).toThrow();
    expect(() => buildWorldData('nope', 'Test Person', '2026-01-01T00:00:00.000Z')).toThrow();
  });
});

describe('generate-world: validateWorldData', () => {
  function buildValid() {
    return buildWorldData(freshWorldYamlObj(), 'Test Person', '2026-01-01T00:00:00.000Z');
  }

  it('passes on a well-formed document (happy path)', () => {
    expect(() => validateWorldData(buildValid())).not.toThrow();
  });

  it('fails loudly when a required RoomId is missing from rooms', () => {
    const data = buildValid();
    data.rooms = data.rooms.filter((r) => r.id !== 'contact');
    expect(() => validateWorldData(data)).toThrow(/contact/);
  });

  it('fails when a room is missing label/hint', () => {
    const data = buildValid();
    data.rooms = [...data.rooms];
    data.rooms[0] = { id: data.rooms[0].id };
    expect(() => validateWorldData(data)).toThrow(/label|hint/);
  });

  it('fails when a journey beat is missing a required field (id/date/title/body/kind)', () => {
    const data = buildValid();
    const beat = { ...data.journey.beats[0] };
    delete beat.kind;
    data.journey.beats = [beat];
    expect(() => validateWorldData(data)).toThrow(/kind/);
  });

  it('fails when a warehouse exhibit is missing metric', () => {
    const data = buildValid();
    const exhibit = { ...data.warehouse.exhibits[0] };
    delete exhibit.metric;
    data.warehouse.exhibits = [exhibit];
    expect(() => validateWorldData(data)).toThrow(/metric/);
  });

  it('fails when a registry parcel is missing name/body/links', () => {
    const data = buildValid();
    data.registry.parcels = [{ id: 'x' }];
    expect(() => validateWorldData(data)).toThrow(/name|body|links/);
  });

  it('fails when meta fields are missing', () => {
    const data = buildValid();
    data.meta = { name: '', tagline: '', generatedAt: '' };
    expect(() => validateWorldData(data)).toThrow(/meta/i);
  });

  it('fails when contact or easterEggs are malformed', () => {
    const data = buildValid();
    data.contact = {};
    data.easterEggs = 'not-an-array';
    expect(() => validateWorldData(data)).toThrow();
  });
});
