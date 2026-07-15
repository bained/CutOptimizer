# Changelog

## [0.5.0] - i18n + Performance + QA (Current)
### Added
- **Internationalization (i18n)**:
  - `resources/js/app/i18n.js` — I18n class with `load()`, `t()`, `applyTranslations()`
  - `resources/lang/en.json` (150+ keys, English) and `resources/lang/bg.json` (Bulgarian)
  - `index.html`: all static texts use `data-i18n` / `data-i18n-placeholder` attributes
  - `main.js`: all dynamic status messages use `i18n.t()`
  - Default language: English (`en`)
- **SVG Library** (`resources/js/app/svgLibrary.js`):
  - `resolveStrokeWidths()` — maps L1/L2/S1/S2 to top/right/bottom/left based on orientation
  - `generateRectangleSVG()` — generates SVG string with rect + 4 line elements for edges
  - `addDimensions()` — adds W (top) and H (left, rotated) SVG text elements
  - `addLabel()` — adds name in center
  - `escapeHtml()` — reliable HTML escaping (immutable to auto-formatter)

### Changed
- **Performance (M5 fix)**: `renderSVG()` no longer uses `DOMParser` — builds SVG DOM directly with `document.createElementNS()`
- **Edge visualization**: `stroke-linecap="butt"`, black (`#000000`) stroke, width 6/0, outline `#333333` 1.5px
- **PlacedPart**: now receives `edges` array (fixed stroke-width=0 bug)
- **Error handler (M4 fix)**: `window.addEventListener('error', ...)` handles both strings and ErrorEvent
- **PDF export (m4 fix)**: checks for popup blocker (`window.open` returns null), shows alert via `i18n.t('error.popupBlocked')`
- **Zoom limits**: `zoomIn()`/`zoomOut()` early-return when limit reached (prevents button accumulation)

### Fixed
- QA M1: `parts-count-label` no longer uses `data-i18n-value` — JS manages count dynamically
- QA M3: `current-project` no longer uses `data-i18n="project.label"` — `updateProjectName()` handles correctly
- QA m2/m6: `input-part-qty` has `data-i18n-placeholder="data.parts.qty"`, key added to en.json/bg.json
- Sheet/Parts export: added `ensureExt(r, '.json')` before writeFile
- `formatEdges()`: now uses `i18n.t()` instead of hardcoded `EDGE_LABELS` array
- Edge buttons in table: labels come from `i18n.t('data.parts.edge.l1')` etc.

## [0.4.0] - SVG Library + Edge Visualization
- Created SVG Library (`resources/js/app/svgLibrary.js`) with 4 functions
- `PlacedPart` now accepts `edges` array (fixed stroke-width=0 bug)
- Edge: `stroke-linecap="butt"`, `stroke="#000000"`, width 6|0, outline `#333333` 1.5px

## [0.3.0] - Tab UI + Data Management + Export
- Tab interface (Settings | Data | Results), CRUD for parts/sheet
- Data Model: qty, edges [L1,L2,S1,S2], legacy import (number→array)
- Auto-load/auto-save, Example browser, Save/Load/New Project
- CSV/PNG/PDF export, SVG zoom, WCAG AAA colors

## [0.2.0] - Engine Core
- Port of Beam Search V6 from D → ES6 classes
- Rect, Part, PlacedPart, Sheet, Layout, Optimizer, ConfigManager, ProjectManager

## [0.1.0] - Initial Setup
- Project structure, .clinerules, documentation