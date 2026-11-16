// GENERATED FILE - do not edit. Run `node build-engine.mjs` in this folder.
// Source: cut-engine/*.js (ES modules) flattened for classic <script> loading.
(function (global) {
  'use strict';

  // ------------------------------------------------------------------------
  // geometry.js
  // ------------------------------------------------------------------------
  // @ts-check
  /**
   * Rectangles, kerf and guillotine cutting.
   *
   * Coordinates: x grows to the right, y grows downwards, origin at the sheet's
   * top-left corner. All values are in millimetres.
   */

  /**
   * @typedef {Object} Rect
   * @property {number} x
   * @property {number} y
   * @property {number} w
   * @property {number} h
   */

  /**
   * @typedef {Object} SheetGeometry
   * @property {number} width    sheet length (X)
   * @property {number} height   sheet width (Y)
   * @property {number} kerf     saw blade width
   * @property {number} border   unusable margin on each of the four sides
   * @property {boolean} [grained]  material has a grain direction, so no part may
   *                                be rotated 90 degrees
   */

  /**
   * Usable area of a sheet: the sheet shrunk by `border` on every side.
   *
   * @param {SheetGeometry} geom
   * @returns {Rect}
   */
  function usableArea(geom) {
    return {
      x: geom.border,
      y: geom.border,
      w: geom.width - 2 * geom.border,
      h: geom.height - 2 * geom.border,
    };
  }

  /** Area of a rectangle. @param {Rect} r */
  const area = (r) => r.w * r.h;

  /**
   * Does `w x h` fit inside the rectangle?
   * @param {Rect} rect @param {number} w @param {number} h
   */
  const fitsIn = (rect, w, h) => w <= rect.w && h <= rect.h;

  /**
   * Is `inner` fully inside `outer`? Edges count as inside.
   * @param {Rect} inner @param {Rect} outer
   */
  const contains = (inner, outer) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h;

  // ------------------------------------------------------------------------
  // formats.js
  // ------------------------------------------------------------------------
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
  function expandFormats(input) {
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
  function geometryFor(job, format) {
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
  function planScore(p) {
    return p.unplaced * 1e15 + p.sheets * 1e9 - p.placedArea * 1e-3;
  }

  // ------------------------------------------------------------------------
  // offcuts.js
  // ------------------------------------------------------------------------
  // @ts-check
  /**
   * Off-cut stock: leftovers from an earlier job that are reused before any new
   * sheet is opened.
   *
   * An off-cut is a rectangle of known size. The engine treats each one as a
   * PSEUDO-SHEET: the normal packers run over them first, place whatever fits,
   * and whatever is left over stays in stock. That reuses all the existing
   * placement and verification code, and every off-cut keeps the same guillotine
   * structure as a full sheet.
   *
   * Off-cuts are consumed smallest-first, so the big leftovers survive for parts
   * that need them.
   */

  /** @typedef {{w:number,h:number,qty?:number,id?:string}} OffcutInput */
  /** @typedef {{id:string,w:number,h:number}} Offcut */

  /**
   * Expands the input list into individual off-cut rectangles.
   *
   * Duplicates are normalised: a `qty` field becomes repeated entries so the
   * packers can consume them one by one.
   *
   * @param {OffcutInput[]} input
   * @returns {Offcut[]}
   */
  function expandOffcuts(input) {
    /** @type {Offcut[]} */
    const out = [];
    for (const [i, c] of input.entries()) {
      const qty = Number(c.qty === undefined ? 1 : c.qty);
      const baseId = c.id === undefined || c.id === null || c.id === ''
        ? `offcut${i + 1}`
        : String(c.id);
      for (let n = 0; n < qty; n++) {
        out.push({ id: qty > 1 ? `${baseId}#${n + 1}` : baseId, w: Number(c.w), h: Number(c.h) });
      }
    }
    return out;
  }

  /**
   * Sorts off-cuts smallest-first.
   *
   * Reusing a small leftover first leaves the large ones intact for parts that
   * cannot fit anywhere else — the same "use the smallest usable piece first"
   * order a workshop follows by hand.
   *
   * @param {Offcut[]} offcuts
   * @returns {Offcut[]}
   */
  function sortOffcutsSmallestFirst(offcuts) {
    return offcuts.slice().sort((a, b) => {
      const areaA = a.w * a.h;
      const areaB = b.w * b.h;
      if (areaA !== areaB) return areaA - areaB;
      // Same area: prefer the shorter long side, then the narrower one.
      const longA = Math.max(a.w, a.h);
      const longB = Math.max(b.w, b.h);
      if (longA !== longB) return longA - longB;
      return Math.min(a.w, a.h) - Math.min(b.w, b.h);
    });
  }

  /**
   * True when the off-cut is big enough to be worth using for this part set.
   *
   * An off-cut smaller than the smallest part in both orientations can never hold
   * anything, so it is skipped instead of being turned into an empty sheet.
   *
   * @param {Offcut} offcut
   * @param {{id:string,w:number,h:number,rotatable:boolean}[]} pieces
   * @param {boolean} grained
   */
  function offcutCanHoldAnything(offcut, pieces, grained) {
    for (const p of pieces) {
      if (p.w <= offcut.w && p.h <= offcut.h) return true;
      if (!grained && p.rotatable && p.h <= offcut.w && p.w <= offcut.h) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------------
  // verify.js
  // ------------------------------------------------------------------------
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
  function verifySheet(sheet, geom, locked) {
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
  function stats(sheets, geom) {
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

  // ------------------------------------------------------------------------
  // waste.js
  // ------------------------------------------------------------------------
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
  function normalizeLimits(raw) {
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
  function classifyWaste(w, h, limits) {
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
  function freeRects(sheet, usable, kerf) {
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
  function collectWaste(sheets, geom, limits) {
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

  // ------------------------------------------------------------------------
  // pack-blocks.js
  // ------------------------------------------------------------------------
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
  function orientations(piece, grained = false) {
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
  function packSheetBlocks(types, counts, geom, cutPreference = 'auto') {
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
  function packBlocksBest(pieces, geom, mode = 'auto') {
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

  // ------------------------------------------------------------------------
  // pack-mixed.js
  // ------------------------------------------------------------------------
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
  function splitFree(free, part, kerf) {
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
  function placementScore(rect, w, h) {
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
  function orientations(piece, grained = false) {
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
  function placePart(sheets, piece, kerf, maxW, maxH, grained = false) {
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
  function packMixed(pieces, geom, compare) {
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
  const MIXED_ORDERS = [
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
  function packMixedBest(pieces, geom) {
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

  // ------------------------------------------------------------------------
  // pack-offcuts.js
  // ------------------------------------------------------------------------
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
  function packIntoOffcuts(pieces, offcuts, geom, compare) {
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
  function packIntoOffcutsBest(pieces, offcuts, geom) {
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

  // ------------------------------------------------------------------------
  // pack-strips.js
  // ------------------------------------------------------------------------
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
  function stripAxes(geom, mode) {
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
  const alongOf = (ax, o) => (ax.horizontal ? o.w : o.h);

  /** Part extent across the strip, i.e. its thickness. @param {Axes} ax @param {{w:number,h:number}} o */
  const acrossOf = (ax, o) => (ax.horizontal ? o.h : o.w);

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
  function scoreStrip(strategy, runs, thickness, used, span, kerf) {
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
  function orientationsOf(piece, ax, grained = false) {
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
  function bestRun(o, thickness, length, limit, ax) {
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
  function fillStripFromPool(pool, thickness, ax, grained = false) {
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
  function packPool(types, counts, geom, mode, strategy = 'bed') {
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
  function packStripsPool(pieces, geom, mode) {
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

  // ------------------------------------------------------------------------
  // solve.js
  // ------------------------------------------------------------------------
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







  /** @typedef {import('./geometry.js').SheetGeometry} SheetGeometry */
  /** @typedef {import('./formats.js').SheetFormat} SheetFormat */
  /** @typedef {{id:string,w:number,h:number,rotatable:boolean}} Piece */

  /**
   * Picks the plan with the fewest sheets, then the most area used,
   * and tie-breaks in favour of the largest single leftover.
   *
   * @param {any[][]} candidates
   * @returns {any[]}
   */
  function pickBest(candidates) {
    /** @type {any[]} */
    let best = [];
    let bestScore = Infinity;
    for (const sheets of candidates) {
      if (!sheets || sheets.length === 0) continue;
      const last = sheets[sheets.length - 1];
      let maxLeftover = 0;
      if (last && last.unusedRects) {
        for (const r of last.unusedRects) {
          if (r.w * r.h > maxLeftover) maxLeftover = r.w * r.h;
        }
      }
      const score =
        sheets.length * 1e12 -
        sheets.reduce((s, x) => s + x.usedArea, 0) * 1e-3 -
        maxLeftover * 1e-6;
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
   * @param {'optional'|'alongLength'|'alongWidth'|'blocks'} [mode]
   * @returns {any[]}
   */
  function solve(pieces, geom, mode = 'optional') {
    if (mode === 'blocks') {
      return packBlocksBest(pieces, geom);
    }
    if (mode === 'alongLength' || mode === 'alongWidth') {
      return packStripsPool(pieces, geom, mode);
    }

    // "Optional" allows any direction, so it may use all layout families.
    /** @type {any[][]} */
    const candidates = [];
    candidates.push(packBlocksBest(pieces, geom));
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
  function solveWithFormats(pieces, job, mode = 'optional', formats = []) {
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
  function solveJob(pieces, job, mode = 'optional', offcuts = [], formats = []) {
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
  function solveWithOffcuts(pieces, geom, mode = 'optional', offcuts = []) {
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
  function compareDirections(pieces, geom) {
    /** @type {('optional'|'alongLength'|'alongWidth')[]} */
    const modes = ['optional', 'alongLength', 'alongWidth'];
    return modes.map((mode) => {
      const sheets = solve(pieces, geom, mode);
      return { mode, sheets, stats: stats(sheets, geom) };
    });
  }

  // ------------------------------------------------------------------------
  // index.js
  // ------------------------------------------------------------------------
  // @ts-check
  /**
   * Public API of the cutting engine.
   *
   * `solveCuttingPlan()` is the only entry point the host application should use.
   * It NEVER throws: an invalid input comes back as `{ ok: false, errors: [...] }`,
   * so a bad project can never bring the application down.
   */





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
  function solveCuttingPlan(options) {
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

  // ------------------------------------------------------------------------
  // public surface
  // ------------------------------------------------------------------------
  global.CutEngine = {
    solveCuttingPlan,
    verifySheet,
    stats,
    compareDirections,
  };
})(typeof window !== 'undefined' ? window : globalThis);
