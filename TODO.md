# TODO

## Completed (v0.5.0)
- [x] Initial project structure and documentation
- [x] Beam Search V6 engine port from D
- [x] Tab-based UI (Settings | Data | Results)
- [x] CRUD operations for parts and sheet
- [x] Data model: qty, edges [L1,L2,S1,S2]
- [x] Legacy import support (number 0-4 -> array)
- [x] Auto-load/auto-save (last_project.json)
- [x] Example browser (examples/ directory)
- [x] Save/Load/New Project
- [x] CSV, PNG, PDF export
- [x] SVG rendering with viewBox, zoom, grid
- [x] Edge visualization (black lines, stroke-width 6)
- [x] WCAG AAA color scheme
- [x] SVG Library (svgLibrary.js) — generateRectangleSVG, addDimensions, addLabel
- [x] i18n infrastructure (I18n class, en.json, bg.json)
- [x] Full i18n migration (index.html data-i18n, main.js i18n.t())
- [x] QA fixes: parts count, project label, error handler, popup blocker, zoom limits
- [x] Performance: remove DOMParser, direct DOM SVG building
- [x] PDF export: popup blocker check, alert message

## Future Ideas

### Priority
- [ ] **CNC Export** — generate G-code or DXF for CNC machines
- [ ] **PDF improvements** — proper embedded fonts, multi-page support
- [ ] **Edge labels in PDF** — show L1/L2/S1/S2 directly on printout
- [ ] **Language switcher** — dropdown in UI to change language without restart
- [ ] **Undo/Redo** — history of CRUD operations
- [ ] **Keyboard shortcuts** — Ctrl+Z, Ctrl+S, Delete, etc.

### Optimization Engine
- [ ] **Multi-material support** — different sheets with different materials
- [ ] **Rotation constraints** — some parts can only rotate one way
- [ ] **Grain direction** — enforce wood grain orientation
- [ ] **Kerf compensation** — blade thickness per cut
- [ ] **Batch mode** — optimize multiple projects at once

### Visualization
- [ ] **Part labels in SVG** — show name, dimensions, edge info on hover
- [ ] **Sheet preview** — thumbnail in Data tab
- [ ] **3D preview** — stacked sheets visualization
- [ ] **Color coding** — by material, by edge count, by priority

### Data
- [ ] **Database backend** — SQLite for project history
- [ ] **Template library** — save part/sheet combinations as templates
- [ ] **Barcode/QR** — scan parts for workshop tracking
- [ ] **Cost calculator** — material cost + edge banding cost + cutting time

### UI/UX
- [ ] **Dark theme** — alternative color scheme
- [ ] **Drag & drop** — reorder parts in table
- [ ] **Multi-select** — delete/edit multiple parts at once
- [ ] **Search/filter** — find parts by name or dimensions
- [ ] **Batch import** — import multiple parts from spreadsheet