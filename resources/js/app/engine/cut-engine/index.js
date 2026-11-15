// @ts-check
/**
 * Public API of the cutting engine.
 *
 * `solveCuttingPlan()` is the only entry point the host application should use.
 * It NEVER throws: an invalid input comes back as `{ ok: false, errors: [...] }`,
 * so a bad project can never bring the application down.
 */
import { solveJob } from './solve.js';
import { expandFormats } from './formats.js';
import { collectWaste } from './waste.js';
import { verifySheet, stats } from './verify.js';
import { usableArea } from './geometry.js';

/** @typedef {{id:string,w:number,h:number,qty:number,rotatable?:boolean}} PartInput */
/** @typedef {{id:string,w:number,h:number,rotatable:boolean}} PackedPart */
/** @typedef {{w:number,h:number,qty?:number,id?:string}} OffcutInput */
/** @typedef {{width:number,height:number,qty?:number,id?:string}} FormatInput */
/** @typedef {import('./waste.js').WasteLimits} WasteLimits */
/**
 * @typedef {Object} SolveOptions
 * @property {{width:number,height:number,kerf?:number,border?:number,grained?:boolean}} [sheet]
 * @property {{width:number,height:number,qty?:number,id?:string}[]} [sheets]  several formats in stock
 * @property {PartInput[]} parts
 * @property {'optional'|'alongLength'|'alongWidth'} [mode]
 * @property {OffcutInput[]} [offcuts]  leftover stock, consumed before new sheets
 * @property {WasteLimits} [waste]   what counts as reusable waste
 * @property {boolean} [verify]  re-check the finished plan (default true)
 */


/**
 * Validates and normalises the input. Never throws — returns a list of problems.
 *
 * @param {SolveOptions} options
 * @returns {{geom: import('./geometry.js').SheetGeometry | null, pieces: any[], errors: string[]}}
 */
function normalizeInput(options) {
  /** @type {string[]} */
  const errors = [];

  if (!options || typeof options !== 'object') {
    return { geom: null, pieces: [], errors: ['no input supplied'] };
  }

  // Sheet stock: one format (`sheet`) or several (`sheets`).
  //
  // Cutting parameters (kerf, border, grained) belong to the JOB: on a multi
  // format job they are read from the top level, with the first format as a
  // fallback so a single-format call keeps working unchanged.
  /** @type {any} */
  const sheet = options.sheet && typeof options.sheet === 'object' ? options.sheet : null;
  const firstFormat =
    Array.isArray(options.sheets) && options.sheets.length > 0 ? options.sheets[0] : null;

  if (!sheet && !firstFormat) {
    return { geom: null, pieces: [], errors: ['"sheet" or "sheets" is missing'] };
  }

  /** @param {string} key */
  const jobParam = (key) => {
    if (options[key] !== undefined) return options[key];
    if (sheet && sheet[key] !== undefined) return sheet[key];
    if (firstFormat && firstFormat[key] !== undefined) return firstFormat[key];
    return undefined;
  };

  // Size only matters for the single-format form; multi-format sizes live in
  // each entry of `sheets` and are validated separately.
  const width = sheet ? Number(sheet.width) : Number(firstFormat && firstFormat.width);
  const height = sheet ? Number(sheet.height) : Number(firstFormat && firstFormat.height);
  const kerf = jobParam('kerf') === undefined ? 0 : Number(jobParam('kerf'));
  const border = jobParam('border') === undefined ? 0 : Number(jobParam('border'));
  // A grained material locks every part against 90-degree rotation.
  const grained = jobParam('grained') === true;
  const hasFormats = Array.isArray(options.sheets) && options.sheets.length > 0;

  if (!hasFormats) {
    if (!Number.isFinite(width) || width <= 0) errors.push('sheet width is invalid');
    if (!Number.isFinite(height) || height <= 0) errors.push('sheet height is invalid');
  }
  if (!Number.isFinite(kerf) || kerf < 0) errors.push('kerf is invalid');
  if (!Number.isFinite(border) || border < 0) errors.push('border is invalid');
  if (!hasFormats && Number.isFinite(width) && Number.isFinite(border) && width <= 2 * border) {
    errors.push('border is wider than half the sheet');
  }
  if (!hasFormats && Number.isFinite(height) && Number.isFinite(border) && height <= 2 * border) {
    errors.push('border is wider than half the sheet');
  }

  const parts = Array.isArray(options.parts) ? options.parts : null;
  if (!parts) {
    errors.push('"parts" is missing or not an array');
    return { geom: null, pieces: [], errors };
  }

  /** @type {any[]} */
  const pieces = [];
  for (const [i, p] of parts.entries()) {
    if (!p || typeof p !== 'object') {
      errors.push(`part[${i}] is not an object`);
      continue;
    }
    const w = Number(p.w);
    const h = Number(p.h);
    const qty = p.qty === undefined ? 1 : Number(p.qty);

    if (!Number.isFinite(w) || w <= 0) {
      errors.push(`part[${i}] "${p.id ?? '?'}" has an invalid width`);
      continue;
    }
    if (!Number.isFinite(h) || h <= 0) {
      errors.push(`part[${i}] "${p.id ?? '?'}" has an invalid height`);
      continue;
    }
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
      errors.push(`part[${i}] "${p.id ?? '?'}" has an invalid quantity`);
      continue;
    }

    const id = p.id === undefined || p.id === null || p.id === '' ? `part${i + 1}` : String(p.id);
    const rotatable = p.rotatable !== false;

    for (let n = 0; n < qty; n++) pieces.push({ id, w, h, rotatable });
  }

  if (errors.length > 0) return { geom: null, pieces: [], errors };

  return { geom: { width, height, kerf, border, grained }, pieces, errors: [] };
}


/**
 * Validates the off-cut list. Bad entries are reported, not silently dropped.
 *
 * @param {any} raw
 * @param {string[]} errors
 * @returns {{w:number,h:number,qty:number,id?:string}[]}
 */
function normalizeOffcuts(raw, errors) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push('"offcuts" must be an array');
    return [];
  }

  /** @type {{w:number,h:number,qty:number,id?:string}[]} */
  const out = [];
  for (const [i, c] of raw.entries()) {
    if (!c || typeof c !== 'object') {
      errors.push(`offcut[${i}] is not an object`);
      continue;
    }
    const w = Number(c.w);
    const h = Number(c.h);
    const qty = c.qty === undefined ? 1 : Number(c.qty);

    if (!Number.isFinite(w) || w <= 0) {
      errors.push(`offcut[${i}] has an invalid width`);
      continue;
    }
    if (!Number.isFinite(h) || h <= 0) {
      errors.push(`offcut[${i}] has an invalid height`);
      continue;
    }
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
      errors.push(`offcut[${i}] has an invalid quantity`);
      continue;
    }
    if (qty === 0) continue;

    /** @type {{w:number,h:number,qty:number,id?:string}} */
    const entry = { w, h, qty };
    if (c.id !== undefined && c.id !== null && c.id !== '') entry.id = String(c.id);
    out.push(entry);
  }
  return out;
}

/**
 * Validates the format list. Bad entries are reported, not silently dropped.
 *
 * @param {any} raw
 * @param {string[]} errors
 * @returns {{width:number,height:number,qty:number,id?:string}[]}
 */
function normalizeFormats(raw, errors) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push('"sheets" must be an array');
    return [];
  }

  /** @type {{width:number,height:number,qty:number,id?:string}[]} */
  const out = [];
  for (const [i, f] of raw.entries()) {
    if (!f || typeof f !== 'object') {
      errors.push(`format[${i}] is not an object`);
      continue;
    }
    const width = Number(f.width);
    const height = Number(f.height);
    const qty = f.qty === undefined ? 1 : Number(f.qty);

    if (!Number.isFinite(width) || width <= 0) {
      errors.push(`format[${i}] has an invalid width`);
      continue;
    }
    if (!Number.isFinite(height) || height <= 0) {
      errors.push(`format[${i}] has an invalid height`);
      continue;
    }
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
      errors.push(`format[${i}] has an invalid quantity`);
      continue;
    }
    if (qty === 0) continue;

    /** @type {{width:number,height:number,qty:number,id?:string}} */
    const entry = { width, height, qty };
    if (f.id !== undefined && f.id !== null && f.id !== '') entry.id = String(f.id);
    out.push(entry);
  }
  return out;
}

/**
 * Computes a cutting plan.
 *
 * @param {SolveOptions} options
 * @returns {{
 *   ok: boolean,
 *   sheets: any[],
 *   stats: {sheets:number, pieces:number, usedArea:number, sheetArea:number, absoluteYield:number},
 *   errors: string[]
 * }}
 */
export function solveCuttingPlan(options) {
  const emptyStats = { sheets: 0, pieces: 0, usedArea: 0, sheetArea: 0, absoluteYield: 0 };

  try {
    const { geom, pieces, errors } = normalizeInput(options);
    const offcutErrors = [];
    const offcuts = normalizeOffcuts(options && options.offcuts, offcutErrors);
    const formatErrors = [];
    const formatsRaw = normalizeFormats(options && options.sheets, formatErrors);

    if (!geom || errors.length > 0 || offcutErrors.length > 0 || formatErrors.length > 0) {
      return {
        ok: false,
        sheets: [],
        offcutPlans: [],
        stats: emptyStats,
        errors: [...errors, ...offcutErrors, ...formatErrors],
      };
    }
    if (pieces.length === 0) {
      return { ok: true, sheets: [], offcutPlans: [], stats: emptyStats, errors: [] };
    }

    const mode =
      options.mode === 'alongLength' || options.mode === 'alongWidth' ? options.mode : 'optional';

    // Sheet stock: either the single `sheet` or the list in `sheets`.
    const formats = expandFormats(
      formatErrors.length === 0 && formatsRaw.length > 0
        ? formatsRaw
        : [{ width: geom.width, height: geom.height }],
    );

    const run = solveJob(pieces, geom, mode, offcuts, formats);
    const s = stats(run.sheets, geom);

    /** @type {string[]} */
    const planErrors = [];
    if (options.verify !== false) {
      // Parts whose rotation the caller locked, with the size they must keep:
      // a turned part is a plan error, not just a worse plan.
      /** @type {Map<string,{w:number,h:number}>} */
      const locked = new Map();
      for (const p of /** @type {PackedPart[]} */ (pieces)) {
        if (p.rotatable === false) locked.set(p.id, { w: p.w, h: p.h });
      }

      // Every sheet is checked against the format it was cut from.
      for (const sheet of run.sheets) {
        const box = {
          width: sheet.sheetWidth ?? geom.width,
          height: sheet.sheetHeight ?? geom.height,
          kerf: geom.kerf,
          border: geom.border,
        };
        planErrors.push(...verifySheet(sheet, box, locked));
      }
      // An off-cut is its own little sheet: verify the parts against its size.
      /** @type {Map<string, {w:number,h:number}>} */
      const sizes = new Map();
      for (const c of offcuts) {
        for (let n = 0; n < c.qty; n++) {
          const id = c.qty > 1 ? `${c.id ?? `offcut`}#${n + 1}` : c.id;
          sizes.set(id, { w: c.w, h: c.h });
        }
      }
      // Fall back to the recorded area when the id cannot be resolved.
      for (const plan of run.offcuts) {
        const size = sizes.get(plan.offcut);
        const box = size ?? {
          w: Math.max(...plan.parts.map((/** @type {any} */ p) => p.x + p.w), 0),
          h: Math.max(...plan.parts.map((/** @type {any} */ p) => p.y + p.h), 0),
        };
        planErrors.push(
          ...verifySheet(
            { parts: plan.parts, usedArea: plan.usedArea, sheetArea: box.w * box.h },
            { width: box.w, height: box.h, kerf: geom.kerf, border: 0 },
            locked,
          ),
        );
      }
    }

    // Parts left unplaced are an input problem, not an engine failure.
    const placedOnSheets = s.pieces;
    const placedOnOffcuts = run.offcuts.reduce(
      (n, plan) => n + plan.parts.length,
      0,
    );
    const placed = placedOnSheets + placedOnOffcuts;
    if (placed < pieces.length) {
      const missing = pieces.length - placed;

      // A part that would fit only after a 90-degree turn is trapped by its own
      // "do not rotate" flag. Say so, otherwise the message reads like the part
      // is simply too big and the user has no idea what to change.
      /** @type {Set<string>} */
      const turnedOnly = new Set();
      for (const p of /** @type {PackedPart[]} */ (pieces)) {
        if (p.rotatable !== false || p.w === p.h) continue;
        const flat = usableArea(geom);
        const fitsAsIs = p.w <= flat.w && p.h <= flat.h;
        const fitsTurned = p.h <= flat.w && p.w <= flat.h;
        if (!fitsAsIs && fitsTurned) turnedOnly.add(p.id);
      }

      planErrors.push(
        `${missing} of ${pieces.length} parts did not fit the sheet — ` +
          'check the part sizes against the sheet size',
      );
      if (turnedOnly.size > 0) {
        const ids = [...turnedOnly].slice(0, 3).join(', ');
        const more = turnedOnly.size > 3 ? ` and ${turnedOnly.size - 3} more` : '';
        planErrors.push(
          `${turnedOnly.size} part(s) fit only when turned 90 degrees but are marked ` +
            `"do not rotate": ${ids}${more}`,
        );
      }
    }

    // Waste is classified per leftover so the report can separate what is worth
    // keeping from what goes in the bin.
    const waste = collectWaste(run.sheets, geom, options.waste);

    // The relative yield counts usable leftovers as material won, which is the
    // fairer figure when comparing two plans that leave different amounts.
    const sheetArea = s.sheetArea;
    const relativeYield =
      sheetArea > 0 ? (s.usedArea + waste.usableArea) / sheetArea : 0;

    return {
      ok: planErrors.length === 0,
      sheets: run.sheets,
      offcutPlans: run.offcuts,
      waste,
      stats: {
        ...s,
        piecesPlaced: placed,
        piecesOnOffcuts: placedOnOffcuts,
        usableWasteArea: waste.usableArea,
        scrapArea: waste.scrapArea,
        relativeYield,
      },
      errors: planErrors,
    };
  } catch (err) {
    // The engine must never take the application down, even on an unexpected error.
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      sheets: [],
      offcutPlans: [],
      stats: emptyStats,
      errors: [`internal error: ${message}`],
    };
  }
}

export { verifySheet, stats } from './verify.js';
export { compareDirections } from './solve.js';
