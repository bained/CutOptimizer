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
        copy.sheets = new Array(this.sheets.length);
        for (let i = 0; i < this.sheets.length; i++) {
            copy.sheets[i] = this.sheets[i].copy();
        }
        return copy;
    }
}

class DeltaCandidate {
    constructor(parent, sheetIndex, sheet, score) {
        this.parent = parent;
        this.sheetIndex = sheetIndex;
        this.sheet = sheet;
        this.score = score;
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
        // Optimized path is the default; false keeps the reference fallback.
        this.parentDeltaCandidates = true;
        // Experimental for large free-rectangle lists; full cleanup is the
        // reference default until a larger workload proves a benefit.
        this.incrementalCleanup = false;
        // Experimental until a larger workload proves a runtime benefit.
        this.topKSelection = false;
        this.candidateGenerationIndex = 0;
        this.batchSize = 1;
    }

    /**
     * Създава нов празен Sheet.
     * @returns {Sheet}
     */
    createSheet() {
        const s = new Sheet(this.sheetW, this.sheetH);
        return s;
    }

    candidateCompare(a, b) {
        if (a.score !== b.score) return b.score - a.score;
        return a.generationIndex - b.generationIndex;
    }

    appendCandidate(outCandidates, candidate) {
        candidate.generationIndex = this.candidateGenerationIndex++;
        if (!this.topKSelection || this.topKLimit <= 0) {
            outCandidates.push(candidate);
            return;
        }
        const limit = this.topKLimit;
        const length = outCandidates.length;
        let insertAt = length;
        while (insertAt > 0 && this.candidateCompare(outCandidates[insertAt - 1], candidate) > 0) insertAt--;
        if (insertAt >= limit) return;
        outCandidates.length = length < limit ? length + 1 : limit;
        for (let i = outCandidates.length - 1; i > insertAt; i--) outCandidates[i] = outCandidates[i - 1];
        outCandidates[insertAt] = candidate;
    }

    materializeCandidate(candidate) {
        const layout = new Layout();
        layout.score = candidate.score;
        layout.sheets = new Array(candidate.parent.sheets.length +
            (candidate.sheetIndex === candidate.parent.sheets.length ? 1 : 0));
        for (let i = 0; i < candidate.parent.sheets.length; i++) {
            layout.sheets[i] = i === candidate.sheetIndex
                ? candidate.sheet
                : candidate.parent.sheets[i].copy();
        }
        if (candidate.sheetIndex === candidate.parent.sheets.length) {
            layout.sheets[candidate.sheetIndex] = candidate.sheet;
        }
        return layout;
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
        const source = sheet.freeRects;
        const nextBufferIndex = source === sheet.splitRectBuffers[0] ? 1 : 0;
        const next = sheet.splitRectBuffers[nextBufferIndex];
        const nextFlags = sheet.splitRectNewFlags[nextBufferIndex];
        let nextCount = 0;

        const appendRect = (x, y, w, h, isNew) => {
            if (w <= 0 || h <= 0) return;
            const index = nextCount++;
            let rect = next[index];
            if (rect === undefined) {
                rect = new Rect(x, y, w, h);
                next[index] = rect;
            } else {
                rect.x = x;
                rect.y = y;
                rect.w = w;
                rect.h = h;
            }
            nextFlags[index] = isNew;
        };

        for (let i = 0; i < source.length; i++) {
            const fr = source[i];

            // Проверка за припокриване
            const overlapX = placed.x < fr.x + fr.w && placed.x + pw > fr.x;
            const overlapY = placed.y < fr.y + fr.h && placed.y + ph > fr.y;

            if (overlapX && overlapY) {
                // Частта припокрива този freeRect — разделяме го
                if (placed.x > fr.x) {
                    appendRect(fr.x, fr.y, placed.x - fr.x, fr.h, true);
                }
                if (placed.x + pw < fr.x + fr.w) {
                    appendRect(placed.x + pw, fr.y, fr.x + fr.w - (placed.x + pw), fr.h, true);
                }
                if (placed.y > fr.y) {
                    appendRect(fr.x, fr.y, fr.w, placed.y - fr.y, true);
                }
                if (placed.y + ph < fr.y + fr.h) {
                    appendRect(fr.x, placed.y + ph, fr.w, fr.y + fr.h - (placed.y + ph), true);
                }
            } else {
                // Няма припокриване — запазваме freeRect-а
                appendRect(fr.x, fr.y, fr.w, fr.h, false);
            }
        }

        next.length = nextCount;
        nextFlags.length = nextCount;
        sheet.freeRects = next;
        sheet.freeRectNewFlags = nextFlags;
        sheet.splitRectBufferIndex = nextBufferIndex;
    }

    /**
     * Премахва free rects, които са изцяло вътре в други free rects.
     * 
     * @param {Sheet} sheet - Текущият лист (mutate-ва се).
     */
    cleanRects(sheet) {
        if (sheet.freeRects.length < 2) return;

        const sourceFlags = sheet.freeRectNewFlags || [];
        const result = sheet.cleanRectBuffer;
        const resultFlags = sheet.cleanRectFlags;
        result.length = 0;
        resultFlags.length = 0;
        for (let i = 0; i < sheet.freeRects.length; i++) {
            const a = sheet.freeRects[i];
            let inside = false;

            for (let j = 0; j < sheet.freeRects.length; j++) {
                if (i === j) continue;
                if (this.incrementalCleanup && !sourceFlags[i] && !sourceFlags[j]) continue;
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
                result[result.length] = a;
                resultFlags[resultFlags.length] = false;
            }
        }

        sheet.freeRects = result;
        sheet.freeRectNewFlags = resultFlags;
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
        const baseSheet = sheetIndex === base.sheets.length ? this.createSheet() : base.sheets[sheetIndex];
        const r = baseSheet.freeRects[rectIndex];
        const pw = rotated ? part.h : part.w;
        const ph = rotated ? part.w : part.h;

        // Проверка дали частта влиза в свободната област
        if (pw > r.w || ph > r.h) return;

        if (this.parentDeltaCandidates) {
            const deltaSheet = baseSheet.copy();
            const placed = new PlacedPart(part.name, r.x, r.y, pw, ph, rotated);
            deltaSheet.parts.push(placed);
            this.splitRects(deltaSheet, placed);
            this.cleanRects(deltaSheet);
            this.finalize(deltaSheet);
            const sheetCount = sheetIndex === base.sheets.length ? base.sheets.length + 1 : base.sheets.length;
            let score = 10000000.0 / sheetCount;
            let gravityPenalty = 0;
            for (let i = 0; i < base.sheets.length; i++) {
                score += Math.pow(i === sheetIndex ? deltaSheet.efficiency : base.sheets[i].efficiency, 2);
                const currentSheet = i === sheetIndex ? deltaSheet : base.sheets[i];
                for (let j = 0; j < currentSheet.parts.length; j++) {
                    gravityPenalty += (currentSheet.parts[j].x + currentSheet.parts[j].y) * 0.005;
                }
            }
            if (sheetIndex === base.sheets.length) score += Math.pow(deltaSheet.efficiency, 2);
            for (let j = 0; sheetIndex === base.sheets.length && j < deltaSheet.parts.length; j++) {
                gravityPenalty += (deltaSheet.parts[j].x + deltaSheet.parts[j].y) * 0.005;
            }
            score -= gravityPenalty;
            this.appendCandidate(outLayouts, new DeltaCandidate(base, sheetIndex, deltaSheet, score));
            return;
        }

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
        this.appendCandidate(outLayouts, layout);
    }

    /**
     * Beam Search алгоритъм за оптимизация на разкроя.
     * 
     * @param {Part[]} parts - Масив от части за поставяне.
     * @param {number} beamWidth - Ширина на лъча (брой кандидати).
     * @returns {Layout} - Най-добрият намерен Layout.
     */
    beamSearch(parts, beamWidth) {
        let beam = new Array(Math.max(beamWidth, 1));
        beam.length = 0;
        const nextCandidates = new Array(Math.max(beamWidth * 8, 16));
        nextCandidates.length = 0;
        this.candidateGenerationIndex = 0;
        this.topKLimit = beamWidth;

        // Инициализираме с празен layout, съдържащ един лист
        const initial = new Layout();
        initial.sheets.push(this.createSheet());
        beam.push(initial);

        for (let pi = 0; pi < parts.length; pi++) {
            const p = parts[pi];
            nextCandidates.length = 0;
            this.candidatesSeenThisStep = 0;

            for (let bi = 0; bi < beam.length; bi++) {
                const layout = beam[bi];

                for (let si = 0; si < layout.sheets.length; si++) {
                    for (let ri = 0; ri < layout.sheets[si].freeRects.length; ri++) {
                        this.tryCandidate(nextCandidates, layout, p, si, ri, false);
                        if (p.canRotate) {
                            this.tryCandidate(nextCandidates, layout, p, si, ri, true);
                        }
                    }
                }

                // Опция: добавяме нов лист
                if (this.parentDeltaCandidates) {
                    this.tryCandidate(nextCandidates, layout, p, layout.sheets.length, 0, false);
                    if (p.canRotate) this.tryCandidate(nextCandidates, layout, p, layout.sheets.length, 0, true);
                } else {
                    const newSheetLayout = layout.copy();
                    newSheetLayout.sheets.push(this.createSheet());
                    const newSheetIndex = newSheetLayout.sheets.length - 1;
                    this.tryCandidate(nextCandidates, newSheetLayout, p, newSheetIndex, 0, false);
                    if (p.canRotate) this.tryCandidate(nextCandidates, newSheetLayout, p, newSheetIndex, 0, true);
                }
            }

            // Сортираме кандидатите по score (низходящо) и режем до beamWidth
            if (!this.topKSelection) nextCandidates.sort((a, b) => this.candidateCompare(a, b));
            const survivorCount = Math.min(beamWidth, nextCandidates.length);
            if (this.parentDeltaCandidates) {
                const survivors = new Array(survivorCount);
                for (let i = 0; i < survivorCount; i++) survivors[i] = this.materializeCandidate(nextCandidates[i]);
                beam = survivors;
            } else {
                beam = nextCandidates.slice(0, survivorCount);
            }
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
    optimizeSync(parts, iterations, beamWidth) {
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

    optimize(parts, iterations, beamWidth) {
        return this.optimizeSync(parts, iterations, beamWidth);
    }
}

export { Layout, Optimizer };