// The bottom toast on the entrance screen — the itomdev "EXPLORER" chip:
// tells the visitor to click the door, offers the audio toggle, and keeps a
// plain "open the notebook →" text button as the accessible/fallback entry
// (screen readers, and anyone who misses that the 3D door is clickable).

import { useState } from 'react';
import { useAudio } from '../state/hooks';

export interface EntranceToastProps {
  onOpen: () => void;
}

export function EntranceToast({ onOpen }: EntranceToastProps): JSX.Element {
  const audio = useAudio();
  const [muted, setMuted] = useState(audio.isMuted());

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '1.4rem',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.45rem',
        zIndex: 30,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          background: '#f7f5ef',
          color: '#3a3a38',
          padding: '0.55rem 1.2rem',
          fontFamily: '"Patrick Hand", "Caveat", cursive',
          fontSize: '0.98rem',
          textAlign: 'center',
          clipPath:
            'polygon(2% 8%, 10% 0%, 24% 6%, 40% 0%, 57% 5%, 74% 0%, 90% 6%, 99% 2%, 100% 90%, 88% 100%, 72% 94%, 55% 100%, 38% 95%, 20% 100%, 6% 94%, 0% 98%)',
          filter: 'drop-shadow(0 3px 8px rgba(50,48,42,0.22))',
        }}
      >
        <div style={{ letterSpacing: '0.14em', fontSize: '0.8rem', opacity: 0.7 }}>EXPLORER</div>
        <div>
          Click the door to enter. Audio is currently{' '}
          <button
            type="button"
            onClick={() => setMuted(audio.toggleMute())}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              color: muted ? '#c96f5f' : '#4f9d69',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            [{muted ? 'OFF' : 'ON'}]
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        style={{
          pointerEvents: 'auto',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: '"Caveat", cursive',
          fontSize: '1.02rem',
          color: 'rgba(74,74,72,0.75)',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        open the notebook →
      </button>
    </div>
  );
}

export default EntranceToast;
