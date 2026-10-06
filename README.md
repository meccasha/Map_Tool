# Atlas Ink

An offline Windows desktop application for painting and annotating geographic maps during historical research. Opens on Iran and the greater Middle East. Country and province maps cover the world.

## Install

Run `Atlas Ink Setup 1.0.0.exe` on Windows 10 or 11, 64-bit. Choose an installation folder and launch Atlas Ink. The installer is unsigned; Windows may show an unknown-publisher prompt. No account, API key, network connection, or separate Node installation is needed to use the installed application.

## Draw and save

- Brush: drag to paint/highlight; adjust ink, width, and opacity.
- Fill: click a country or a visible province/imported region.
- Arrow: drag from origin to destination.
- Point: click to place a marker and optional label.
- Text: click to add an annotation box; click an existing note with Text to edit.
- Eraser: click to remove an entire annotation or fill. Map borders remain intact.
- Pan: drag, or hold Space while dragging with any tool. Scroll to zoom.
- Save project writes an editable `.atlas` file, including drawings and imported polygons. Open restores it. PNG export creates a flattened image of the current extent, at 1×, 2×, or 3× resolution.

Drawings keep geographic positions and paint footprints while panning or zooming. Points and text retain readable screen sizes. Drawings remain visible when switching base maps; fills retain the region's original geographic footprint. Use separate projects for separate studies. Undo/redo applies to drawing and layer operations.

Shortcuts: B / F / A / P / T / E / H for tools; Ctrl+S save; Ctrl+Shift+S save as; Ctrl+O open; Ctrl+N new; Ctrl+E export; Ctrl+Z undo; Ctrl+Shift+Z redo; Ctrl+0 fit map.

## Map dates and sources

**Modern reference:** Natural Earth, country and first-level administrative polygons, 1:10m, 5.2 release series. 258 country/territory features; 4,596 subdivision features including all 31 Iranian provinces. Public domain. Bundled shapes have shared-topology 2 km simplification and minor geometry repairs. Some subdivisions are dated and disputed-territory choices follow Natural Earth. This is a regional reference map, not an authoritative survey or guaranteed 2026 administrative census.

**Historical:** Bennett, J. S. et al. (2025), “Cliopatria — A geospatial database of world-wide political entities from 3400BCE to 2024CE,” *Scientific Data* 12, 247. DOI: https://doi.org/10.1038/s41597-025-04516-9. Dataset v0.2.1, Seshat, https://github.com/Seshat-Global-History-Databank/cliopatria/releases/tag/v0.2.1. CC BY 4.0: https://creativecommons.org/licenses/by/4.0/.

Selected historical dates: 1600, 1650, 1700, 1722, 1750, 1800, 1850, 1900, 1914, 1925, 1945, 1979, 2000, 2024. Includes source Safavid, Afsharid, Zand, Qajar, Pahlavi, Ottoman, Mughal, and neighboring polity outlines. A selected date uses the source record's inclusive date interval, with no interpolation.

Historical geography is sampled and approximate (about 40 km² equatorial source pixels). Some outlines are held across multi-year intervals; dynasty labels/date conventions can differ from standard historical chronologies. Polities may overlap and gaps remain gaps. Composite parent and relationship records are excluded from the main outlines. Historical coastlines are not reconstructed; physical land is modern Natural Earth. No historical boundaries are extrapolated after 2024.

Changes to Cliopatria: retained 5,362 records intersecting 1600 onward; normalized metadata; shared-arc TopoJSON encoding with submeter quantization. Original rings preserved; no deliberate outline simplification. Exact provenance, hashes, license notices, and conversion details are included in `app/data/`.

## Historical subregions

Historical province coverage is not bundled. Import separately sourced **WGS 84 Polygon/MultiPolygon GeoJSON FeatureCollections** using Import. Provide a name, inclusive date range, and citation. Enable “Show provinces / subregions” with the historical map. Imported layers are stored inside your `.atlas` project, can be toggled or removed, and can be filled.

Coordinates must be longitude / latitude. Rings must be closed, contain at least four positions, and use finite coordinates. Limits: 50 MB input file, 15,000 regions, one million coordinate positions. Declared projected coordinate systems are rejected. Reproject or simplify large source files first. Import checks structure and coordinate ranges; it cannot establish the historical accuracy or licensing of supplied data.

Dates outside 1600–2024 can appear for imported layers through 2100; those views show the imported layer with modern physical land and no bundled historical state outlines. Imported date endpoints are added to the date selector.

## Develop

Node.js 22 or later recommended.

```sh
npm ci
npm start
npm run check
npm run package:windows
```

All geographic data and renderer libraries are bundled. The renderer has a restrictive content policy, no Node integration, and an isolated preload exposing only map reads and user-selected file operations. Application projects are local files; no research content is uploaded.

## Licenses

Application code: MIT. Natural Earth: public domain. Cliopatria: CC BY 4.0. D3 and topojson-client: ISC (notices in `app/vendor/`). Electron and its bundled Chromium components retain their upstream notices in the installer. Imported datasets retain their own licenses.
