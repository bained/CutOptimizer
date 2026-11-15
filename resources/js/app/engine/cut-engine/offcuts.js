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
export function expandOffcuts(input) {
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
export function sortOffcutsSmallestFirst(offcuts) {
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
export function offcutCanHoldAnything(offcut, pieces, grained) {
  for (const p of pieces) {
    if (p.w <= offcut.w && p.h <= offcut.h) return true;
    if (!grained && p.rotatable && p.h <= offcut.w && p.w <= offcut.h) return true;
  }
  return false;
}
