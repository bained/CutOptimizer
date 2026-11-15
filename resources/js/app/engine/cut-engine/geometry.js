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
export function usableArea(geom) {
  return {
    x: geom.border,
    y: geom.border,
    w: geom.width - 2 * geom.border,
    h: geom.height - 2 * geom.border,
  };
}

/** Area of a rectangle. @param {Rect} r */
export const area = (r) => r.w * r.h;

/**
 * Does `w x h` fit inside the rectangle?
 * @param {Rect} rect @param {number} w @param {number} h
 */
export const fitsIn = (rect, w, h) => w <= rect.w && h <= rect.h;

/**
 * Is `inner` fully inside `outer`? Edges count as inside.
 * @param {Rect} inner @param {Rect} outer
 */
export const contains = (inner, outer) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

