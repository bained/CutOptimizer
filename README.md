# CutOptimizer

**Version 2.0.1**

**CutOptimizer** is a high-performance desktop application for **sheet cutting optimization** — it calculates the optimal layout for cutting rectangular parts from sheets of material (chipboard, plywood, MDF, acrylic, etc.), minimizing waste and maximizing material usage.

Built with [Neutralino.js](https://neutralino.js.org/) and a deterministic 2D guillotine cutting engine with custom SVG visualization.

## What's New in Version 2.0.0

- **Block Guillotine Engine**: Groups identical parts into homogeneous 2D matrix blocks ($C \times R$) with clean guillotine cuts suitable for sliding table saws and panel beam saws.
- **Large Reusable Off-cut Logic**: Concentrates waste on the final sheet into a single large, usable rectangular off-cut instead of fragmented slivers.
- **Cutting Directions**: Choose between Optimal (auto-evaluation of block, mixed, and strip layouts), Along Length, or Along Width.
- **Material Grain Direction**: Lock every part against rotation when material has a visible wood grain or veneer.
- **Edge Trim (Окрайчване)**: Configurable margin trim on all four sides of the board, visually indicated on layouts.
- **Off-cut Stock**: Pre-existing shop leftovers are consumed before opening any new full board.
- **Cleaned Data UI**: Streamlined single-board setup with kerf and edge trim, eliminating duplicate input fields.

## What's New in Version 2.0.1

- Fixed loading example projects in the Examples dropdown.
- Loading an example now restores its off-cut stock.
- Added `tp_01.json` as a bundled example project.

## Features

- **Tab-based UI**: Settings | Data | Results
- **Data Management**: CRUD for parts and sheet, JSON import/export, auto-save state
- **Edge (canting) system**: 4-sided canting with L1/L2/S1/S2 visual indicators
- **Visualization**: Scalable SVG sheet layouts with per-sheet navigation, zoom (In/Out/Reset), grid, edge trim line, and edge highlights
- **Export**: CSV, high-resolution PNG, printable multi-page PDF report with clean file naming
- **Internationalization**: English and Bulgarian (embedded, zero runtime file dependencies)
- **Zero External Runtime Dependencies**: Standalone lightweight binary

## Quick Start

```bash
# Build the engine bundle and compile application
.\dist_build.bat

# Run standalone
dist\CutOptimizer\CutOptimizer.exe
```

## Architecture

```
resources/
├── js/
│   ├── app/
│   │   ├── model/           # Data models (Part, Rect, Sheet)
│   │   ├── engine/          # Cutting Engine
│   │   │   ├── cut-engine/  # ES-module engine (geometry, pack-blocks, solve, verify)
│   │   │   ├── cut-engine.bundle.js # Flattened runtime bundle
│   │   │   └── OptimizerAdapter.js  # Host application adapter
│   │   ├── i18n.js          # Embedded translations (EN, BG)
│   │   └── ProjectManager.js
│   └── main.js              # Application entry point & UI controller
├── index.html
└── styles.css
```

### Build output (`dist/CutOptimizer/`):

`dist_build.bat` produces a self-contained distribution folder:

```
CutOptimizer.exe              # Windows (x64) executable
resources.neu                 # Application bundle
examples/                     # Sample project files
```

## Internationalization

The project supports **i18n** via embedded translations in `resources/js/app/i18n.js`. Translations are compiled directly into the application with zero file dependencies.

## License

MIT
