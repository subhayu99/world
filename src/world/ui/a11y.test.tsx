// TDD for A11yNav + SeoFallback. Both are plain DOM/React (no three, no R3F),
// so we mount them with react-dom directly into a detached container and
// assert on the real DOM — no WebGL/canvas involved.

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldData, WorldState } from '../types';
import type { WorldActions } from '../contracts';
import { WorldDataCtx, WorldStoreCtx } from '../state/hooks';
import { A11yNav } from './A11yNav';
import { SeoFallback } from './SeoFallback';

// react-dom's createRoot expects to run inside an "act environment"; flip the
// flag React checks for so updates in this file are batched/flushed
// synchronously without the "not configured to support act" warning noise.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fixtureData(): WorldData {
  return {
    meta: { name: 'Subhayu Bhattacharya', tagline: 'Data & Infrastructure Engineer', generatedAt: '2026-07-06' },
    rooms: [
      { id: 'journey', label: 'JOURNEY', hint: 'Scroll to fly through the journey' },
      { id: 'warehouse', label: 'WAREHOUSE', hint: 'Click a card to inspect the work' },
      { id: 'registry', label: 'REGISTRY', hint: 'Pick up a package' },
      { id: 'contact', label: 'CONTACT', hint: 'Find a way to reach me' },
    ],
    journey: {
      beats: [
        {
          id: 'college',
          date: '2018',
          title: 'B.Tech, Information Technology',
          body: 'Calcutta Institute of Engineering and Management, Kolkata.',
          kind: 'education',
        },
        {
          id: 'intern',
          date: 'Jan 2022',
          title: 'First production systems',
          body: 'Software Engineer Intern at FiftyFive Technologies.',
          kind: 'work',
          link: 'https://example.com/intern',
        },
      ],
      awards: [{ id: 'award-1', title: 'Top Contributor', issuer: 'PyPI', date: '2024', caption: 'For sqlstream.' }],
    },
    warehouse: {
      exhibits: [
        {
          id: 'cv-advisors',
          client: 'CV Advisors',
          title: 'Automated report pipeline',
          metric: '27.5h -> <5s',
          body: 'Rebuilt a manual reporting workflow into a scheduled pipeline.',
          tags: ['python', 'airflow'],
          date: '2023',
        },
      ],
    },
    registry: {
      headline: 'Open-source packages',
      parcels: [
        {
          id: 'sqlstream',
          name: 'sqlstream',
          pypiPackage: 'sqlstream',
          fallbackDownloads: '11.1k+',
          body: 'Stream SQL query results without loading them all into memory.',
          links: [
            { label: 'PyPI', url: 'https://pypi.org/project/sqlstream/' },
            { label: 'GitHub', url: 'https://github.com/subhayu99/sqlstream' },
          ],
        },
      ],
    },
    contact: {
      links: [
        { id: 'email', label: 'Email', url: 'mailto:balasubhayu99@gmail.com' },
        { id: 'github', label: 'GitHub', url: 'https://github.com/subhayu99' },
      ],
      form: { endpoint: '', accessKey: '', mailto: 'balasubhayu99@gmail.com' },
    },
    easterEggs: [],
  };
}

function makeStore(currentRoom: WorldState['currentRoom'], teleportTo = vi.fn()): WorldState & WorldActions {
  return {
    stage: 'room',
    currentRoom,
    teleport: { phase: null, target: null },
    visited: [],
    setStage: vi.fn(),
    enterRoom: vi.fn(),
    exitRoom: vi.fn(),
    teleportTo,
    advanceTeleport: vi.fn(),
  };
}

let container: HTMLDivElement;
let root: Root;
const data = fixtureData();

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function renderNav(store: WorldState & WorldActions) {
  act(() => {
    root.render(
      <WorldDataCtx.Provider value={data}>
        <WorldStoreCtx.Provider value={store}>
          <A11yNav />
        </WorldStoreCtx.Provider>
      </WorldDataCtx.Provider>,
    );
  });
}

function renderSeo() {
  act(() => {
    root.render(
      <WorldDataCtx.Provider value={data}>
        <SeoFallback />
      </WorldDataCtx.Provider>,
    );
  });
}

describe('A11yNav', () => {
  it('renders a "Go to <label>" button for every room, in room order', () => {
    renderNav(makeStore(null));
    const buttons = Array.from(container.querySelectorAll('nav[role="navigation"] button'));
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Go to JOURNEY',
      'Go to WAREHOUSE',
      'Go to REGISTRY',
      'Go to CONTACT',
    ]);
  });

  it('labels the nav with role=navigation and aria-label="World navigation"', () => {
    renderNav(makeStore(null));
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute('role')).toBe('navigation');
    expect(nav?.getAttribute('aria-label')).toBe('World navigation');
  });

  it('calls teleportTo with the target room id when its button is clicked', () => {
    const teleportTo = vi.fn();
    renderNav(makeStore('journey', teleportTo));

    const buttons = Array.from(container.querySelectorAll('nav button'));
    const warehouseButton = buttons.find((b) => b.textContent === 'Go to WAREHOUSE') as HTMLButtonElement;
    expect(warehouseButton).toBeDefined();

    act(() => {
      warehouseButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(teleportTo).toHaveBeenCalledTimes(1);
    expect(teleportTo).toHaveBeenCalledWith('warehouse');
  });

  it('renders a skip link whose href points at the nav\'s own id', () => {
    renderNav(makeStore(null));
    const link = container.querySelector('a') as HTMLAnchorElement;
    const nav = container.querySelector('nav') as HTMLElement;

    expect(link).not.toBeNull();
    expect(link.textContent).toBe('Skip to world navigation');
    expect(nav.id).toBeTruthy();
    expect(link.getAttribute('href')).toBe(`#${nav.id}`);
  });

  it('exposes an aria-live polite region that starts empty', () => {
    renderNav(makeStore(null));
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe('');
  });

  it('announces "Entered <room label> room" in the aria-live region when currentRoom changes', () => {
    renderNav(makeStore(null));
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('');

    renderNav(makeStore('warehouse'));
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('Entered WAREHOUSE room');

    renderNav(makeStore('journey'));
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('Entered JOURNEY room');
  });

  it('clears the announcement once currentRoom goes back to null', () => {
    renderNav(makeStore('registry'));
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('Entered REGISTRY room');

    renderNav(makeStore(null));
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('');
  });
});

describe('SeoFallback', () => {
  it('renders an h1 with the site name and the tagline as prose', () => {
    renderSeo();
    expect(container.querySelector('h1')?.textContent).toBe('Subhayu Bhattacharya');
    expect(container.textContent).toContain('Data & Infrastructure Engineer');
  });

  it('renders one h2 per room, in room order, using the room label', () => {
    renderSeo();
    const h2s = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(h2s).toEqual(['JOURNEY', 'WAREHOUSE', 'REGISTRY', 'CONTACT']);
  });

  it('renders journey beats as an ordered timeline list with real content', () => {
    renderSeo();
    const items = Array.from(container.querySelectorAll('ol li'));
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('2018');
    expect(items[0].textContent).toContain('B.Tech, Information Technology');
    expect(items[1].textContent).toContain('First production systems');
  });

  it('renders warehouse exhibits including their headline metric', () => {
    renderSeo();
    const text = container.textContent ?? '';
    expect(text).toContain('Automated report pipeline');
    expect(text).toContain('27.5h -> <5s');
  });

  it('renders registry parcels with real crawlable anchor links', () => {
    renderSeo();
    const anchors = Array.from(container.querySelectorAll('a'));
    const pypiLink = anchors.find((a) => a.getAttribute('href') === 'https://pypi.org/project/sqlstream/');
    expect(pypiLink).toBeDefined();
    expect(pypiLink?.tagName).toBe('A');
  });

  it('renders contact links as real anchors with working hrefs', () => {
    renderSeo();
    const anchors = Array.from(container.querySelectorAll('a'));
    const mailAnchor = anchors.find((a) => a.getAttribute('href') === 'mailto:balasubhayu99@gmail.com');
    const githubAnchor = anchors.find((a) => a.getAttribute('href') === 'https://github.com/subhayu99');
    expect(mailAnchor?.textContent).toBe('Email');
    expect(githubAnchor?.textContent).toBe('GitHub');
  });

  it('is visually hidden via the clip-rect pattern while remaining in the DOM', () => {
    renderSeo();
    const section = container.querySelector('section') as HTMLElement;
    expect(section).not.toBeNull();
    expect(section.style.position).toBe('absolute');
    expect(section.style.clip).toContain('rect(0');
    expect(section.style.width).toBe('1px');
    expect(section.style.height).toBe('1px');
  });
});
