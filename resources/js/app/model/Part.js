'use strict';

/**
 * Part — детайл за поставяне върху плоскост.
 */
class Part {
    /**
     * @param {string} name
     * @param {number} w
     * @param {number} h
     * @param {boolean} canRotate
     */
    constructor(name, w, h, canRotate) {
        this.name = name;
        this.w = w;
        this.h = h;
        this.canRotate = canRotate;
    }

    calculateArea() {
        return this.w * this.h;
    }

    copy() {
        return new Part(this.name, this.w, this.h, this.canRotate);
    }
}