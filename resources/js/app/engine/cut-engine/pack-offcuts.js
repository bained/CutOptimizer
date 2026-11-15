// @ts-check
/**
 * Packing into off-cut stock.
 *
 * Each off-cut is opened as a pseudo-sheet of its own size. Parts are then
 * placed into the off-cuts exactly as they would go onto real sheets: best-fit
 * into the tightest free rectangle, split guillotine-style, kerf respected.
 *
 * Anything that does not fit an off-cut is handed back to the caller, which
 * packs it onto regular sheets. That ordering matters: leftovers are consumed
 * first, so new sheet is only opened when the stock cannot help.
 */
import { splitFree, placementScore, orientations } from './pack-mixed.js';
import { sortOffcutsSmallestFirst, offcutCanHoldAnything } from './offcuts.js';

/** @typedef {{id:string,w:number,h:number,rotatable:boolean}} Piece */
/** @typedef {{id:string,w:number,h:number}} Offcut */
/** @typedef {{parts:any[], free:any[], usedArea:number}} OffcutSheet */

/**
 * Packs as many parts as possible into the available off-cuts.
 *
 * @param {Piece[]} pieces
 * @param {Offcut[]} offcuts
 * @param {{kerf:number, grained?:boolean}} geom
 * @param {(a:Piece,b:Piece)=>number} [compare]
 * @returns {{placements: {offcut:string, parts:any[], usedArea:number, offcutArea:number}[], remaining: Piece[]}}
 */
export function packIntoOffcuts(pieces, offcuts, geom, compare) {
  const kerf = geom.kerf;
  const grained = geom.grained === true;
  const cmp =
    compare ?? ((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);

  const sortedPieces = pieces.slice().sort(cmp);
  const usableOffcuts = sortOffcutsSmallestFirst(
    offcuts.filter((c) => offcutCanHoldAnything(c, sortedPieces, grained)),
  );

  /** @type {OffcutSheet & {id:string}} */
  const open = usableOffcuts.map((c) => ({
    id: c.id,
    parts: [],
    free: [{ x: 0, y: 0, w: c.w, h: c.h }],
    usedArea: 0,
  }));

  /** @type {Piece[]} */
  const remaining = [];

  for (const piece of sortedPieces) {
    const orients = orientations(piece, grained);

    /** @type {{sheet: any, rect:any, index:number, o:any, score:number} | null} */
    let best = null;

    for (const sheet of open) {
      for (let i = 0; i < sheet.free.length; i++) {
        const rect = sheet.free[i];
        for (const o of orients) {
          if (o.w > rect.w || o.h > rect.h) continue;
          const score = placementScore(rect, o.w, o.h);
          if (best === null || score < best.score) {
            best = { sheet, rect, index: i, o, score };
          }
        }
      }
    }

    if (best === null) {
      // Does not fit any leftover — the caller puts it on a new sheet.
      remaining.push(piece);
      continue;
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
  }

  // Only off-cuts that actually received something are reported as used.
  // Coordinates here are off-cut local; the caller offsets if needed.
  /** @type {Map<string, {w:number,h:number}>} */
  const sizeOf = new Map(offcuts.map((c) => [c.id, { w: c.w, h: c.h }]));

  return {
    placements: open
      .filter((s) => s.parts.length > 0)
      .map((s) => ({
        offcut: s.id,
        parts: s.parts.map((p) => ({ ...p, offcut: s.id })),
        usedArea: s.usedArea,
        offcutArea: (sizeOf.get(s.id)?.w ?? 0) * (sizeOf.get(s.id)?.h ?? 0),
      })),
    remaining,
  };
}

/**
 * Tries several part orderings and keeps the off-cut packing that consumes the
 * most material from stock.
 *
 * @param {Piece[]} pieces
 * @param {Offcut[]} offcuts
 * @param {{kerf:number, grained?:boolean}} geom
 * @returns {{placements: any[], remaining: Piece[]}}
 */
export function packIntoOffcutsBest(pieces, offcuts, geom) {
  /** @type {((a:Piece,b:Piece)=>number)[]} */
  const orders = [
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
    (a, b) => b.w * b.h - a.w * a.h,
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h,
  ];

  /** @type {{placements: any[], remaining: Piece[]}} */
  let best = { placements: [], remaining: pieces.slice() };
  let bestScore = -Infinity;

  for (const cmp of orders) {
    const run = packIntoOffcuts(pieces, offcuts, geom, cmp);
    // More area taken from stock is better; among equals, fewer parts left.
    const stocked = run.placements.reduce((s, p) => s + p.usedArea, 0);
    const score = stocked * 1e3 - run.remaining.length;
    if (score > bestScore) {
      bestScore = score;
      best = run;
    }
  }

  return best;
}
