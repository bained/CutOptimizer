'use strict';

/**
 * PlacedPart — поставен детайл върху лист.
 */
class PlacedPart {
    /**
     * @param {string} name
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {boolean} rotated
     * @param {number[]} edges - [L1, L2, S1, S2]
     */
    constructor(name, x, y, w, h, rotated, edges) {
        this.name = name;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.rotated = rotated || false;
        this.edges = (edges && Array.isArray(edges) && edges.length === 4) ? edges.slice() : [0,0,0,0];
    }

    calculateArea() {
        return this.w * this.h;
    }

    copy() {
        return new PlacedPart(this.name, this.x, this.y, this.w, this.h, this.rotated, this.edges);
    }
}

/**
 * Sheet — един лист (плоскост) със свободни области и поставени части.
 */
class Sheet {
    /**
     * @param {number} w
     * @param {number} h
     */
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.freeRects = [new Rect(0, 0, w, h)];
        this.parts = [];
        this.efficiency = 0.0;
    }

    calculateTotalArea() {
        return this.w * this.h;
    }

    calculateUsedArea() {
        let used = 0;
        for (let i = 0; i < this.parts.length; i++) {
            used += this.parts[i].calculateArea();
        }
        return used;
    }

    calculateEfficiency() {
        const total = this.calculateTotalArea();
        if (total === 0) return 0.0;
        return (this.calculateUsedArea() / total) * 100.0;
    }

    copy() {
        const copy = new Sheet(this.w, this.h);
        copy.freeRects = [];
        for (let i = 0; i < this.freeRects.length; i++) {
            copy.freeRects.push(this.freeRects[i].copy());
        }
        copy.parts = [];
        for (let i = 0; i < this.parts.length; i++) {
            copy.parts.push(this.parts[i].copy());
        }
        copy.efficiency = this.efficiency;
        return copy;
    }
}