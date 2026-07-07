// Crawlable text fallback for the 3D world. Search engines (and any
// assistive tech that reaches it) get real prose and real <a href> anchors
// assembled straight from the same WorldData the 3D scene renders from —
// nothing here is decorative markup.
//
// Visually hidden via the classic clip-rect "sr-only" pattern, kept as this
// component's own inline style object rather than a global CSS class, so the
// module stays self-contained.

import type { CSSProperties, ReactNode } from 'react';
import type { Exhibit, JourneyBeat, Parcel, RoomCopy, RoomId, WorldData } from '../types';
import { useWorldData } from '../state/hooks';

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

function headingId(roomId: RoomId): string {
  return `seo-room-${roomId}-heading`;
}

function JourneyContent({ beats, awards }: WorldData['journey']): JSX.Element {
  return (
    <>
      <ol>
        {beats.map((beat: JourneyBeat) => (
          <li key={beat.id}>
            <time>{beat.date}</time>
            {': '}
            <strong>{beat.title}</strong>
            {' — '}
            <span>{beat.body}</span>
            {beat.link && (
              <>
                {' '}
                <a href={beat.link}>Read more</a>
              </>
            )}
          </li>
        ))}
      </ol>
      {awards.length > 0 && (
        <ul>
          {awards.map((award) => (
            <li key={award.id}>
              {award.title} — {award.issuer} ({award.date}). {award.caption}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function WarehouseContent({ exhibits }: WorldData['warehouse']): JSX.Element {
  return (
    <ul>
      {exhibits.map((exhibit: Exhibit) => (
        <li key={exhibit.id}>
          <strong>{exhibit.title}</strong> ({exhibit.client}) — {exhibit.metric}. {exhibit.body}
        </li>
      ))}
    </ul>
  );
}

function RegistryContent({ headline, parcels }: WorldData['registry']): JSX.Element {
  return (
    <>
      <p>{headline}</p>
      <ul>
        {parcels.map((parcel: Parcel) => (
          <li key={parcel.id}>
            <span>{parcel.name}</span>
            {': '}
            <span>{parcel.body}</span>
            {parcel.links.map((link) => (
              <a key={link.url} href={link.url}>
                {' '}
                {link.label}
              </a>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

function ContactContent({ links }: WorldData['contact']): JSX.Element {
  return (
    <ul>
      {links.map((link) => (
        <li key={link.id}>
          <a href={link.url}>{link.label}</a>
        </li>
      ))}
    </ul>
  );
}

function roomBody(room: RoomCopy, data: WorldData): ReactNode {
  switch (room.id) {
    case 'journey':
      return <JourneyContent {...data.journey} />;
    case 'warehouse':
      return <WarehouseContent {...data.warehouse} />;
    case 'registry':
      return <RegistryContent {...data.registry} />;
    case 'contact':
      return <ContactContent {...data.contact} />;
    default:
      return null;
  }
}

/** Visually-hidden, always-in-DOM prose article mirroring the 3D world's content. */
export function SeoFallback(): JSX.Element {
  const data = useWorldData();
  const { meta, rooms } = data;

  return (
    <section style={SR_ONLY_STYLE}>
      <article>
        <h1>{meta.name}</h1>
        <p>{meta.tagline}</p>

        {rooms.map((room) => (
          <section key={room.id} aria-labelledby={headingId(room.id)}>
            <h2 id={headingId(room.id)}>{room.label}</h2>
            {roomBody(room, data)}
          </section>
        ))}
      </article>
    </section>
  );
}
