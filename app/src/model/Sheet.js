'use strict';

import { Rect } from './Rect.js';

/**
 * PlacedPart — поставен детайл върху лист.
 * Съответства на Placed struct от D кода.
 */
class PlacedPart {
    /**
     * @param {string} name
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {boolean} rotated
     */
    constructor(name, x, y, w, h, rotated) {
        this.name = name;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.rotated = rotated;
    }

    /**
     * Пресмята площта на поставения детайл.
     * @returns {number}
     */
    calculateArea() {
        return this.w * this.h;
    }

    /**
     * Създава дълбоко копие.
     * @returns {PlacedPart}
     */
    copy() {
        return new PlacedPart(this.name, this.x, this.y, this.w, this.h, this.rotated);
    }
}

/**
 * Sheet — един лист (плоскост) със свободни области и поставени части.
 * Съответства на Sheet struct от D кода.
 */
class Sheet {
    /**
     * @param {number} w - Ширина на листа.
     * @param {number} h - Височина на листа.
     */
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.freeRects = [new Rect(0, 0, w, h)];
        this.parts = [];
        this.efficiency = 0.0;
    }

    /**
     * Пресмята общата площ на листа.
     * @returns {number}
     */
    calculateTotalArea() {
        return this.w * this.h;
    }

    /**
     * Пресмята използваната площ от поставените части.
     * @returns {number}
     */
    calculateUsedArea() {
        let used = 0;
        for (let i = 0; i < this.parts.length; i++) {
            used += this.parts[i].calculateArea();
        }
        return used;
    }

    /**
     * Пресмята ефективността (използвана площ / обща площ) * 100.
     * @returns {number}
     */
    calculateEfficiency() {
        const total = this.calculateTotalArea();
        if (total === 0) return 0.0;
        return (this.calculateUsedArea() / total) * 100.0;
    }

    /**
     * Създава дълбоко копие на този Sheet.
     * @returns {Sheet}
     */
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

export { PlacedPart, Sheet };