// @ts-check
/**
 * Waste extraction and classification.
 *
 * After a plan is packed, the material left over on every sheet is what the
 * workshop actually keeps. Not all of it is worth keeping:
 *
 *   - `odrMin` is the narrowest strip that can still be lifted off the machine.
 *     A 15 mm sliver is waste in practice even though its area is not zero.
 *   - A leftover also has to be big enough to be useful for a future part; the
 *     caller states that with the minimum cut-off sizes (square, rectangle,
 *     strip).
 *
 * Everything above those limits counts as USABLE waste (a "cut-off" worth
 * putting back in the rack); everything else is SCRAP.
 *
 * The classification feeds `relativeYield`, which — unlike `absoluteYield` —
 * counts usable waste as material won rather than lost.
 */

/** @typedef {{x:number,y:number,w:number,h:number}} Rect */
/** @typedef {import('./geometry.js').SheetGeometry} SheetGeometry */

/**
 * @typedef {Object} WasteLimits
 * @property {number} [odrMin]        narrowest strip that can still be removed
 * @property {number} [minSquare]     minimum side of a usable square off-cut
 * @property {number} [minRectW]      minimum short side of a usable rectangle
 * @property {number} [minRectL]      minimum long side of a usable rectangle
 * @property {number} [minStripW]     minimum short side of a usable strip
 * @property {number} [minStripL]     minimum long side of a usable strip
 */

/**
 * @typedef {Object} WastePiece
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} area
 * @property {'usable'|'scrap'} kind
 * @property {'square'|'rectangle'|'strip'|'narrow'} reason
 */

/**
 * Normalises the waste limits, filling in sensible defaults.
 *
 * When the caller states nothing, nothing is discarded: every leftover is
 * usable. That keeps the old behaviour intact for callers who never set limits.
 *
 * An explicitly stated value is always kept as-is. Only missing values are
 * derived, and they fall back to the shape above them so the rules stay
 * monotonic (a strip rule is never stricter than a square rule unless the
 * caller says so).
 *
 * @param {WasteLimits | undefined} raw
 * @returns {Required<WasteLimits>}
 */
export function normalizeLimits(raw) {
  const num = (v, fallback) =>
    v === undefined || v === null || !Number.isFinite(Number(v)) || Number(v) < 0
      ? fallback
      : Number(v);

  const odrMin = num(raw && raw.odrMin, 0);
  const minSquare = num(raw && raw.minSquare, 0);
  const minRectW = num(raw && raw.minRectW, minSquare);
  const minRectL = num(raw && raw.minRectL, minRectW);
  // A strip rule is about LENGTH, not width: a narrow strip is exactly what a
  // strip off-cut is. So an unstated width falls back to zero (only odrMin
  // applies), never to the rectangle width.
  const minStripW = num(raw && raw.minStripW, 0);
  const minStripL = num(raw && raw.minStripL, Math.max(minRectL, 1));

  return { odrMin, minSquare, minRectW, minRectL, minStripW, minStripL };
}

/**
 * Classifies one leftover rectangle.
 *
 * A leftover is usable when it clears `odrMin` in BOTH directions (a piece
 * narrower than the blade clearance cannot be removed) and matches at least one
 * of the minimum off-cut shapes.
 *
 * @param {number} w
 * @param {number} h
 * @param {Required<WasteLimits>} limits
 * @returns {{kind:'usable'|'scrap', reason:'square'|'rectangle'|'strip'|'narrow'}}
 */
export function classifyWaste(w, h, limits) {
  const long = Math.max(w, h);
  const short = Math.min(w, h);

  // Too narrow to lift off the saw no matter how long it is.
  if (short < limits.odrMin) return { kind: 'scrap', reason: 'narrow' };

  if (short >= limits.minSquare && long >= limits.minSquare) {
    return { kind: 'usable', reason: 'square' };
  }
  if (short >= limits.minRectW && long >= limits.minRectL) {
    return { kind: 'usable', reason: 'rectangle' };
  }
  if (short >= limits.minStripW && long >= limits.minStripL) {
    return { kind: 'usable', reason: 'strip' };
  }

  return { kind: 'scrap', reason: 'narrow' };
}

/**
 * Rebuilds the leftover rectangles of one sheet.
 *
 * The packers emit final part positions but not their free space. Both packers
 * build the plan the same way — each placement splits a rectangle guillotine
 * style — so the leftovers can be reconstructed by walking that same split.
 *
 * This is exact rather than approximate: a free rectangle is reported only when
 * it is genuinely empty, and nothing is split across a part.
 *
 * @param {{parts:{id:string,x:number,y:number,w:number,h:number}[], sheetArea?:number}} sheet
 * @param {{x:number,y:number,w:number,h:number}} usable   usable area of the sheet
 * @param {number} kerf
 * @returns {Rect[]}
 */
export function freeRects(sheet, usable, kerf) {
  const parts = sheet.parts;

  /** @type {Rect[]} */
  const out = [];

  /**
   * Splits `rect` and reports the empty leaves.
   * @param {Rect} rect
   * @param {number} depth
   */
  const walk = (rect, depth) => {
    if (depth > 400) return;

    // The part whose top-left corner sits in this rectangle's corner.
    const inside = parts.filter(
      (p) =>
        p.x >= rect.x &&
        p.y >= rect.y &&
        p.x + p.w <= rect.x + rect.w &&
        p.y + p.h <= rect.y + rect.h,
    );

    if (inside.length === 0) {
      if (rect.w > 0 && rect.h > 0) out.push(rect);
      return;
    }

    // Pick the part closest to this rectangle's corner: that is the one the
    // packer placed here first.
    let head = inside[0];
    for (const p of inside) {
      const dHead = head.x - rect.x + (head.y - rect.y);
      const dP = p.x - rect.x + (p.y - rect.y);
      if (dP < dHead) head = p;
    }

    // Right piece: from the head's right edge to the end of the rectangle,
    // over the FULL height. This is the first guillotine cut.
    const rightX = head.x + head.w + kerf;
    const rightW = rect.x + rect.w - rightX;
    if (rightW > 0) walk({ x: rightX, y: rect.y, w: rightW, h: rect.h }, depth + 1);

    // Below piece: under the head, from the rectangle's left edge up to the
    // right piece (so the two never overlap). This is the second cut.
    const belowY = head.y + head.h + kerf;
    const belowH = rect.y + rect.h - belowY;
    const belowW = rightX - rect.x;
    if (belowH > 0 && belowW > 0) {
      walk({ x: rect.x, y: belowY, w: belowW, h: belowH }, depth + 1);
    }
  };

  walk({ x: usable.x, y: usable.y, w: usable.w, h: usable.h }, 0);

  return out.filter((r) => r.w > 0 && r.h > 0);
}

/**
 * Collects and classifies the waste of a whole plan.
 *
 * @param {any[]} sheets                     packed sheets (with their real sizes)
 * @param {import('./geometry.js').SheetGeometry} geom  job cutting parameters
 * @param {WasteLimits} [limits]
 * @returns {{
 *   perSheet: {sheet:number, format?:string, pieces:WastePiece[]}[],
 *   pieces: WastePiece[],
 *   usableArea: number,
 *   scrapArea: number,
 *   wasteArea: number
 * }}
 */
export function collectWaste(sheets, geom, limits) {
  const lim = normalizeLimits(limits);

  /** @type {{sheet:number, format?:string, pieces:WastePiece[]}[]} */
  const perSheet = [];
  /** @type {WastePiece[]} */
  const all = [];

  for (const [i, sheet] of sheets.entries()) {
    const width = sheet.sheetWidth ?? geom.width;
    const height = sheet.sheetHeight ?? geom.height;
    const usable = {
      x: geom.border,
      y: geom.border,
      w: width - 2 * geom.border,
      h: height - 2 * geom.border,
    };

    /** @type {WastePiece[]} */
    const pieces = freeRects(sheet, usable, geom.kerf).map((r) => {
      const c = classifyWaste(r.w, r.h, lim);
      return { x: r.x, y: r.y, w: r.w, h: r.h, area: r.w * r.h, kind: c.kind, reason: c.reason };
    });

    perSheet.push({ sheet: i + 1, format: sheet.format, pieces });
    all.push(...pieces);
  }

  const usableArea = all.filter((p) => p.kind === 'usable').reduce((s, p) => s + p.area, 0);
  const scrapArea = all.filter((p) => p.kind === 'scrap').reduce((s, p) => s + p.area, 0);

  return { perSheet, pieces: all, usableArea, scrapArea, wasteArea: usableArea + scrapArea };
}


