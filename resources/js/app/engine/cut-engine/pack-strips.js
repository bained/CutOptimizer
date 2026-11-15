// @ts-check
/**
 * Length-wise and width-wise modes — strips filled with runs.
 *
 * The layout is a two-stage guillotine cut:
 *
 *   - the sheet is cut into STRIPS that span one full axis;
 *   - a strip has ONE thickness, but may hold parts of different lengths;
 *   - a strip is filled with RUNS of a single part type — `k x part` side by
 *     side, or a `rows x cols` block (12 parts as 3 x 4 inside one strip);
 *   - strips differ in thickness from each other (356 next to 300 next to 800).
 *
 * Why runs and not part-by-part: what sits next to what inside a strip is a
 * decision for the WHOLE sheet. A part-by-part packer spends a strip's
 * thickness before it has seen the remaining parts and leaves unusable tails of
 * 132-960 mm. Here an entire strip is planned at once and then frozen.
 *
 * `bed` scoring is what makes this work: it measures part area against the
 * thickness the strip consumes, so a block of short parts that fills the length
 * but wastes its own thickness scores lower than a well-matched strip.
 */


/** @typedef {{id:string,w:number,h:number,rotatable?:boolean}} Piece */
/** @typedef {{id:string,x:number,y:number,w:number,h:number,rotated:boolean}} PlacedPart */
/** @typedef {import('./geometry.js').SheetGeometry} SheetGeometry */

/**
 * @typedef {Object} Axes
 * @property {boolean} horizontal  strips run left-to-right
 * @property {number} innerW
 * @property {number} innerH
 * @property {number} span        strip length
 * @property {number} stack       space for the strip thicknesses
 * @property {number} kerf
 * @property {number} border
 */

/**
 * Coordinate frame for one strip direction.
 *
 * @param {SheetGeometry} geom
 * @param {'alongLength'|'alongWidth'} mode
 * @returns {Axes}
 */
export function stripAxes(geom, mode) {
  const { border, kerf } = geom;
  const innerW = geom.width - 2 * border;
  const innerH = geom.height - 2 * border;
  const horizontal = mode === 'alongLength';
  return {
    horizontal,
    innerW,
    innerH,
    span: horizontal ? innerW : innerH,
    stack: horizontal ? innerH : innerW,
    kerf,
    border,
  };
}

/** Part extent along the strip. @param {Axes} ax @param {{w:number,h:number}} o */
export const alongOf = (ax, o) => (ax.horizontal ? o.w : o.h);

/** Part extent across the strip, i.e. its thickness. @param {Axes} ax @param {{w:number,h:number}} o */
export const acrossOf = (ax, o) => (ax.horizontal ? o.h : o.w);

/** Strip-local position -> sheet coordinates. @param {Axes} ax @param {number} along @param {number} stack */
const toSheet = (ax, along, stack) =>
  ax.horizontal
    ? { x: ax.border + along, y: ax.border + stack }
    : { x: ax.border + stack, y: ax.border + along };


/**
 * Score a candidate strip; higher is better.
 *
 *   density : part area / strip length actually used
 *             — how tightly the strip's length is packed.
 *   bed     : part area / (strip thickness x full span)
 *             — the yield the strip really buys for the bed it consumes. A 2-D
 *             block of short parts can fill the length yet leave its own
 *             thickness half empty, and only this score notices.
 *   cover   : `bed` x how much of the span is filled
 *             — penalises strips that stop halfway down the sheet.
 *
 * `density` alone is a trap: it prefers a row of short parts that fills the
 * length while wasting the strip's thickness. On the reference task `density`
 * needs 4 sheets where `bed` needs 3, so `bed` is the default.
 *
 * @param {'density'|'bed'|'cover'} strategy
 * @param {{cols:number,rows:number,o:{w:number,h:number}}[]} runs
 * @param {number} thickness
 * @param {number} used      strip length actually filled
 * @param {number} span      full strip length
 * @param {number} kerf
 */
export function scoreStrip(strategy, runs, thickness, used, span, kerf) {
  const area = runs.reduce((s, r) => s + r.cols * r.rows * r.o.w * r.o.h, 0);
  const bed = area / ((thickness + kerf) * span);
  const cover = Math.min(1, used / span);
  if (strategy === 'bed') return bed;
  if (strategy === 'cover') return bed * cover;
  return area / Math.max(used, 1);
}

/**
 * Allowed orientations for one part, thickest-first.
 *
 * `grained` enforces the material's grain direction: on a grained board no part
 * may be turned 90 degrees, so every part is locked regardless of its own
 * `rotatable` flag.
 *
 * @param {Piece} piece
 * @param {Axes} ax
 * @param {boolean} [grained]
 * @returns {{w:number,h:number,rotated:boolean}[]}
 */
export function orientationsOf(piece, ax, grained = false) {
  /** @type {{w:number,h:number,rotated:boolean}[]} */
  const list = [{ w: piece.w, h: piece.h, rotated: false }];
  if (!grained && piece.rotatable !== false && piece.w !== piece.h) {
    list.push({ w: piece.h, h: piece.w, rotated: true });
  }
  return list.sort((a, b) => acrossOf(ax, b) - acrossOf(ax, a));
}

/**
 * Best run of one part type in the space `length x thickness`.
 *
 * The run is either `cols x part` side by side, or a `rows x cols` block. The
 * block keeps ONE thickness, so the strip stays a band and the block itself is
 * two-stage guillotine cuttable (cut into rows, then each row into parts).
 *
 * @param {{w:number,h:number,rotated:boolean}} o
 * @param {number} thickness   strip thickness
 * @param {number} length      space left along the strip
 * @param {number} limit       how many copies are still available
 * @param {Axes} ax
 * @returns {{cols:number, rows:number, length:number, count:number, area:number}}
 */
export function bestRun(o, thickness, length, limit, ax) {
  const k = ax.kerf;
  const along = alongOf(ax, o);
  const across = acrossOf(ax, o);
  /** @type {{cols:number, rows:number, length:number, count:number, area:number}} */
  let best = { cols: 0, rows: 1, length: 0, count: 0, area: 0 };
  if (limit <= 0 || along > length || across > thickness) return best;

  const colsFit = Math.floor((length + k) / (along + k));
  const rowsFit = Math.floor((thickness + k) / (across + k));

  for (let rows = 1; rows <= Math.max(1, rowsFit); rows++) {
    if (colsFit < 1) break;
    const count = Math.min(colsFit * rows, limit);
    const useCols = Math.min(colsFit, Math.ceil(count / rows));
    if (useCols < 1) continue;
    const runLength = useCols * along + (useCols - 1) * k;
    if (runLength > length) continue;
    const area = Math.min(useCols * rows, count) * o.w * o.h;
    if (area > best.area) {
      best = { cols: useCols, rows, length: runLength, count: Math.min(useCols * rows, count), area };
    }
  }
  return best;
}


/**
 * Fill one strip of a given thickness with runs, best-first.
 *
 * At each step every still-available part type is scored, and the run that wins
 * the most area per unit of consumed thickness is appended. The whole strip is
 * decided here before it is committed, so nothing later can disturb it.
 *
 * @param {{piece:{id:string,w:number,h:number,rotatable?:boolean}, count:number}[]} pool
 * @param {number} thickness
 * @param {Axes} ax
 * @param {boolean} [grained]  material has a grain direction, so no rotation
 * @returns {{runs:{piece:any,o:{w:number,h:number,rotated:boolean},cols:number,rows:number}[], used:number, count:number}}
 */
export function fillStripFromPool(pool, thickness, ax, grained = false) {
  const k = ax.kerf;
  /** @type {Map<string, number>} */
  const left = new Map(pool.map((e) => [e.piece.id, e.count]));
  /** @type {{piece:any,o:any,cols:number,rows:number}[]} */
  const runs = [];
  let remaining = ax.span;
  let total = 0;

  for (let guard = 0; guard < 500 && remaining > 0; guard++) {
    /** @type {{piece:any, o:any, run:any} | null} */
    let pick = null;
    let pickScore = 0;

    for (const entry of pool) {
      const available = left.get(entry.piece.id) ?? 0;
      if (available <= 0) continue;
      for (const o of orientationsOf(entry.piece, ax, grained)) {
        if (acrossOf(ax, o) > thickness) continue;
        const run = bestRun(o, thickness, remaining, available, ax);
        if (run.count === 0) continue;

        const bedUsed = (run.rows * acrossOf(ax, o) + (run.rows - 1) * k) * run.length;
        // Area won per unit of consumed thickness, plus a nudge to fill the length.
        const score = (run.area / Math.max(bedUsed, 1)) * 1e3 + run.length;
        if (score > pickScore) {
          pickScore = score;
          pick = { piece: entry.piece, o, run };
        }
      }
    }

    if (!pick) break;
    runs.push({ piece: pick.piece, o: pick.o, cols: pick.run.cols, rows: pick.run.rows });
    left.set(pick.piece.id, (left.get(pick.piece.id) ?? 0) - pick.run.count);
    total += pick.run.count;
    remaining -= pick.run.length + k;
  }

  return { runs, used: ax.span - Math.max(remaining, 0), count: total };
}

/**
 * Pack a whole task with the pool / typed-run strip model.
 *
 * Sheets are filled one strip at a time. For every strip all viable thicknesses
 * are tried, each filled with runs, and the strip with the best `scoreStrip`
 * wins. The strip is then written down for good, so the plan keeps its band
 * structure and stays guillotine-cuttable.
 *
 * @param {{id:string,w:number,h:number}[]} types
 * @param {Record<string, number>} counts
 * @param {SheetGeometry} geom
 * @param {'alongLength'|'alongWidth'} mode
 * @param {'density'|'bed'|'cover'} [strategy]
 * @returns {any[]}
 */
export function packPool(types, counts, geom, mode, strategy = 'bed') {
  const ax = stripAxes(geom, mode);
  const k = ax.kerf;
  const grained = geom.grained === true;

  /** @type {Record<string, number>} */
  const left = { ...counts };
  /** @type {any[]} */
  const out = [];

  for (let guard = 0; guard < 1000; guard++) {
    if (!Object.values(left).some((n) => n > 0)) break;

    /** @type {any[]} */
    const parts = [];
    let usedArea = 0;
    let stack = 0;
    const sheetLeft = { ...left };

    while (stack < ax.stack) {
      const room = ax.stack - stack;

      // Viable strip thicknesses: every part extent that still fits.
      /** @type {Set<number>} */
      const cands = new Set();
      for (const t of types) {
        if ((sheetLeft[t.id] ?? 0) <= 0) continue;
        for (const o of orientationsOf(t, ax, grained)) {
          if (acrossOf(ax, o) <= room) cands.add(acrossOf(ax, o));
        }
      }

      /** @type {{thickness:number, runs:any[], used:number, score:number} | null} */
      let best = null;
      for (const thickness of [...cands].sort((a, b) => b - a)) {
        const pool = types
          .filter((t) => (sheetLeft[t.id] ?? 0) > 0)
          .map((t) => ({ piece: t, count: sheetLeft[t.id] ?? 0 }));
        if (pool.length === 0) continue;

        const { runs, used } = fillStripFromPool(pool, thickness, ax, grained);
        if (runs.length === 0) continue;

        const score = scoreStrip(strategy, runs, thickness, used, ax.span, k);
        if (!best || score > best.score) best = { thickness, runs, used, score };
      }

      if (!best) break;

      // Emit the strip: runs side by side, each a 1-D or 2-D block.
      let cursor = 0;
      for (const run of best.runs) {
        const o = run.o;
        let count = Math.min(run.cols * run.rows, sheetLeft[run.piece.id] ?? 0);
        let colsUsed = 0;

        for (let row = 0; row < run.rows && count > 0; row++) {
          for (let col = 0; col < run.cols && count > 0; col++) {
            const along = cursor + col * (alongOf(ax, o) + k);
            const across = stack + row * (acrossOf(ax, o) + k);
            const pos = toSheet(ax, along, across);
            parts.push({ id: run.piece.id, x: pos.x, y: pos.y, w: o.w, h: o.h, rotated: o.rotated });
            usedArea += o.w * o.h;
            sheetLeft[run.piece.id] = (sheetLeft[run.piece.id] ?? 1) - 1;
            count--;
            if (row === 0) colsUsed++;
          }
        }

        cursor += colsUsed * alongOf(ax, o) + Math.max(0, colsUsed - 1) * k + k;
      }

      stack += best.thickness + k;
    }

    if (parts.length === 0) break; // nothing fits even on an empty sheet
    out.push({ parts, usedArea, sheetArea: geom.width * geom.height });
    for (const [id, n] of Object.entries(sheetLeft)) left[id] = n;
  }

  return out;
}

/**
 * Place every part with the strip model, trying all three scoring strategies,
 * and keep the plan with the fewest sheets (then the most area used).
 *
 * @param {Piece[]} pieces
 * @param {SheetGeometry} geom
 * @param {'alongLength'|'alongWidth'} mode
 * @returns {any[]}
 */
export function packStripsPool(pieces, geom, mode) {
  /** @type {{id:string,w:number,h:number,rotatable:boolean}[]} */
  const types = [];
  /** @type {Record<string, number>} */
  const counts = {};
  for (const p of pieces) {
    const key = `${p.id}|${p.w}x${p.h}`;
    if (!counts[key]) {
      counts[key] = 0;
      // The rotation flag travels with the type, otherwise the strip packer
      // would be free to turn parts that must keep their orientation.
      types.push({ id: key, w: p.w, h: p.h, rotatable: p.rotatable !== false });
    }
    counts[key]++;
  }

  // Pool keys carry the size; restore the human id on the way out.
  /** @type {Map<string,string>} */
  const label = new Map();
  for (const p of pieces) label.set(`${p.id}|${p.w}x${p.h}`, p.id);

  /** @type {any[]} */
  let best = [];
  let bestScore = Infinity;

  for (const strategy of /** @type {const} */ (['bed', 'cover', 'density'])) {
    const sheets = packPool(types, counts, geom, mode, strategy);
    const score = sheets.length * 1e12 - sheets.reduce((s, x) => s + x.usedArea, 0) * 1e-3;
    if (score < bestScore) {
      bestScore = score;
      best = sheets;
    }
  }

  return best.map((s) => ({
    ...s,
    parts: s.parts.map((p) => ({ ...p, id: label.get(p.id) ?? p.id })),
  }));
}
