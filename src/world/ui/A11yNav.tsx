// Parallel accessible navigation for the 3D world (REPORT.md a11y notes).
// The R3F canvas is opaque to screen readers, so this renders a real,
// always-in-DOM skip link + nav landmark that lets keyboard/AT users jump
// straight to a room without touching the corridor-scroll mechanic.
//
// Visually hidden via the classic clip-rect "sr-only" pattern, kept as this
// component's own inline style object rather than depending on any global
// CSS class, so the module stays self-contained.

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RoomId } from '../types';
import { useWorldData, useWorldStore } from '../state/hooks';

export const WORLD_NAV_ID = 'world-navigation';

const SR_ONLY_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

// The skip link needs a :focus reveal, which an inline `style` prop can't
// express (no pseudo-classes). A small scoped <style> tag — same technique
// Cover.tsx already uses for @font-face — keeps this self-contained without
// any external stylesheet or CSP-unsafe resource.
const SKIP_LINK_CSS = `
.world-skip-link {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10000;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.world-skip-link:focus {
  width: auto;
  height: auto;
  padding: 0.75rem 1.25rem;
  margin: 0;
  overflow: visible;
  clip: auto;
  clip-path: none;
  white-space: normal;
  background: #f7f5ef;
  color: #2a2a2a;
  border: 2px solid #2a2a2a;
  border-radius: 4px;
  font-size: 1rem;
}
`;

/** Skip-link + visually-hidden nav landmark + aria-live room-change announcer. */
export function A11yNav(): JSX.Element {
  const { rooms } = useWorldData();
  const store = useWorldStore();
  const { currentRoom } = store;

  const [announcement, setAnnouncement] = useState('');
  const lastAnnounced = useRef<RoomId | null>(null);

  useEffect(() => {
    if (currentRoom === lastAnnounced.current) return;
    lastAnnounced.current = currentRoom;

    if (currentRoom === null) {
      setAnnouncement('');
      return;
    }

    const room = rooms.find((r) => r.id === currentRoom);
    setAnnouncement(`Entered ${room ? room.label : currentRoom} room`);
  }, [currentRoom, rooms]);

  return (
    <>
      <style>{SKIP_LINK_CSS}</style>

      <a href={`#${WORLD_NAV_ID}`} className="world-skip-link">
        Skip to world navigation
      </a>

      <nav id={WORLD_NAV_ID} role="navigation" aria-label="World navigation" style={SR_ONLY_STYLE}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rooms.map((room) => (
            <li key={room.id}>
              <button type="button" onClick={() => store.teleportTo(room.id)}>
                {`Go to ${room.label}`}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div role="status" aria-live="polite" style={SR_ONLY_STYLE}>
        {announcement}
      </div>
    </>
  );
}
