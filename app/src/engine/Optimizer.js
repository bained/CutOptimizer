'use strict';

import { Part } from '../model/Part.js';
import { Sheet, PlacedPart } from '../model/Sheet.js';
import { Rect } from '../model/Rect.js';

/**
 * Layout — множество от листове с обща оценка.
 * Съответства на Layout struct от D кода.
 */
class Layout {
    constructor() {
        this.sheets = [];
        this.score = 0.0;
    }

    /**
     * Създава дълбоко копие на този Layout.
     * @returns {Layout}
     */
    copy() {
        const copy = new Layout();
        copy.score = this.score;
        copy.sheets = [];
        for (let i = 0; i < this.sheets.length; i++) {
            copy.sheets.push(this.sheets[i].copy());
        }
        return copy;
    }
}

/**
 * Optimizer — основен алгоритъм за оптимизация на разкроя.
 * Имплементира Beam Search V6 (порт от D кода).
 */
class Optimizer {
    /**
     * @param {number} sheetW - Ширина на листа.
     * @param {number} sheetH - Височина на листа.
     * @param {number} kerf - Дебелина на рязане (kerf).
     */
    constructor(sheetW, sheetH, kerf) {
        this.sheetW = sheetW;
        this.sheetH = sheetH;
        this.kerf = kerf;
    }

    /**
     * Създава нов празен Sheet.
     * @returns {Sheet}
     */
    createSheet() {
        const s = new Sheet(this.sheetW, this.sheetH);
        return s;
    }

    /**
     * Разделя свободните правоъгълници след поставяне на част.
     * Използва AFIT (Area Fit) стратегия — създава 4 нови правоъгълника
     * около поставената част.
     * 
     * @param {Sheet} sheet - Текущият лист (mutate-ва се).
     * @param {import('../model/Sheet.js').PlacedPart} placed - Поставената част.
     */
    splitRects(sheet, placed) {
        const pw = placed.w + this.kerf;
        const ph = placed.h + this.kerf;
        const next = [];

        for (let i = 0; i < sheet.freeRects.length; i++) {
            const fr = sheet.freeRects[i];

            // Проверка за припокриване
            const overlapX = placed.x < fr.x + fr.w && placed.x + pw > fr.x;
            const overlapY = placed.y < fr.y + fr.h && placed.y + ph > fr.y;

            if (overlapX && overlapY) {
                // Частта припокрива този freeRect — разделяме го
                if (placed.x > fr.x) {
                    next.push(new Rect(fr.x, fr.y, placed.x - fr.x, fr.h));
                }
                if (placed.x + pw < fr.x + fr.w) {
                    next.push(new Rect(placed.x + pw, fr.y, fr.x + fr.w - (placed.x + pw), fr.h));
                }
                if (placed.y > fr.y) {
                    next.push(new Rect(fr.x, fr.y, fr.w, placed.y - fr.y));
                }
                if (placed.y + ph < fr.y + fr.h) {
                    next.push(new Rect(fr.x, placed.y + ph, fr.w, fr.y + fr.h - (placed.y + ph)));
                }
            } else {
                // Няма припокриване — запазваме freeRect-а
                next.push(fr.copy());
            }
        }

        sheet.freeRects = next;
    }

    /**
     * Премахва free rects, които са изцяло вътре в други free rects.
     * 
     * @param {Sheet} sheet - Текущият лист (mutate-ва се).
     */
    cleanRects(sheet) {
        if (sheet.freeRects.length < 2) return;

        const result = [];
        for (let i = 0; i < sheet.freeRects.length; i++) {
            const a = sheet.freeRects[i];
            let inside = false;

            for (let j = 0; j < sheet.freeRects.length; j++) {
                if (i === j) continue;
                const b = sheet.freeRects[j];

                // Проверка дали a е изцяло вътре в b
                if (a.x >= b.x && a.y >= b.y &&
                    a.x + a.w <= b.x + b.w &&
                    a.y + a.h <= b.y + b.h) {
                    inside = true;
                    break;
                }
            }

            if (!inside) {
                result.push(a);
            }
        }

        sheet.freeRects = result;
    }

    /**
     * Финален етап — пресмята efficiency на листа.
     * 
     * @param {Sheet} sheet - Текущият лист (mutate-ва се).
     */
    finalize(sheet) {
        sheet.efficiency = sheet.calculateEfficiency();
    }

    /**
     * Оценява цялостен Layout.
     * Бонус за по-малко листове + сума от квадратите на ефективността.
     * 
     * @param {Sheet[]} sheets - Масив от листове.
     * @returns {number} - Общ резултат (по-висок = по-добър).
     */
    evaluate(sheets) {
        const sheetCount = sheets.length;
        let totalEff = 0;

        for (let i = 0; i < sheetCount; i++) {
            totalEff += Math.pow(sheets[i].efficiency, 2);
        }

        // 10 милиона бонус за по-малко листове
        return (10_000_000.0 / sheetCount) + totalEff;
    }

    /**
     * Опитва да постави част в конкретен freeRect на конкретен sheet.
     * 
     * @param {Layout[]} outLayouts - Масив за събиране на кандидат layouts (output).
     * @param {Layout} base - Базовият layout, от който се клонира.
     * @param {Part} part - Частта за поставяне.
     * @param {number} sheetIndex - Индекс на sheet.
     * @param {number} rectIndex - Индекс на freeRect.
     * @param {boolean} rotated - Дали частта да се ротира.
     */
    tryCandidate(outLayouts, base, part, sheetIndex, rectIndex, rotated) {
        const r = base.sheets[sheetIndex].freeRects[rectIndex];
        const pw = rotated ? part.h : part.w;
        const ph = rotated ? part.w : part.h;

        // Проверка дали частта влиза в свободната област
        if (pw > r.w || ph > r.h) return;

        // Клонираме layout-а
        const layout = base.copy();
        const s = layout.sheets[sheetIndex];

        // Поставяме частта
        const placed = new PlacedPart(part.name, r.x, r.y, pw, ph, rotated);
        s.parts.push(placed);

        // Разделяме free rects
        this.splitRects(s, placed);
        this.cleanRects(s);
        this.finalize(s);

        // V6 SCORE: "Гравитация" към долния ляв ъгъл
        let gravityPenalty = 0;
        for (let i = 0; i < s.parts.length; i++) {
            const p = s.parts[i];
            gravityPenalty += (p.x + p.y) * 0.005;
        }

        layout.score = this.evaluate(layout.sheets) - gravityPenalty;
        outLayouts.push(layout);
    }

    /**
     * Beam Search алгоритъм за оптимизация на разкроя.
     * 
     * @param {Part[]} parts - Масив от части за поставяне.
     * @param {number} beamWidth - Ширина на лъча (брой кандидати).
     * @returns {Layout} - Най-добрият намерен Layout.
     */
    beamSearch(parts, beamWidth) {
        let beam = [];

        // Инициализираме с празен layout, съдържащ един лист
        const initial = new Layout();
        initial.sheets.push(this.createSheet());
        beam.push(initial);

        for (let pi = 0; pi < parts.length; pi++) {
            const p = parts[pi];
            const nextCandidates = [];

            for (let bi = 0; bi < beam.length; bi++) {
                const layout = beam[bi];

                for (let si = 0; si < layout.sheets.length; si++) {
                    for (let ri = 0; ri < layout.sheets[si].freeRects.length; ri++) {
                        // Опитваме без ротация
                        this.tryCandidate(nextCandidates, layout, p, si, ri, false);
                        // Опитваме с ротация, ако е позволено
                        if (p.canRotate) {
                            this.tryCandidate(nextCandidates, layout, p, si, ri, true);
                        }
                    }
                }

                // Опция: добавяме нов лист
                const newSheetLayout = layout.copy();
                newSheetLayout.sheets.push(this.createSheet());
                const newSheetIndex = newSheetLayout.sheets.length - 1;
                this.tryCandidate(nextCandidates, newSheetLayout, p, newSheetIndex, 0, false);
                if (p.canRotate) {
                    this.tryCandidate(nextCandidates, newSheetLayout, p, newSheetIndex, 0, true);
                }
            }

            // Сортираме кандидатите по score (низходящо) и режем до beamWidth
            nextCandidates.sort((a, b) => b.score - a.score);
            beam = nextCandidates.slice(0, Math.min(beamWidth, nextCandidates.length));
        }

        return beam[0];
    }

    /**
     * Стартира оптимизация с множество итерации и стратегии за сортиране.
     * 
     * @param {Part[]} parts - Масив от части.
     * @param {number} iterations - Брой итерации.
     * @param {number} beamWidth - Ширина на лъча.
     * @returns {Layout} - Най-добрият Layout от всички итерации.
     */
    optimize(parts, iterations, beamWidth) {
        let best = null;

        for (let it = 0; it < iterations; it++) {
            // Клонираме частите
            const workingParts = [];
            for (let i = 0; i < parts.length; i++) {
                workingParts.push(parts[i].copy());
            }

            // Стратегия за сортиране
            if (it % 3 === 0) {
                // По площ (големите първи)
                workingParts.sort((a, b) => b.calculateArea() - a.calculateArea());
            } else if (it % 3 === 1) {
                // По max страна
                workingParts.sort((a, b) => {
                    const maxA = Math.max(a.w, a.h);
                    const maxB = Math.max(b.w, b.h);
                    return maxB - maxA;
                });
            } else {
                // Random shuffle (Fisher-Yates)
                for (let i = workingParts.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const temp = workingParts[i];
                    workingParts[i] = workingParts[j];
                    workingParts[j] = temp;
                }
            }

            const layout = this.beamSearch(workingParts, beamWidth);

            if (best === null || layout.score > best.score) {
                best = layout;
            }
        }

        return best;
    }
}

export { Layout, Optimizer };