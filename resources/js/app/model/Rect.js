'use strict';

/**
 * Rect — правоъгълник, представящ свободна област или bounding box.
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

    calculateArea() {
        return this.w * this.h;
    }

    copy() {
        return new Rect(this.x, this.y, this.w, this.h);
    }
}