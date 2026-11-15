// @ts-check
/**
 * Multiple sheet formats in stock.
 *
 * A real workshop holds several sheet sizes at once ("three 2800x2070 and two
 * 2070x2070"). Picking which formats to consume is a small knapsack: the plan
 * must use no more of a format than is in stock, and should still waste as
 * little as possible.
 *
 * The engine solves each format on its own, then combines the per-format plans
 * by trying combinations and keeping the one with the best outcome:
 *
 *   1. fewest parts left unplaced,
 *   2. then fewest sheets consumed,
 *   3. then the most part area placed.
 *
 * A single-format job goes through exactly the same code path, so nothing that
 * worked before can change.
 */

/** @typedef {{width:number,height:number,kerf?:number,border?:number,grained?:boolean}} SheetGeometry */
/** @typedef {{width:number,height:number,qty?:number,id?:string}} FormatInput */

/**
 * @typedef {Object} SheetFormat
 * @property {string} id
 * @property {number} width
 * @property {number} height
 * @property {number} qty       how many sheets of this format are available
 * @property {number} area
 * @property {boolean} [unlimited]  true when the caller did not state a limit
 */

/**
 * Expands the input into individual sheet formats, dropping stock with no
 * available sheets.
 *
 * When `qty` is omitted the format is treated as UNLIMITED — a caller passing a
 * single `sheet` has no stock concept in mind and expects as many sheets as the
 * job needs.
 *
 * @param {FormatInput[]} input
 * @returns {SheetFormat[]}
 */
export function expandFormats(input) {
  /** @type {SheetFormat[]} */
  const out = [];
  for (const [i, f] of input.entries()) {
    const unlimited = f.qty === undefined;
    const qty = unlimited ? Infinity : Number(f.qty);
    if (!(qty > 0)) continue;
    const width = Number(f.width);
    const height = Number(f.height);
    const id = f.id === undefined || f.id === null || f.id === ''
      ? `format${i + 1}`
      : String(f.id);
    out.push({ id, width, height, qty, area: width * height, unlimited });
  }
  return out;
}

/**
 * Geometry for one format, keeping the job-wide cutting parameters.
 *
 * @param {SheetGeometry} job
 * @param {SheetFormat} format
 * @returns {SheetGeometry}
 */
export function geometryFor(job, format) {
  return {
    width: format.width,
    height: format.height,
    kerf: job.kerf === undefined ? 0 : job.kerf,
    border: job.border === undefined ? 0 : job.border,
    grained: job.grained === true,
  };
}

/**
 * Scores one plan. Lower is better.
 *
 * Fewest unplaced parts dominates: a plan that fits everything is always
 * preferred, even if it burns more sheets. Only then sheet count and placed
 * area decide.
 *
 * @param {{unplaced:number, sheets:number, placedArea:number}} p
 */
export function planScore(p) {
  return p.unplaced * 1e15 + p.sheets * 1e9 - p.placedArea * 1e-3;
}
