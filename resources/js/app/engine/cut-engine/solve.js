// @ts-check
/**
 * Mode selection and best-plan pick.
 *
 *   optional     — free rectangles OR strips along either axis, whichever
 *                  needs fewer sheets
 *   alongLength  — strips running along the sheet's length
 *   alongWidth   — strips running along the sheet's width
 *
 * Off-cut stock is consumed BEFORE any sheet: see `solveWithOffcuts()`.
 */
import { packMixedBest } from './pack-mixed.js';
import { packStripsPool } from './pack-strips.js';
import { packIntoOffcutsBest } from './pack-offcuts.js';
import { expandOffcuts } from './offcuts.js';
import { geometryFor, planScore } from './formats.js';
import { stats } from './verify.js';

/** @typedef {import('./geometry.js').SheetGeometry} SheetGeometry */
/** @typedef {import('./formats.js').SheetFormat} SheetFormat */
/** @typedef {{id:string,w:number,h:number,rotatable:boolean}} Piece */

/**
 * Picks the plan with the fewest sheets, then the most area used.
 *
 * @param {any[][]} candidates
 * @returns {any[]}
 */
function pickBest(candidates) {
  /** @type {any[]} */
  let best = [];
  let bestScore = Infinity;
  for (const sheets of candidates) {
    const score =
      sheets.length * 1e12 - sheets.reduce((s, x) => s + x.usedArea, 0) * 1e-3;
    if (score < bestScore) {
      bestScore = score;
      best = sheets;
    }
  }
  return best;
}


/**
 * Packs with the requested mode onto regular sheets only.
 *
 * @param {Piece[]} pieces
 * @param {SheetGeometry} geom
 * @param {'optional'|'alongLength'|'alongWidth'} [mode]
 * @returns {any[]}
 */
export function solve(pieces, geom, mode = 'optional') {
  if (mode === 'alongLength' || mode === 'alongWidth') {
    return packStripsPool(pieces, geom, mode);
  }

  // "Optional" allows any direction, so it may use both families of layouts.
  /** @type {any[][]} */
  const candidates = [];
  candidates.push(packMixedBest(pieces, geom).sheets);
  candidates.push(packStripsPool(pieces, geom, 'alongLength'));
  candidates.push(packStripsPool(pieces, geom, 'alongWidth'));

  return pickBest(candidates);
}

/**
 * Packs the job across several sheet formats, respecting available stock.
 *
 * Strategy: solve the whole job once per format to learn how many sheets that
 * format would need, then try every feasible combination of sheet counts and
 * keep the plan with the best outcome (fewest parts left over, then fewest
 * sheets, then most area placed). Finally the job is packed for real with the
 * winning combination: each format is offered in turn, the parts it cannot hold
 * move on to the next one.
 *
 * With one format this reduces to the plain single-format path, so existing
 * behaviour cannot change.
 *
 * @param {Piece[]} pieces
 * @param {SheetGeometry} job       job-wide cutting parameters
 * @param {'optional'|'alongLength'|'alongWidth'} [mode]
 * @param {SheetFormat[]} formats   available stock, already expanded
 * @returns {{sheets: any[], unplaced: Piece[], perFormat: {format:string, sheets:number}[], geomByFormat: Map<string, SheetGeometry>}}
 */
export function solveWithFormats(pieces, job, mode = 'optional', formats = []) {
  /** @type {Map<string, SheetGeometry>} */
  const geomByFormat = new Map(formats.map((f) => [f.id, geometryFor(job, f)]));

  if (formats.length === 0) {
    return { sheets: [], unplaced: pieces.slice(), perFormat: [], geomByFormat };
  }

  if (formats.length === 1) {
    const f = formats[0];
    const geom = /** @type {SheetGeometry} */ (geomByFormat.get(f.id));
    const all = solve(pieces, geom, mode);
    // No stated limit means "as many sheets as the job needs"; a stated limit
    // caps how much stock may be consumed.
    const sheets = f.unlimited ? all : all.slice(0, f.qty);
    const placed = sheets.reduce((n, s) => n + s.parts.length, 0);
    const unplaced = pieces.slice(placed);
    return {
      sheets: sheets.map((s) => withFormat(s, f)),
      unplaced,
      perFormat: sheets.length > 0 ? [{ format: f.id, sheets: sheets.length }] : [],
      geomByFormat,
    };
  }

  // How many sheets does each format need for this job on its own?
  /** @type {{format: SheetFormat, needed: number}[]} */
  const needs = formats.map((f) => {
    const geom = /** @type {SheetGeometry} */ (geomByFormat.get(f.id));
    const sheets = solve(pieces, geom, mode);
    return { format: f, needed: Math.min(sheets.length, f.qty) };
  });
  // Try every combination of "how many sheets of each format". The search is
  // bounded: a format never needs more sheets than the job has parts, and an
  // unlimited format is capped at what the job actually requires.
  /** @type {number[]} */
  let bestCounts = needs.map(() => 0);
  let bestScore = Infinity;
  let evaluated = 0;
  const EVAL_LIMIT = 4000;

  /** @param {number} idx @param {number[]} counts */
  const walk = (idx, counts) => {
    if (evaluated >= EVAL_LIMIT) return;
    if (idx === needs.length) {
      evaluated++;
      const trial = packByFormats(pieces, needs, counts, geomByFormat, mode);
      const score = planScore({
        unplaced: trial.unplaced.length,
        sheets: trial.sheets.length,
        placedArea: trial.sheets.reduce((s, sh) => s + sh.usedArea, 0),
      });
      if (score < bestScore) {
        bestScore = score;
        bestCounts = counts.slice();
      }
      return;
    }
    const cap = Math.min(needs[idx].needed, pieces.length);
    for (let n = 0; n <= cap; n++) {
      counts.push(n);
      walk(idx + 1, counts);
      counts.pop();
      if (evaluated >= EVAL_LIMIT) return;
    }
  };
  walk(0, []);

  const result = packByFormats(pieces, needs, bestCounts, geomByFormat, mode);
  return {
    sheets: result.sheets,
    unplaced: result.unplaced,
    perFormat: result.perFormat,
    geomByFormat,
  };
}

/**
 * Packs the job with an explicit number of sheets of each format.
 *
 * Formats are offered biggest-first: a large sheet swallows awkward parts that
 * a small one would push onto yet another sheet.
 *
 * @param {Piece[]} pieces
 * @param {{format: SheetFormat, needed: number}[]} needs
 * @param {number[]} counts          sheets to take from each format
 * @param {Map<string, SheetGeometry>} geomByFormat
 * @param {'optional'|'alongLength'|'alongWidth'} mode
 * @returns {{sheets: any[], unplaced: Piece[], perFormat: {format:string, sheets:number}[]}}
 */
function packByFormats(pieces, needs, counts, geomByFormat, mode) {
  /** @type {any[]} */
  const sheets = [];
  /** @type {{format:string, sheets:number}[]} */
  const perFormat = [];

  // Biggest sheet first, so the awkward parts land there.
  const order = needs
    .map((n, i) => ({ ...n, take: counts[i] ?? 0 }))
    .filter((n) => n.take > 0)
    .sort((a, b) => b.format.area - a.format.area);

  /** @type {Piece[]} */
  let todo = pieces.slice();

  for (const entry of order) {
    if (todo.length === 0) break;
    const geom = /** @type {SheetGeometry} */ (geomByFormat.get(entry.format.id));
    const packed = solve(todo, geom, mode);
    const used = packed.slice(0, entry.take);

    for (const sheet of used) sheets.push(withFormat(sheet, entry.format));
    perFormat.push({ format: entry.format.id, sheets: used.length });

    // Remove the parts this format managed to place.
    const placedHere = used.reduce((n, s) => n + s.parts.length, 0);
    todo = todo.slice(placedHere);
  }

  return { sheets, unplaced: todo, perFormat };
}

/**
 * Tags a packed sheet with the format it came from.
 *
 * @param {any} sheet
 * @param {SheetFormat} format
 */
function withFormat(sheet, format) {
  return { ...sheet, format: format.id, sheetWidth: format.width, sheetHeight: format.height };
}

/**
 * Packs the whole job: off-cut stock first, then the available sheet formats.
 *
 * Off-cuts are filled before any sheet is consumed. Whatever is left goes to
 * the sheet formats, which may be several different sizes.
 *
 * @param {Piece[]} pieces
 * @param {SheetGeometry} job
 * @param {'optional'|'alongLength'|'alongWidth'} [mode]
 * @param {{w:number,h:number,qty?:number,id?:string}[]} [offcuts]
 * @param {SheetFormat[]} [formats]   available sheet stock; empty means "no sheets"
 * @returns {{sheets: any[], offcuts: any[], remaining: Piece[], perFormat: {format:string,sheets:number}[]}}
 */
export function solveJob(pieces, job, mode = 'optional', offcuts = [], formats = []) {
  const expanded = expandOffcuts(offcuts);

  /** @type {Piece[]} */
  let todo = pieces.slice();
  /** @type {any[]} */
  let stocked = [];

  if (expanded.length > 0) {
    const stuffed = packIntoOffcutsBest(todo, expanded, job);
    stocked = stuffed.placements;
    todo = stuffed.remaining;
  }

  if (todo.length === 0) {
    return { sheets: [], offcuts: stocked, remaining: [], perFormat: [] };
  }

  const onSheets = solveWithFormats(todo, job, mode, formats);

  return {
    sheets: onSheets.sheets,
    offcuts: stocked,
    remaining: onSheets.unplaced,
    perFormat: onSheets.perFormat,
  };
}

/**
 * Packs the whole job, consuming off-cut stock before opening a new sheet.
 *
 * The off-cuts are filled first. Whatever is left over is then packed onto
 * regular sheets, so `sheets` only counts real, newly consumed material.
 *
 * @param {Piece[]} pieces
 * @param {SheetGeometry} geom
 * @param {'optional'|'alongLength'|'alongWidth'} [mode]
 * @param {{w:number,h:number,qty?:number,id?:string}[]} [offcuts]
 * @returns {{sheets: any[], offcuts: any[], remaining: Piece[]}}
 */
export function solveWithOffcuts(pieces, geom, mode = 'optional', offcuts = []) {
  const expanded = expandOffcuts(offcuts);

  if (expanded.length === 0) {
    return { sheets: solve(pieces, geom, mode), offcuts: [], remaining: [] };
  }

  const stuffed = packIntoOffcutsBest(pieces, expanded, geom);
  const sheets = stuffed.remaining.length > 0 ? solve(stuffed.remaining, geom, mode) : [];

  return {
    sheets,
    offcuts: stuffed.placements,
    remaining: stuffed.remaining.length > 0 && sheets.length === 0 ? stuffed.remaining : [],
  };
}

/**
 * Runs all three modes and returns each one with its statistics.
 *
 * @param {Piece[]} pieces
 * @param {SheetGeometry} geom
 */
export function compareDirections(pieces, geom) {
  /** @type {('optional'|'alongLength'|'alongWidth')[]} */
  const modes = ['optional', 'alongLength', 'alongWidth'];
  return modes.map((mode) => {
    const sheets = solve(pieces, geom, mode);
    return { mode, sheets, stats: stats(sheets, geom) };
  });
}


