'use strict';

/**
 * SVG Library — професионално чертане на правоъгълници с кантове.
 */

/**
 * Разпределя L1/L2/S1/S2 към top/right/bottom/left според ориентацията.
 */
function resolveStrokeWidths(width, height, L1, L2, S1, S2) {
    if (width >= height) {
        return { top: L1, bottom: L2, right: S1, left: S2 };
    } else {
        return { top: S1, bottom: S2, right: L2, left: L1 };
    }
}

/**
 * Генерира SVG низ за правоъгълник с дебели линии (кантове) по четирите страни.
 * Връща string (SVG XML).
 */
function generateRectangleSVG(params) {
    var width = params.width, height = params.height;
    var L1 = params.L1 || 0, L2 = params.L2 || 0, S1 = params.S1 || 0, S2 = params.S2 || 0;
    var sCol = params.sCol || '#000000';
    var fCol = params.fCol || '#FFFFFF';

    var sw = resolveStrokeWidths(width, height, L1, L2, S1, S2);
    var top = sw.top, right = sw.right, bottom = sw.bottom, left = sw.left;

    var lineTopY = top / 2;
    var lineBottomY = height - bottom / 2;
    var lineLeftX = left / 2;
    var lineRightX = width - right / 2;

    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">';
    s += '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="' + fCol + '" />';
    s += '<line x1="' + lineLeftX + '" y1="' + lineTopY + '" x2="' + lineRightX + '" y2="' + lineTopY + '" stroke="' + sCol + '" stroke-width="' + top + '" stroke-linecap="butt" />';
    s += '<line x1="' + lineRightX + '" y1="' + lineTopY + '" x2="' + lineRightX + '" y2="' + lineBottomY + '" stroke="' + sCol + '" stroke-width="' + right + '" stroke-linecap="butt" />';
    s += '<line x1="' + lineRightX + '" y1="' + lineBottomY + '" x2="' + lineLeftX + '" y2="' + lineBottomY + '" stroke="' + sCol + '" stroke-width="' + bottom + '" stroke-linecap="butt" />';
    s += '<line x1="' + lineLeftX + '" y1="' + lineBottomY + '" x2="' + lineLeftX + '" y2="' + lineTopY + '" stroke="' + sCol + '" stroke-width="' + left + '" stroke-linecap="butt" />';
    // Контур на детайла — тънка тъмносива линия
    s += '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="none" stroke="#333333" stroke-width="1.5" rx="0"/>';
    s += '</svg>';

    return s;
}

/**
 * Добавя SVG <text> елементи за размерите (W и H) към SVG DOM елемент.
 * Използва appendChild директно.
 */
function addDimensions(svgElement, width, height, L1, L2, S1, S2, color) {
    var sw = resolveStrokeWidths(width, height, L1, L2, S1, S2);
    var top = sw.top, left = sw.left;

    var widthFontSize = (width < 30) ? '10' : '15';
    var heightFontSize = (height < 30) ? '10' : '15';

    var ns = 'http://www.w3.org/2000/svg';

    // Ширина — горе, под горния кант
    var widthOff = top / 2 + 4;
    var wText = document.createElementNS(ns, 'text');
    wText.setAttribute('font-family', 'sans-serif');
    wText.setAttribute('font-size', widthFontSize);
    wText.setAttribute('fill', color);
    wText.setAttribute('x', width / 2);
    wText.setAttribute('y', widthOff);
    wText.setAttribute('text-anchor', 'middle');
    wText.setAttribute('dominant-baseline', 'hanging');
    wText.textContent = '' + width;
    svgElement.appendChild(wText);

    // Височина — вляво, вдясно от левия кант, завъртяна на -90°
    var cx = (left / 2) + left / 2 + 6;
    var cy = height / 2;
    var hText = document.createElementNS(ns, 'text');
    hText.setAttribute('font-family', 'sans-serif');
    hText.setAttribute('font-size', heightFontSize);
    hText.setAttribute('fill', color);
    hText.setAttribute('x', cx);
    hText.setAttribute('y', cy);
    hText.setAttribute('text-anchor', 'middle');
    hText.setAttribute('dominant-baseline', 'middle');
    hText.setAttribute('transform', 'rotate(-90 ' + cx + ' ' + cy + ')');
    hText.textContent = '' + height;
    svgElement.appendChild(hText);
}

/**
 * Добавя <text> елемент с името на правоъгълника в центъра му.
 */
function addLabel(svgElement, labelName, width, height) {
    var ns = 'http://www.w3.org/2000/svg';
    var text = document.createElementNS(ns, 'text');
    text.setAttribute('x', width / 2);
    text.setAttribute('y', height / 2);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-family', 'sans-serif');
    text.setAttribute('font-size', '14');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', '#333333');
    text.textContent = labelName;
    svgElement.appendChild(text);
}