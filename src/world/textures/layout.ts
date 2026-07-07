// Pure text measurement / wrapping math. No canvas access here — callers
// (factory.ts) build a CharWidthTable from real canvas font metrics via
// buildCharWidthTable, then everything below is deterministic arithmetic
// that's safe and fast to unit test without a DOM/canvas.

/** Per-character advance widths, in "font units" (i.e. at fontSize 1). */
export interface CharWidthTable {
  /** Width used for any character not present in `widths`. */
  default: number;
  widths?: Record<string, number>;
}

export function charWidth(ch: string, table: CharWidthTable): number {
  return table.widths?.[ch] ?? table.default;
}

/** Sums per-character widths, scaled by fontSize (default 1 = font-unit space). */
export function measureText(text: string, table: CharWidthTable, fontSize = 1): number {
  let width = 0;
  for (const ch of text) {
    width += charWidth(ch, table) * fontSize;
  }
  return width;
}

/**
 * Greedy word-wrap: fits as many words per line as possible under maxWidth,
 * collapsing whitespace runs to single spaces. A single word wider than
 * maxWidth is hard-broken across lines by character so it never silently
 * overflows.
 */
export function wrapText(text: string, maxWidth: number, table: CharWidthTable, fontSize = 1): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  const flush = (): void => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };

  for (const word of words) {
    if (measureText(word, table, fontSize) > maxWidth) {
      flush();
      let chunk = '';
      for (const ch of word) {
        const next = chunk + ch;
        if (chunk && measureText(next, table, fontSize) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      current = chunk;
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (current && measureText(candidate, table, fontSize) > maxWidth) {
      flush();
      current = word;
    } else {
      current = candidate;
    }
  }
  flush();
  return lines;
}

export interface TextLayoutOptions {
  /** Canvas/box width available for text, in font units at the given fontSize. */
  maxWidth: number;
  fontSize?: number;
  /** Multiplier of fontSize for line spacing. Default 1.2. */
  lineHeight?: number;
  /** Uniform padding added around the wrapped text block. Default 8. */
  padding?: number;
}

export interface TextLayoutResult {
  lines: string[];
  /** Recommended canvas/box width to fit the wrapped content (<= maxWidth). */
  width: number;
  /** Recommended canvas/box height to fit all lines. */
  height: number;
  /** Resolved line height (fontSize * lineHeight multiplier). */
  lineHeight: number;
}

/** Wraps text and computes the bounding box a canvas should be sized to. */
export function layoutText(text: string, table: CharWidthTable, opts: TextLayoutOptions): TextLayoutResult {
  const fontSize = opts.fontSize ?? 32;
  const lineHeight = (opts.lineHeight ?? 1.2) * fontSize;
  const padding = opts.padding ?? 8;
  const lines = wrapText(text, Math.max(1, opts.maxWidth - padding * 2), table, fontSize);

  const contentWidth = lines.reduce((max, line) => Math.max(max, measureText(line, table, fontSize)), 0);
  const width = Math.min(opts.maxWidth, contentWidth + padding * 2);
  const height = lines.length * lineHeight + padding * 2;

  return { lines, width, height, lineHeight };
}

// ---- auto-fit (shrink-then-wrap) ----
//
// Shared containment math behind textures/factory.ts's `card()` composer and
// `text()`'s optional `maxHeight` auto-shrink: given a box (maxWidth x
// maxHeight) and a *reference* font size the caller's CharWidthTable was
// measured at, try progressively smaller sizes (stepwise, capped) until the
// wrapped text fits; if even the smallest size still overflows, the block is
// clipped to as many lines as fit with an ellipsis on the last visible line.
// This is the fix for punchlist #1 ("text overlaps its own container") —
// every caller that adopts it gets a hard guarantee against overflow instead
// of a fixed font size that clips/bleeds for long strings.

export interface AutoFitOptions {
  /** Width available for text, in the same pixel units the table was measured in. */
  maxWidth: number;
  /** Height available for text. The result never holds more lines than fit
   * this budget — see `truncated` below for the one unavoidable exception. */
  maxHeight: number;
  /** The font size `table` was measured at — also the first (largest) size tried. */
  fontSize: number;
  /** Smallest size shrinking is allowed to reach. Default: fontSize * 0.55. */
  minFontSize?: number;
  /** Number of shrink steps tried between fontSize and minFontSize (in
   * addition to the initial full-size attempt). Default 3. */
  steps?: number;
  /** Line-spacing multiplier. Default 1.2. */
  lineHeightMultiplier?: number;
}

export interface AutoFitResult {
  /** The font size that was ultimately used. */
  fontSize: number;
  lines: string[];
  /** Resolved line height (fontSize * lineHeightMultiplier). */
  lineHeight: number;
  /** Widest line's pixel width at `fontSize`. */
  textWidth: number;
  /** lines.length * lineHeight. */
  textHeight: number;
  /** True only when the natural wrap at the resolved size already satisfied
   * maxHeight with no lines dropped. */
  fits: boolean;
  /** True when trailing lines had to be dropped (with an ellipsis appended
   * to the last kept line) to keep the block from growing past maxHeight
   * even at the smallest allowed font size. */
  truncated: boolean;
}

function ellipsizeLine(line: string, table: CharWidthTable, scale: number, maxWidth: number): string {
  const ellipsis = '…';
  let base = line.replace(/\s+$/, '');
  while (base.length > 0 && measureText(base + ellipsis, table, scale) > maxWidth) {
    base = base.slice(0, -1);
  }
  return base.length > 0 ? base + ellipsis : ellipsis;
}

/**
 * Shrinks `fontSize` stepwise (capped by `steps`/`minFontSize`) and re-wraps
 * at each candidate until the block fits `maxHeight`, keeping every line
 * within `maxWidth` throughout. `table` must have been built by measuring at
 * `opts.fontSize` — candidate sizes are tested by scaling those widths by
 * `candidate / opts.fontSize` (canvas font metrics scale ~linearly with
 * size), so no re-measurement against a real canvas is needed per step.
 *
 * If the smallest allowed size still produces more lines than fit
 * maxHeight, the block is clipped to `floor(maxHeight / lineHeight)` lines
 * (never fewer than 1, so there is always something to show) and the last
 * kept line gets an ellipsis. In the degenerate case where maxHeight is
 * smaller than a single line at minFontSize, the one returned line's height
 * still exceeds maxHeight — shrinking further would defeat legibility, so
 * this is a documented edge case rather than a silently-broken guarantee.
 */
export function autoFitText(text: string, table: CharWidthTable, opts: AutoFitOptions): AutoFitResult {
  const steps = Math.max(0, Math.floor(opts.steps ?? 3));
  const lineHeightMultiplier = opts.lineHeightMultiplier ?? 1.2;
  const refSize = opts.fontSize;
  const minFontSize = Math.max(1, Math.min(refSize, opts.minFontSize ?? refSize * 0.55));

  let attempt: AutoFitResult = {
    fontSize: refSize,
    lines: [],
    lineHeight: refSize * lineHeightMultiplier,
    textWidth: 0,
    textHeight: 0,
    fits: true,
    truncated: false,
  };

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const candidate = refSize - (refSize - minFontSize) * t;
    const scale = candidate / refSize;
    const lines = wrapText(text, opts.maxWidth, table, scale);
    const lineHeight = candidate * lineHeightMultiplier;
    const textWidth = lines.reduce((max, line) => Math.max(max, measureText(line, table, scale)), 0);
    const textHeight = lines.length * lineHeight;
    const fits = textHeight <= opts.maxHeight;

    attempt = { fontSize: candidate, lines, lineHeight, textWidth, textHeight, fits, truncated: false };
    if (fits) return attempt;
  }

  const maxLines = Math.max(1, Math.floor(opts.maxHeight / attempt.lineHeight));
  if (attempt.lines.length <= maxLines) return attempt;

  const scale = attempt.fontSize / refSize;
  const kept = attempt.lines.slice(0, maxLines);
  kept[kept.length - 1] = ellipsizeLine(kept[kept.length - 1], table, scale, opts.maxWidth);
  const textWidth = kept.reduce((max, line) => Math.max(max, measureText(line, table, scale)), 0);

  return {
    ...attempt,
    lines: kept,
    textWidth,
    textHeight: kept.length * attempt.lineHeight,
    truncated: true,
    fits: false,
  };
}

/**
 * Builds a CharWidthTable by measuring each distinct character in `text`
 * once via the supplied `measure` callback (e.g. `(ch) => ctx.measureText(ch).width`
 * from a real canvas context). Pure with respect to this module — the
 * side-effecting measurement lives entirely in the caller-supplied callback,
 * so this stays trivially testable with a fake measure function.
 */
export function buildCharWidthTable(chars: string, measure: (ch: string) => number, fallback = ' '): CharWidthTable {
  const widths: Record<string, number> = {};
  for (const ch of chars) {
    if (!(ch in widths)) {
      widths[ch] = measure(ch);
    }
  }
  const defaultWidth = fallback in widths ? widths[fallback] : measure(fallback);
  return { default: defaultWidth, widths };
}
