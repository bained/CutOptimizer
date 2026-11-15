// @ts-check
/**
 * "Optional" mode — free rectangles, mixed heights.
 *
 * Each part goes into the best-fitting free rectangle on any open sheet. A
 * placement splits its rectangle in two (right piece + below piece), which
 * keeps the plan guillotine-cuttable: cut across the height first, then across
 * the width.
 *
 * Why not fixed shelves: a shelf has ONE height, so a row of 356 mm parts wastes
 * the 44 mm above it, and a sheet holding only 300 mm parts wastes 1142 mm
 * vertically. Free rectangles fill those gaps.
 */
import { usableArea, fitsIn } from './geometry.js';

/** @typedef {{id:string,w:number,h:number,rotatable:boolean}} Piece */
/** @typedef {{id:string,x:number,y:number,w:number,h:number,rotated:boolean}} PlacedPart */
/** @typedef {{x:number,y:number,w:number,h:number}} FreeRect */
/** @typedef {{parts:PlacedPart[], free:FreeRect[], usedArea:number}} Sheet */

/**
 * Splits a free rectangle around a placed part.
 *
 * Two rectangles come out: one to the right of the part (full remaining height)
 * and one below it (limited to the part's width). Together they tile the
 * remainder of `free` exactly, which keeps the layout guillotine-compatible.
 *
 * @param {FreeRect} free
 * @param {PlacedPart} part
 * @param {number} kerf
 * @returns {FreeRect[]}
 */
export function splitFree(free, part, kerf) {
  /** @type {FreeRect[]} */
  const out = [];

  const rightX = part.x + part.w + kerf;
  const rightW = free.x + free.w - rightX;
  if (rightW > 0) out.push({ x: rightX, y: free.y, w: rightW, h: free.h });

  const belowY = part.y + part.h + kerf;
  const belowH = free.y + free.h - belowY;
  if (belowH > 0) out.push({ x: free.x, y: belowY, w: part.w, h: belowH });

  return out;
}


/**
 * Placement score; lower is better.
 * Prefers the snuggest rectangle, then the topmost and leftmost.
 *
 * @param {FreeRect} rect @param {number} w @param {number} h
 */
export function placementScore(rect, w, h) {
  const leftover = rect.w * rect.h - w * h;
  return leftover + rect.y * 0.01 + rect.x * 0.001;
}

/**
 * Allowed orientations for one part.
 *
 * @param {Piece} piece
 * @returns {{w:number,h:number,rotated:boolean}[]}
 */
/**
 * Allowed orientations for one part.
 *
 * `grained` enforces the material's grain direction: a grained board may not be
 * turned 90 degrees, because that would put the grain across the part. When the
 * sheet is grained EVERY part is locked, regardless of its own `rotatable` flag.
 *
 * @param {Piece} piece
 * @param {boolean} [grained]  true when the material has a grain direction
 * @returns {{w:number,h:number,rotated:boolean}[]}
 */
export function orientations(piece, grained = false) {
  // Only an explicit `false` locks the part; a missing flag means it may turn.
  if (grained || piece.rotatable === false || piece.w === piece.h) {
    return [{ w: piece.w, h: piece.h, rotated: false }];
  }
  return [
    { w: piece.w, h: piece.h, rotated: false },
    { w: piece.h, h: piece.w, rotated: true },
  ];
}


/**
 * Places one part in the best free rectangle of any sheet, or opens a new sheet
 * when it fits nowhere.
 *
 * @param {Sheet[]} sheets
 * @param {Piece} piece
 * @param {number} kerf
 * @param {number} maxW
 * @param {number} maxH
 * @param {boolean} [grained]  material has a grain direction, so no rotation
 * @returns {boolean} whether the part was placed
 */
export function placePart(sheets, piece, kerf, maxW, maxH, grained = false) {
  const orients = orientations(piece, grained);

  /** @type {{sheet:Sheet, rect:FreeRect, index:number, o:{w:number,h:number,rotated:boolean}, score:number} | null} */
  let best = null;

  for (const sheet of sheets) {
    for (let i = 0; i < sheet.free.length; i++) {
      const rect = sheet.free[i];
      for (const o of orients) {
        if (!fitsIn(rect, o.w, o.h)) continue;
        const score = placementScore(rect, o.w, o.h);
        if (best === null || score < best.score) {
          best = { sheet, rect, index: i, o, score };
        }
      }
    }
  }

  if (best === null) {
    // Fits nowhere: open a new sheet if the part fits an empty one.
    const o = orients.find((c) => c.w <= maxW && c.h <= maxH);
    if (!o) return false;

    const whole = /** @type {FreeRect} */ ({ x: 0, y: 0, w: maxW, h: maxH });
    const part = { id: piece.id, x: 0, y: 0, w: o.w, h: o.h, rotated: o.rotated };
    sheets.push({ parts: [part], free: splitFree(whole, part, kerf), usedArea: o.w * o.h });
    return true;
  }

  const part = {
    id: piece.id,
    x: best.rect.x,
    y: best.rect.y,
    w: best.o.w,
    h: best.o.h,
    rotated: best.o.rotated,
  };

  best.sheet.parts.push(part);
  best.sheet.usedArea += part.w * part.h;
  best.sheet.free.splice(best.index, 1);
  best.sheet.free.push(...splitFree(best.rect, part, kerf));

  return true;
}

/**
 * Packs with free rectangles (mixed heights allowed).
 *
 * @param {Piece[]} pieces
 * @param {import('./geometry.js').SheetGeometry} geom
 * @param {(a:Piece,b:Piece)=>number} [compare]
 * @returns {{sheets: any[], remaining: Piece[]}}
 */
export function packMixed(pieces, geom, compare) {
  const usable = usableArea(geom);
  const grained = geom.grained === true;
  const cmp =
    compare ?? ((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
  const sorted = pieces.slice().sort(cmp);

  /** @type {Sheet[]} */
  const sheets = [];
  /** @type {Piece[]} */
  const remaining = [];

  for (const piece of sorted) {
    if (!placePart(sheets, piece, geom.kerf, usable.w, usable.h, grained)) remaining.push(piece);
  }

  return {
    sheets: sheets.map((s) => ({
      parts: s.parts.map((p) => ({ ...p, x: p.x + usable.x, y: p.y + usable.y })),
      usedArea: s.usedArea,
      sheetArea: geom.width * geom.height,
    })),
    remaining,
  };
}

/** Orderings the "optional" mode tries. */
export const MIXED_ORDERS = [
  (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
  (a, b) => b.w * b.h - a.w * a.h,
  (a, b) => b.h - a.h || b.w - a.w,
  (a, b) => b.w - a.w || b.h - a.h,
  (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
];

/**
 * Tries several orderings and returns the best plan.
 *
 * @param {Piece[]} pieces
 * @param {import('./geometry.js').SheetGeometry} geom
 * @returns {{sheets: any[], remaining: Piece[]}}
 */
export function packMixedBest(pieces, geom) {
  /** @type {any[]} */
  let bestSheets = [];
  /** @type {Piece[]} */
  let bestRemaining = pieces.slice();
  let bestScore = Infinity;

  for (const cmp of MIXED_ORDERS) {
    const run = packMixed(pieces, geom, cmp);
    const score =
      run.sheets.length * 1e12 +
      run.remaining.length * 1e6 -
      run.sheets.reduce((s, x) => s + x.usedArea, 0) * 1e-3;
    if (score < bestScore) {
      bestScore = score;
      bestSheets = run.sheets;
      bestRemaining = run.remaining;
    }
  }

  return { sheets: bestSheets, remaining: bestRemaining };
}
