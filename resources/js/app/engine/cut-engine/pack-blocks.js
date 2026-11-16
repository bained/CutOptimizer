// @ts-check
/**
 * Block Guillotine Packing (Optimik-style).
 *
 * Places parts in 2D homogeneous blocks (C columns x R rows of the same part type
 * and orientation) using recursive 2-stage/3-stage guillotine cuts.
 *
 * Why blocks:
 *   1. Clean guillotine cuts for panel saws (straight longitudinal/cross cuts).
 *   2. Maximises density on initial sheets so that the final sheet keeps
 *      a SINGLE LARGE REUSABLE LEFTOVER (off-cut) instead of many thin slivers.
 */
import { usableArea } from './geometry.js';
import { verifySheet } from './verify.js';

/** @typedef {{id:string,w:number,h:number,rotatable?:boolean}} Piece */
/** @typedef {{id:string,x:number,y:number,w:number,h:number,rotated:boolean}} PlacedPart */
/** @typedef {import('./geometry.js').SheetGeometry} SheetGeometry */
/** @typedef {{x:number,y:number,w:number,h:number}} Rect */

/**
 * Allowed orientations for one part.
 *
 * @param {Piece} piece
 * @param {boolean} [grained]
 * @returns {{w:number,h:number,rotated:boolean}[]}
 */
export function orientations(piece, grained = false) {
  if (grained || piece.rotatable === false || piece.w === piece.h) {
    return [{ w: piece.w, h: piece.h, rotated: false }];
  }
  return [
    { w: piece.w, h: piece.h, rotated: false },
    { w: piece.h, h: piece.w, rotated: true },
  ];
}

/**
 * Packs a single sheet using recursive guillotine blocks.
 *
 * @param {{id:string,w:number,h:number,rotatable?:boolean}[]} types
 * @param {Map<string,number>} counts
 * @param {SheetGeometry} geom
 * @param {'auto'|'V'|'H'} [cutPreference]
 * @returns {{parts: PlacedPart[], usedArea: number, sheetArea: number, unusedRects: Rect[]}}
 */
export function packSheetBlocks(types, counts, geom, cutPreference = 'auto') {
  const k = geom.kerf;
  const usable = usableArea(geom);
  /** @type {PlacedPart[]} */
  const parts = [];
  /** @type {Rect[]} */
  const unusedRects = [];
  let usedArea = 0;

  /** @type {Rect[]} */
  let freeList = [{ x: usable.x, y: usable.y, w: usable.w, h: usable.h }];

  while (freeList.length > 0) {
    freeList.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
    const rect = freeList.shift();
    if (!rect || rect.w <= 0 || rect.h <= 0) continue;

    /** @type {{type:any, o:{w:number,h:number,rotated:boolean}, cols:number, rows:number, count:number, bw:number, bh:number, cut:'V'|'H'} | null} */
    let bestBlock = null;
    let bestScore = -Infinity;

    for (const t of types) {
      const avail = counts.get(t.id) ?? 0;
      if (avail <= 0) continue;

      for (const o of orientations(t, geom.grained)) {
        const maxCols = Math.floor((rect.w + k) / (o.w + k));
        const maxRows = Math.floor((rect.h + k) / (o.h + k));
        if (maxCols < 1 || maxRows < 1) continue;

        for (let r = 1; r <= maxRows; r++) {
          for (let c = 1; c <= maxCols; c++) {
            const count = r * c;
            if (count > avail) continue;

            const bw = c * o.w + (c - 1) * k;
            const bh = r * o.h + (r - 1) * k;
            const blockArea = count * o.w * o.h;

            const fitsW = Math.abs(rect.w - bw) <= k;
            const fitsH = Math.abs(rect.h - bh) <= k;

            /** @type {('V'|'H')[]} */
            const cutStyles =
              cutPreference === 'V'
                ? ['V']
                : cutPreference === 'H'
                ? ['H']
                : fitsH && !fitsW
                ? ['V']
                : fitsW && !fitsH
                ? ['H']
                : ['H', 'V'];

            for (const cut of cutStyles) {
              const sliceArea = cut === 'H' ? rect.w * bh : bw * rect.h;
              const sliceEff = blockArea / Math.max(sliceArea, 1);

              const exactFitBonus = (fitsW ? 1e6 : 0) + (fitsH ? 1e6 : 0);
              const score = blockArea * 10 + sliceEff * 1e5 + exactFitBonus;

              if (score > bestScore) {
                bestScore = score;
                bestBlock = { type: t, o, cols: c, rows: r, count, bw, bh, cut };
              }
            }
          }
        }
      }
    }

    if (!bestBlock) {

      unusedRects.push(rect);
      continue;
    }

    const o = bestBlock.o;
    for (let r = 0; r < bestBlock.rows; r++) {
      for (let c = 0; c < bestBlock.cols; c++) {
        const px = rect.x + c * (o.w + k);
        const py = rect.y + r * (o.h + k);
        parts.push({ id: bestBlock.type.id, x: px, y: py, w: o.w, h: o.h, rotated: o.rotated });
        usedArea += o.w * o.h;
      }
    }

    counts.set(bestBlock.type.id, (counts.get(bestBlock.type.id) ?? 0) - bestBlock.count);

    if (bestBlock.cut === 'V') {
      const below = { x: rect.x, y: rect.y + bestBlock.bh + k, w: bestBlock.bw, h: rect.h - bestBlock.bh - k };
      const right = { x: rect.x + bestBlock.bw + k, y: rect.y, w: rect.w - bestBlock.bw - k, h: rect.h };
      if (below.w > 0 && below.h > 0) freeList.push(below);
      if (right.w > 0 && right.h > 0) freeList.push(right);
    } else {
      const right = { x: rect.x + bestBlock.bw + k, y: rect.y, w: rect.w - bestBlock.bw - k, h: bestBlock.bh };
      const below = { x: rect.x, y: rect.y + bestBlock.bh + k, w: rect.w, h: rect.h - bestBlock.bh - k };
      if (right.w > 0 && right.h > 0) freeList.push(right);
      if (below.w > 0 && below.h > 0) freeList.push(below);
    }
  }

  return { parts, usedArea, unusedRects, sheetArea: geom.width * geom.height };
}

/**
 * Places all pieces using the block guillotine algorithm.
 * Tries 'auto', 'V', and 'H' cut preferences and keeps the best plan.
 *
 * @param {Piece[]} pieces
 * @param {SheetGeometry} geom
 * @param {'auto'|'V'|'H'} [mode]
 * @returns {any[]}
 */
export function packBlocksBest(pieces, geom, mode = 'auto') {
  /** @type {{id:string,w:number,h:number,rotatable?:boolean}[]} */
  const types = [];
  /** @type {Record<string, number>} */
  const countsObj = {};
  for (const p of pieces) {
    const key = `${p.id}|${p.w}x${p.h}`;
    if (!countsObj[key]) {
      countsObj[key] = 0;
      types.push({ id: key, w: p.w, h: p.h, rotatable: p.rotatable !== false });
    }
    countsObj[key]++;
  }

  /** @type {Map<string,string>} */
  const label = new Map();
  for (const p of pieces) label.set(`${p.id}|${p.w}x${p.h}`, p.id);

  /** @type {('auto'|'V'|'H')[]} */
  const modesToTry = mode === 'auto' ? ['auto', 'V', 'H'] : [mode];

  /** @type {any[]} */
  let best = [];
  let bestScore = Infinity;

  for (const m of modesToTry) {
    const counts = new Map(Object.entries(countsObj));
    /** @type {any[]} */
    const sheets = [];

    for (let s = 0; s < 500; s++) {
      const hasRemaining = [...counts.values()].some((c) => c > 0);
      if (!hasRemaining) break;

      const sheet = packSheetBlocks(types, counts, geom, m);
      if (sheet.parts.length === 0) break;
      sheets.push(sheet);
    }

    let valid = true;
    for (const sh of sheets) {
      if (verifySheet(sh, geom).length > 0) {
        valid = false;
        break;
      }
    }
    if (!valid || sheets.length === 0) continue;

    const lastSheet = sheets[sheets.length - 1];
    let maxLeftoverArea = 0;
    if (lastSheet && lastSheet.unusedRects) {
      for (const r of lastSheet.unusedRects) {
        if (r.w * r.h > maxLeftoverArea) maxLeftoverArea = r.w * r.h;
      }
    }

    const score =
      sheets.length * 1e12 -
      sheets.reduce((s, x) => s + x.usedArea, 0) * 1e-3 -
      maxLeftoverArea * 1e-6;

    if (score < bestScore) {
      bestScore = score;
      best = sheets;
    }
  }

  return best.map((s) => ({
    parts: s.parts.map((p) => ({ ...p, id: label.get(p.id) ?? p.id })),
    usedArea: s.usedArea,
    sheetArea: s.sheetArea,
    unusedRects: s.unusedRects,
  }));
}

