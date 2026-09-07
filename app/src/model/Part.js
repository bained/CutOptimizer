'use strict';

/**
 * Part — детайл за поставяне върху плоскост.
 * Съответства на Part struct от D кода.
 */
class Part {
    /**
     * @param {string} name - Име на детайла (напр. "Дъно", "Страна").
     * @param {number} w - Ширина (в мм).
     * @param {number} h - Височина (в мм).
     * @param {boolean} canRotate - Дали детайлът може да се ротира на 90°.
     */
    constructor(name, w, h, canRotate) {
        this.name = name;
        this.w = w;
        this.h = h;
        this.canRotate = canRotate;
    }

    /**
     * Пресмята площта на детайла.
     * @returns {number}
     */
    calculateArea() {
        return this.w * this.h;
    }

    /**
     * Създава дълбоко копие на този Part.
     * @returns {Part}
     */
    copy() {
        return new Part(this.name, this.w, this.h, this.canRotate);
    }
}

export { Part };