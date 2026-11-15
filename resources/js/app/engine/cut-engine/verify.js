// @ts-check
/**
 * Plan verification — the guard that stops the engine from returning an
 * unusable cutting plan.
 *
 * Checked here:
 *   1. every part lies fully inside the usable area (the border is respected);
 *   2. no two parts overlap;
 *   3. neighbouring parts are at least `kerf` apart;
 *   4. every part has positive dimensions;
 *   5. a part whose rotation is locked was not turned (when the caller says
 *      which parts are locked).
 */

/** @typedef {import('./geometry.js').SheetGeometry} SheetGeometry */
/** @typedef {{id:string,x:number,y:number,w:number,h:number,rotated?:boolean}} PlacedPart */
/** @typedef {{parts:PlacedPart[], usedArea:number, sheetArea:number}} PackedSheet */

const EPS = 1e-9;

/**
 * Returns a list of problems. An empty list means the plan is valid.
 *
 * `locked` maps a part id to the size it must keep: an entry
 * `{ 'Door #3': { w: 600, h: 400 } }` means that part may never appear as
 * 400 x 600. Pass nothing when rotation is not constrained.
 *
 * @param {PackedSheet} sheet
 * @param {SheetGeometry} geom
 * @param {Map<string,{w:number,h:number}>} [locked]
 * @returns {string[]}
 */
export function verifySheet(sheet, geom, locked) {
  /** @type {string[]} */
  const errors = [];
  const { width, height, kerf, border } = geom;

  for (const p of sheet.parts) {
    const label = `part "${p.id}"`;
    if (!(p.w > 0) || !(p.h > 0)) errors.push(`${label} has a non-positive size`);
    if (p.x < border - EPS || p.y < border - EPS) {
      errors.push(`${label} starts inside the border`);
    }
    if (p.x + p.w > width - border + EPS || p.y + p.h > height - border + EPS) {
      errors.push(`${label} extends past the usable area`);
    }
    if (locked) {
      const must = locked.get(p.id);
      if (must && p.rotated) {
        errors.push(`${label} is marked "do not rotate" but was turned ${p.w}x${p.h}`);
      } else if (must && (Math.abs(p.w - must.w) > EPS || Math.abs(p.h - must.h) > EPS)) {
        errors.push(
          `${label} is marked "do not rotate" but is ${p.w}x${p.h} instead of ${must.w}x${must.h}`,
        );
      }
    }
  }

  for (let i = 0; i < sheet.parts.length; i++) {
    for (let j = i + 1; j < sheet.parts.length; j++) {
      const a = sheet.parts[i];
      const b = sheet.parts[j];

      const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
      const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
      if (overlapX && overlapY) {
        errors.push(`part "${a.id}" overlaps part "${b.id}"`);
        continue;
      }
      if (kerf <= 0) continue;

      const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      if (overlapY && gapX < kerf - EPS) {
        errors.push(`parts "${a.id}" and "${b.id}" are closer than kerf along X`);
      } else if (overlapX && gapY < kerf - EPS) {
        errors.push(`parts "${a.id}" and "${b.id}" are closer than kerf along Y`);
      }
    }
  }

  return errors;
}

/**
 * Statistics for a whole plan.
 *
 * `absoluteYield` is the share of the consumed sheet area that ends up as parts
 * — the headline figure a cutting plan is judged by.
 *
 * Each sheet may come from a different format, so the sheet area is summed from
 * the sheets themselves when they carry their own size.
 *
 * @param {PackedSheet[]} sheets
 * @param {SheetGeometry} geom   fallback size for sheets with no `sheetArea`
 */
export function stats(sheets, geom) {
  const fallbackArea = geom.width * geom.height;
  const used = sheets.reduce((s, sh) => s + sh.usedArea, 0);
  const totalSheet = sheets.reduce(
    (s, sh) => s + (sh.sheetArea > 0 ? sh.sheetArea : fallbackArea),
    0,
  );
  return {
    sheets: sheets.length,
    pieces: sheets.reduce((n, sh) => n + sh.parts.length, 0),
    usedArea: used,
    sheetArea: totalSheet,
    absoluteYield: totalSheet > 0 ? used / totalSheet : 0,
  };
}

