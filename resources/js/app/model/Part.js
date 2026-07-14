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
     * @param {number} qty - Брой идентични части (default 1).
     * @param {number[]} edges - Масив от 4 числа за кантове [top, right, bottom, left] (default [0,0,0,0]).
     */
    constructor(name, w, h, canRotate, qty, edges) {
        this.name = name || '';
        this.w = w || 0;
        this.h = h || 0;
        this.canRotate = canRotate || false;
        this.qty = (qty !== undefined) ? qty : 1;
        this.edges = (edges && Array.isArray(edges) && edges.length === 4) ? edges.slice() : [0, 0, 0, 0];
    }

    calculateArea() {
        return this.w * this.h;
    }

    /**
     * Връща общия брой кантове (сума от 4-те страни).
     */
    getTotalEdges() {
        return this.edges[0] + this.edges[1] + this.edges[2] + this.edges[3];
    }

    copy() {
        return new Part(this.name, this.w, this.h, this.canRotate, this.qty, this.edges);
    }
}