// Bottom-center torn-paper toast: the active tutorial hint, with an empty
// checkbox by default. The achievements controller (state/achievements.tsx)
// already owns the "show the just-unlocked one, checked, for 3s, then swap
// to the next hint" timing — `current` briefly IS the unlocked achievement
// during that window, so this component only has to ask "is `current`
// already in `unlocked`?" to know whether to draw it checked.

import { useEffect, useState } from 'react';
import { BLUEPRINT } from '../blueprint/palette';
import { useAchievements } from '../state/hooks';
import { PANEL_DROP_SHADOW, PANEL_PAPER_BACKGROUND } from './progress';

// Pencil & pastel palette (BLUEPRINT, blueprint/palette.ts). Amber matches
// AchievementsPanel's own check color — this toast doubles as the "just
// unlocked" moment for that same achievement, so the two should read as one
// color story rather than two different accents for the same idea.
const INK = BLUEPRINT.ink;
const ACCENT = BLUEPRINT.accentWarm;

// Torn-all-around silhouette for the bottom toast (distinct from the
// drop-down panels' torn-bottom-only shape).
const TOAST_CLIP =
  'polygon(3% 8%, 10% 0%, 22% 6%, 34% 0%, 46% 6%, 58% 0%, 70% 6%, 82% 0%, 94% 7%, 100% 20%, 96% 50%, 100% 80%, 92% 94%, 80% 100%, 68% 94%, 56% 100%, 44% 94%, 32% 100%, 20% 94%, 8% 100%, 0% 82%, 4% 50%, 0% 22%)';

/** Drives the checkmark's stroke-dashoffset draw-in. Renders undrawn first,
 * then flips to drawn on the next frame so the CSS transition actually has
 * a "from" value to animate away from (a same-frame mount would skip the
 * transition entirely). */
function useDrawIn(active: boolean): boolean {
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (!active) {
      setDrawn(false);
      return;
    }
    setDrawn(false);
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return drawn;
}

export function QuestToast() {
  const { current, unlocked } = useAchievements();

  const isChecked = current !== null && unlocked.includes(current.id);
  const drawn = useDrawIn(isChecked);

  if (!current) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        // Registry is an endless vertical scroll — some box's front face
        // always sits somewhere in this fixed bottom band, so this toast
        // stays a slim hint chip (small footprint, tucked right at the
        // edge) rather than a plate wide/tall enough to cover a label or
        // download row wherever the scroll happens to settle.
        bottom: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '0.45rem',
        background: PANEL_PAPER_BACKGROUND,
        border: `1.5px solid ${INK}`,
        clipPath: TOAST_CLIP,
        filter: PANEL_DROP_SHADOW,
        padding: '0.5rem 1.1rem',
        color: INK,
        fontFamily: '"Patrick Hand", cursive',
        fontSize: '0.85rem',
        maxWidth: 'min(80vw, 320px)',
      }}
    >
      <svg width="17" height="17" viewBox="0 0 22 22" aria-hidden="true" style={{ flexShrink: 0 }}>
        <rect x={1.5} y={1.5} width={19} height={19} rx={2} fill="none" stroke={INK} strokeWidth={1.6} />
        <path
          d="M5 11.5l4 4.2L17 6.8"
          fill="none"
          stroke={ACCENT}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={isChecked && drawn ? 0 : 1}
          style={{ transition: 'stroke-dashoffset 0.4s ease-out' }}
        />
      </svg>
      <span>{current.label}</span>
    </div>
  );
}
