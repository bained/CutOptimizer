'use strict';

/**
 * Rect — правоъгълник, представящ свободна област или bounding box.
 * Използва се за freeRects в Sheet.
 */
class Rect {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     */
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    /**
     * Пресмята площта на правоъгълника.
     * @returns {number}
     */
    calculateArea() {
        return this.w * this.h;
    }

    /**
     * Създава дълбоко копие на този Rect.
     * @returns {Rect}
     */
    copy() {
        return new Rect(this.x, this.y, this.w, this.h);
    }
}

export { Rect };