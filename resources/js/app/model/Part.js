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
    /**
     * Конвертира legacy число (0-4) към масив [T,R,B,L].
     * 1=top, 2=right, 3=bottom, 4=left — запазва само първите толкова страни.
     * Използва се при импорт на стари проекти.
     */
    static convertLegacyEdges(val) {
        if (Array.isArray(val) && val.length === 4) return val.slice();
        if (typeof val === 'number' && val > 0 && val <= 4) {
            var arr = [0, 0, 0, 0];
            for (var i = 0; i < Math.min(val, 4); i++) arr[i] = 1;
            return arr;
        }
        return [0, 0, 0, 0];
    }

    constructor(name, w, h, canRotate, qty, edges) {
        this.name = name || '';
        this.w = w || 0;
        this.h = h || 0;
        this.canRotate = canRotate || false;
        this.qty = (qty !== undefined) ? qty : 1;
        // Поддържаме legacy число (0-4) и масив [T,R,B,L]
        if (edges && Array.isArray(edges) && edges.length === 4) {
            this.edges = edges.slice();
        } else if (typeof edges === 'number') {
            this.edges = Part.convertLegacyEdges(edges);
        } else {
            this.edges = [0, 0, 0, 0];
        }
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