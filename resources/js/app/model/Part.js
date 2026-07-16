'use strict';

/**
 * Part — детайл за поставяне върху плоскост.
 */
class Part {
    /**
     * Конвертира legacy число (0-4) към масив [L1, L2, S1, S2].
     * 1=L1, 2=L1+L2, 3=L1+L2+S1, 4=all.
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
        // Поддържаме legacy число (0-4) и масив [L1, L2, S1, S2]
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

    getTotalEdges() {
        return this.edges[0] + this.edges[1] + this.edges[2] + this.edges[3];
    }

    copy() {
        // ВАЖНО: .slice() за да не се споделя референция на масива
        return new Part(this.name, this.w, this.h, this.canRotate, this.qty, this.edges.slice());
    }
}