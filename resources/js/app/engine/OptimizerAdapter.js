'use strict';

/**
 * OptimizerAdapter — the classic-script face of the cutting engine.
 *
 * The application still constructs `new Optimizer(w, h, kerf)` and calls
 * `optimize(parts, iterations, beamWidth, randomize, onProgress)`. This class
 * keeps that shape so `ProjectManager` and the UI need no rewiring, while the
 * actual work is done by `window.CutEngine.solveCuttingPlan` (see
 * `cut-engine.bundle.js`, generated from the ES-module sources).
 *
 * What the old arguments mean here:
 *   - `iterations`, `beamWidth`, `randomize` were Beam Search tuning knobs. The
 *     new engine has no such parameters, so they are accepted and ignored.
 *   - `onProgress(done, total)` is still called at the start and at the end, so
 *     a progress bar keeps moving.
 *
 * Extra settings the UI can use:
 *   setMode('optional' | 'alongLength' | 'alongWidth')
 *   setGrained(boolean)      grain direction locks every part against rotation
 *   setFormats([{w,h,qty}])  several sheet sizes in stock
 *   setOffcuts([{w,h,qty}])  leftover stock, consumed before new sheets
 *   setWaste({...})          what counts as reusable waste
 */
class OptimizerAdapter {
  /**
   * @param {number} sheetW
   * @param {number} sheetH
   * @param {number} kerf
   */
  constructor(sheetW, sheetH, kerf) {
    this.sheetW = sheetW;
    this.sheetH = sheetH;
    this.kerf = kerf;
    this.trim = 0;

    this.mode = 'optional';
    this.grained = false;


    /** @type {{w:number,h:number,qty?:number,id?:string}[]} */
    this.formats = [];
    /** @type {{w:number,h:number,qty?:number,id?:string}[]} */
    this.offcuts = [];
    /** @type {any} */
    this.waste = null;
    /** @type {string[]} */
    this.lastErrors = [];
  }

  /**
   * Cutting strategy. `optional` lets the engine choose; the other two force a
   * guillotine strip direction.
   *
   * @param {'optional'|'alongLength'|'alongWidth'} mode
   */
  setMode(mode) {
    this.mode = mode === 'alongLength' || mode === 'alongWidth' ? mode : 'optional';
    return this;
  }

  /**
   * Border margin (trim) in mm on all four sides of the sheet.
   *
   * @param {number} trim
   */
  setTrim(trim) {
    this.trim = Math.max(0, +trim || 0);
    return this;
  }

  /**
   * Grain direction of the material. When true every part keeps its orientation.

   *
   * @param {boolean} grained
   */
  setGrained(grained) {
    this.grained = grained === true;
    return this;
  }

  /**
   * Sheet stock, as an alternative to the single sheet given to the constructor.
   * An empty list means "use the constructor sheet".
   *
   * @param {{w:number,h:number,qty?:number,id?:string}[]} formats
   */
  setFormats(formats) {
    this.formats = Array.isArray(formats) ? formats.slice() : [];
    return this;
  }

  /**
   * Leftover stock. These are cut before any new sheet is opened.
   *
   * @param {{w:number,h:number,qty?:number,id?:string}[]} offcuts
   */
  setOffcuts(offcuts) {
    this.offcuts = Array.isArray(offcuts) ? offcuts.slice() : [];
    return this;
  }

  /**
   * Waste thresholds used for the report (minimum reusable strip / off-cut).
   *
   * @param {any} limits
   */
  setWaste(limits) {
    this.waste = limits ?? null;
    return this;
  }

  /**
   * Runs the plan and returns the shape the UI already understands:
   * `{ sheets: [{ w, h, efficiency, parts: [...] }], score }`.
   *
   * The call never rejects: a problem comes back as an empty plan plus
   * `this.lastErrors`, which the caller can show in the status bar.
   *
   * @param {any[]} parts         Part instances, `qty` already expanded
   * @param {number} [iterations] ignored (Beam Search only)
   * @param {number} [beamWidth]  ignored (Beam Search only)
   * @param {boolean} [randomize] ignored (Beam Search only)
   * @param {(done:number,total:number)=>void} [onProgress]
   */
  async optimize(parts, iterations, beamWidth, randomize, onProgress) {
    void iterations;
    void beamWidth;
    void randomize;

    const total = Array.isArray(parts) ? parts.length : 0;
    if (onProgress && typeof onProgress === 'function') onProgress(0, total || 1);

    this.lastErrors = [];

    if (!total) {
      this.lastErrors.push('No parts to place.');
      return this._emptyLayout();
    }

    const engine = typeof window !== 'undefined' ? window.CutEngine : undefined;
    if (!engine || typeof engine.solveCuttingPlan !== 'function') {
      this.lastErrors.push('Cutting engine is not loaded (cut-engine.bundle.js).');
      return this._emptyLayout();
    }

    const sheet = {
      width: this.sheetW,
      height: this.sheetH,
      kerf: this.kerf,
      border: this.trim || 0,
      grained: this.grained,
    };


    const result = engine.solveCuttingPlan({
      sheet,
      sheets: this.formats.length > 0 ? this._toSheetSpecs(this.formats) : undefined,
      parts: this._toPieces(parts),
      mode: this.mode,
      offcuts: this.offcuts.length > 0 ? this._toStockList(this.offcuts) : undefined,
      waste: this.waste ?? undefined,
    });

    if (onProgress && typeof onProgress === 'function') onProgress(total, total);

    if (Array.isArray(result.errors) && result.errors.length > 0) {
      this.lastErrors = result.errors.slice();
    }

    return this._toLayout(result, parts);
  }

  /**
   * Turns `{w, h, qty}` shorthand into the engine's `{width, height, qty}`.
   * The UI reads sizes as width/height of a board, which matches `w`/`h` in the
   * rest of the app; the engine names them explicitly.
   *
   * @param {{w:number,h:number,qty?:number,id?:string}[]} list
   * @returns {{width:number,height:number,qty?:number,id?:string}[]}
   */
  _toSheetSpecs(list) {
    return list.map((f) => ({ width: f.w, height: f.h, qty: f.qty, id: f.id }));
  }

  /**
   * Same conversion for leftover stock.
   *
   * @param {{w:number,h:number,qty?:number,id?:string}[]} list
   * @returns {{w:number,h:number,qty?:number,id?:string}[]}
   */
  _toStockList(list) {
    return list.map((c) => ({ w: c.w, h: c.h, qty: c.qty, id: c.id }));
  }

  /**
   * Turns the application's Part objects into the engine's piece list.
   *
   * `ProjectManager.expandParts()` has already expanded `qty`, so one Part in
   * equals one piece out — multiplying here again would duplicate the whole job.
   *
   * @param {any[]} parts
   * @returns {{id:string,w:number,h:number,rotatable:boolean}[]}
   */
  _toPieces(parts) {
    return parts.map((p) => ({
      id: p.name,
      w: p.w,
      h: p.h,
      rotatable: p.canRotate !== false,
    }));
  }

  /**
   * Maps the engine result back to the legacy Layout shape.
   *
   * An off-cut plan is rendered as if it were a sheet of the off-cut's own size,
   * flagged with `isOffcut`, so the operator sees where stock parts came from.
   *
   * @param {any} result
   * @param {any[]} parts  the original Part list, for the canting (edges) lookup
   */
  _toLayout(result, parts) {
    /** @type {Map<string, number[]>} */
    const edgesByName = new Map();
    for (const p of parts) {
      edgesByName.set(p.name, Array.isArray(p.edges) ? p.edges.slice() : [0, 0, 0, 0]);
    }

    // The engine reports the off-cut id and area but not its outline, so the
    // size is resolved from the stock the caller supplied: first by id, then by
    // area, so an id mismatch cannot silently collapse the sheet to the parts'
    // bounding box.
    /** @type {Map<string, {w:number,h:number}>} */
    const offcutSizes = new Map();
    /** @type {{w:number,h:number,area:number}[]} */
    const offcutByArea = [];
    for (const c of this.offcuts) {
      const qty = Math.max(1, Number(c.qty) || 1);
      const base = c.id ?? 'offcut';
      const area = Number(c.w) * Number(c.h);
      for (let n = 0; n < qty; n++) {
        offcutSizes.set(qty > 1 ? base + '#' + (n + 1) : base, { w: c.w, h: c.h });
        offcutByArea.push({ w: c.w, h: c.h, area });
      }
    }

    /**
     * Finds the outline of the off-cut a plan was cut from.
     * @param {any} plan
     */
    const sizeOf = (plan) => {
      const byId = offcutSizes.get(plan.offcut);
      if (byId) return byId;
      const area = Number(plan.offcutArea) || 0;
      for (const c of offcutByArea) {
        if (Math.abs(c.area - area) < 1e-6) return { w: c.w, h: c.h };
      }
      return null;
    };

    const sheets = [];

    // Leftover plans first: that is the stock actually cut.
    for (const plan of result.offcutPlans ?? []) {
      const known = sizeOf(plan);
      sheets.push({
        w: known ? known.w : this._extentW(plan.parts),
        h: known ? known.h : this._extentH(plan.parts),
        efficiency: plan.offcutArea > 0 ? (plan.usedArea / plan.offcutArea) * 100 : 0,
        isOffcut: true,
        offcutId: plan.offcut,
        parts: this._mapParts(plan.parts, edgesByName),
      });
    }

    for (const s of result.sheets) {
      sheets.push({
        w: s.sheetWidth ?? this.sheetW,
        h: s.sheetHeight ?? this.sheetH,
        efficiency: s.sheetArea > 0 ? (s.usedArea / s.sheetArea) * 100 : 0,
        isOffcut: false,
        format: s.format,
        parts: this._mapParts(s.parts, edgesByName),
      });
    }

    return {
      sheets,
      score: (result.stats?.absoluteYield ?? 0) * 1e6,
      errors: this.lastErrors.slice(),
      stats: result.stats,
    };
  }

  /**
   * @param {any[]} placed
   * @param {Map<string, number[]>} edgesByName
   */
  _mapParts(placed, edgesByName) {
    return placed.map((p) => {
      const edges = edgesByName.get(p.id) ?? [0, 0, 0, 0];
      const rotated = p.rotated === true;
      return {
        name: p.id,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        rotated,
        edges: this._rotateEdges(edges, rotated),
      };
    });
  }

  /**
   * A canting mark belongs to a physical edge of the part. When the part is
   * turned 90 degrees that edge moves, so the marks must move with it, otherwise
   * the workshop puts the banding on the wrong side.
   *
   * Order is [L1, L2, S1, S2]: the two long sides, then the two short ones.
   * A quarter turn swaps length and width, and the pairs shift across:
   *
   *   L1 (one long side)  -> S1 (a short side after the turn)
   *   L2 (other long)     -> S2
   *   S1 (one short side) -> L1
   *   S2 (other short)    -> L2
   *
   * @param {number[]} edges
   * @param {boolean} rotated
   * @returns {number[]}
   */
  _rotateEdges(edges, rotated) {
    if (!rotated) return edges.slice();
    return [edges[2], edges[3], edges[0], edges[1]];
  }

  /** @param {any[]} parts */
  _extentW(parts) {
    let max = 0;
    for (const p of parts) if (p.x + p.w > max) max = p.x + p.w;
    return max;
  }

  /** @param {any[]} parts */
  _extentH(parts) {
    let max = 0;
    for (const p of parts) if (p.y + p.h > max) max = p.y + p.h;
    return max;
  }

  /** The layout returned when nothing could be placed. */
  _emptyLayout() {
    return { sheets: [], score: 0, errors: this.lastErrors.slice(), stats: null };
  }
}

// The UI loads plain <script> tags, so the class must be global under the old
// name: `new Optimizer(w, h, kerf)` keeps working unchanged.
if (typeof window !== 'undefined') {
  window.Optimizer = OptimizerAdapter;
}

