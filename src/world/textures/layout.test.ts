import { describe, expect, it } from 'vitest';
import { autoFitText, buildCharWidthTable, charWidth, layoutText, measureText, wrapText } from './layout';
import type { CharWidthTable } from './layout';

// A simple monospace-like fake table: every char is 10 wide except 'i'/'l' at 4,
// and space at 6 — enough variance to prove per-char lookups work.
const table: CharWidthTable = {
  default: 10,
  widths: { ' ': 6, i: 4, l: 4 },
};

describe('charWidth', () => {
  it('returns the override width when present', () => {
    expect(charWidth('i', table)).toBe(4);
    expect(charWidth(' ', table)).toBe(6);
  });

  it('falls back to the default width for unlisted characters', () => {
    expect(charWidth('Q', table)).toBe(10);
  });
});

describe('measureText', () => {
  it('sums per-character widths', () => {
    // "hi" => h(10) + i(4) = 14
    expect(measureText('hi', table)).toBe(14);
  });

  it('scales by fontSize', () => {
    expect(measureText('hi', table, 2)).toBe(28);
  });

  it('measures an empty string as 0', () => {
    expect(measureText('', table)).toBe(0);
  });
});

describe('wrapText', () => {
  it('keeps short text on a single line', () => {
    // "hi" width 14, well under maxWidth
    expect(wrapText('hi there', 1000, table)).toEqual(['hi there']);
  });

  it('wraps onto multiple lines at word boundaries when exceeding maxWidth', () => {
    // words: "aa"(20) "bb"(20) "cc"(20), joined by single spaces (6 wide)
    // maxWidth 45 => "aa bb" = 20+6+20=46 > 45, so "aa" alone(20), then "bb cc" = 46 > 45 too
    const lines = wrapText('aa bb cc', 45, table);
    expect(lines).toEqual(['aa', 'bb', 'cc']);
  });

  it('fits as many words per line as possible', () => {
    // maxWidth generous enough for two words but not three
    // "aa bb" = 46, "aa bb cc" = 72
    const lines = wrapText('aa bb cc', 50, table);
    expect(lines).toEqual(['aa bb', 'cc']);
  });

  it('hard-breaks a single word longer than maxWidth', () => {
    // "aaaaaa" each char 10 wide = 60 total; maxWidth 25 => breaks every 2 chars (20 <= 25, 30 > 25)
    const lines = wrapText('aaaaaa', 25, table);
    expect(lines.join('')).toBe('aaaaaa');
    expect(lines.every((l) => measureText(l, table) <= 25)).toBe(true);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('returns an empty array for empty/whitespace-only text', () => {
    expect(wrapText('', 100, table)).toEqual([]);
    expect(wrapText('   ', 100, table)).toEqual([]);
  });

  it('collapses runs of whitespace between words', () => {
    expect(wrapText('aa    bb', 1000, table)).toEqual(['aa bb']);
  });
});

describe('buildCharWidthTable', () => {
  it('builds a table from a measure callback, memoizing repeated characters', () => {
    let calls = 0;
    const measure = (ch: string): number => {
      calls += 1;
      return ch === ' ' ? 3 : ch.charCodeAt(0) % 5 + 5;
    };
    const built = buildCharWidthTable('aabbc', measure);
    // a, b, c measured once each, plus one more for the default fallback (' ', not in the input)
    expect(calls).toBe(4);
    expect(built.widths?.a).toBe(measure('a'));
    expect(built.widths?.b).toBe(measure('b'));
  });

  it('uses the fallback character to derive the default width', () => {
    const measure = (ch: string): number => (ch === 'x' ? 42 : 1);
    const built = buildCharWidthTable('abc', measure, 'x');
    expect(built.default).toBe(42);
  });
});

describe('layoutText', () => {
  it('computes lines, a bounded width, and a height proportional to line count', () => {
    const result = layoutText('aa bb cc', table, { maxWidth: 60, fontSize: 1, lineHeight: 1.5, padding: 4 });
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.width).toBeLessThanOrEqual(60);
    expect(result.height).toBeCloseTo(result.lines.length * result.lineHeight + 4 * 2);
  });

  it('never exceeds the requested maxWidth', () => {
    const result = layoutText('aa bb cc dd ee', table, { maxWidth: 40 });
    for (const line of result.lines) {
      expect(measureText(line, table, 1)).toBeLessThanOrEqual(40);
    }
  });

  it('produces a single-line layout for short strings', () => {
    const result = layoutText('hi', table, { maxWidth: 500 });
    expect(result.lines).toEqual(['hi']);
  });
});

describe('autoFitText', () => {
  it('keeps the reference font size when the text comfortably fits', () => {
    const result = autoFitText('hi', table, { maxWidth: 1000, maxHeight: 1000, fontSize: 40 });
    expect(result.fontSize).toBe(40);
    expect(result.lines).toEqual(['hi']);
    expect(result.lineHeight).toBeCloseTo(48);
    expect(result.textWidth).toBeCloseTo(14);
    expect(result.fits).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it('shrinks stepwise until the wrapped block fits maxHeight', () => {
    // At fontSize 40 (scale 1), every word pair ("aa bb") measures 46 vs a
    // 45 maxWidth, so it wraps to 4 lines (192 tall) — too tall for a 150
    // budget. Shrinking one step (scale 5/6) narrows each word enough that
    // two words now fit per line, halving the line count to a fitting 80.
    const result = autoFitText('aa bb cc dd', table, {
      maxWidth: 45,
      maxHeight: 150,
      fontSize: 40,
      minFontSize: 20,
    });
    expect(result.fontSize).toBeCloseTo(33.333, 2);
    expect(result.lines).toEqual(['aa bb', 'cc dd']);
    expect(result.lineHeight).toBeCloseTo(40);
    expect(result.textHeight).toBeLessThanOrEqual(150);
    expect(result.fits).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it('never returns a line wider than maxWidth at the resolved font size', () => {
    const result = autoFitText('aa bb cc dd', table, {
      maxWidth: 45,
      maxHeight: 150,
      fontSize: 40,
      minFontSize: 20,
    });
    const scale = result.fontSize / 40;
    for (const line of result.lines) {
      expect(measureText(line, table, scale)).toBeLessThanOrEqual(45);
    }
  });

  it('defaults minFontSize to 55% of the reference size when not provided', () => {
    // A single unbroken word never wraps regardless of scale, so textHeight
    // is just one lineHeight — isolating exactly which candidate size wins.
    const result = autoFitText('aaaaaaaaaa', table, {
      maxWidth: 200,
      maxHeight: 30,
      fontSize: 40,
      steps: 1,
    });
    expect(result.fontSize).toBeCloseTo(40 * 0.55);
    expect(result.fits).toBe(true);
  });

  it('clips trailing lines with an ellipsis when even the minimum size overflows maxHeight', () => {
    const result = autoFitText('aa bb cc dd ee ff gg hh', table, {
      maxWidth: 45,
      maxHeight: 50,
      fontSize: 40,
      minFontSize: 20,
    });
    expect(result.fontSize).toBeCloseTo(20);
    expect(result.truncated).toBe(true);
    expect(result.fits).toBe(false);
    expect(result.lines).toEqual(['aa bb cc', 'dd ee ff…']);
    expect(result.lines[result.lines.length - 1].endsWith('…')).toBe(true);
    // The whole point of clipping: never more lines than the height budget allows.
    expect(result.lines.length).toBeLessThanOrEqual(Math.floor(50 / result.lineHeight));
  });

  it('still ellipsizes the sole kept line when steps is 0 (no shrinking attempted)', () => {
    const result = autoFitText('aa bb cc dd', table, {
      maxWidth: 45,
      maxHeight: 50,
      fontSize: 40,
      steps: 0,
    });
    expect(result.fontSize).toBe(40);
    expect(result.truncated).toBe(true);
    expect(result.lines).toEqual(['aa…']);
  });

  it('treats an empty string as already fitting, with no lines', () => {
    const result = autoFitText('', table, { maxWidth: 100, maxHeight: 100, fontSize: 40 });
    expect(result.lines).toEqual([]);
    expect(result.fits).toBe(true);
    expect(result.truncated).toBe(false);
  });
});
