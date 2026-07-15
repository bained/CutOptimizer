# Changelog

## [0.5.0] - i18n Full Migration (Current)
- Пълна i18n миграция:
  - `index.html`: всички статични текстове заменени с `data-i18n` атрибути
  - `main.js`: всички динамични текстове използват `i18n.t()`
  - `initApp()`: зарежда `bg` по подразбиране + `applyTranslations()`
  - `svgLibrary.js`: `addLabel()` използва `i18n.t()` за "Edge" легенда
- CHANGELOG.md актуализиран преди всяка промяна

## [0.4.0] - SVG Library + Edge Visualization
- Създадена SVG Library (`resources/js/app/svgLibrary.js`):
  - `resolveStrokeWidths()` — разпределя L1/L2/S1/S2 към top/right/bottom/left
  - `generateRectangleSVG()` — правоъгълник с отделни line елементи за кантове
  - `addDimensions()` — W (отгоре) и H (отляво, завъртян) SVG текст
  - `addLabel()` — име в центъра
- `renderSVG()` преработен с `generateRectangleSVG()` + DOMParser + `addDimensions()` + `addLabel()`
- `PlacedPart` вече приема `edges` масив (поправен stroke-width=0 бъг)
- Edge: `stroke-linecap="butt"`, `stroke="#000000"`, width 6|0, контур `#333333` 1.5px

## [0.3.0] - Tab UI + Data Management + Export
- Tab интерфейс (Settings | Data | Results), CRUD за части/sheet
- Data Model: qty, edges [L1,L2,S1,S2], legacy импорт (число→масив)
- Auto-load/auto-save, Example browser, Save/Load/New Project
- CSV/PNG/PDF експорт, SVG zoom, WCAG AAA цветове

## [0.2.0] - Engine Core
- Порт на Beam Search V6 от D → ES6 класове
- Rect, Part, PlacedPart, Sheet, Layout, Optimizer, ConfigManager, ProjectManager

## [0.1.0] - Initial Setup
- Структура, .clinerules, документация

### Остава:
1. `escapeHtml()` да се премести в `svgLibrary.js` (auto-format я троши в main.js)
2. `refreshPartsTable()` — `lb.textContent = c` презаписва `data-i18n-value`
3. `renderSVG()` sheet label — `i18n.t('results.sheet.label')`
4. Динамичните статус съобщения (Грешка, Sheet updated) да използват `i18n.t()`
