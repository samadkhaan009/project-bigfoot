# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What Is Project Big Foot

A React/Vite web application built for PSI/ETS that maps the PSI test center network against US market intelligence layers. It is a **strategic planning and gap analysis tool** used by PSI leadership to identify coverage gaps, assess site quality, and make network decisions.

The map renders on a **CARTO Positron (light)** basemap using MapLibre GL / react-map-gl. All data is static GeoJSON — there is no backend.

---

## Theme Tokens

The UI runs on a **light theme**. All chrome (panels, popups, legend, filter/layer panels, toggles, chat) is driven by a single `THEME` object defined at the top of `src/components/BigFootMap.jsx`, immediately after `MAP_STYLE` (~line 6). There are 12 tokens:

| Token | Value | Purpose |
|---|---|---|
| `panelBg` | `rgba(255,255,255,0.96)` | Translucent panel background (header, filter, layer, legend, status bar, popups, InfoCards) |
| `panelBgSolid` | `#FFFFFF` | Opaque surfaces (state dropdown, chat panel) |
| `panelBorder` | `1px solid #E2E8F0` | Standard panel border |
| `inputBg` | `#F1F5F9` | Input field + chat loading-bubble background |
| `inputBorder` | `#CBD5E1` | Input border |
| `textPrimary` | `#0F172A` | Primary text; active toggle/label text |
| `textSecondary` | `#64748B` | Secondary / heading text |
| `textInactive` | `#94A3B8` | Inactive (off) toggle/label text |
| `divider` | `rgba(15,23,42,0.08)` | Hairline dividers and off-state control borders |
| `inset` | `rgba(15,23,42,0.04)` | Recessed / inset backgrounds (toggle wells, close buttons) |
| `shadow` | `0 4px 16px rgba(15,23,42,0.12)` | Standard panel drop shadow |
| `shadowLg` | `0 8px 28px rgba(15,23,42,0.16)` | Elevated surfaces (InfoCards, dropdown) |

**Rules:**
- **All chrome colors reference `THEME` — never hardcode hex in chrome.** Map layer *paint* properties (`fill-color`, `circle-color`, `line-color`, `circle-stroke-color`, etc.) are **exempt** and stay literal — they encode data, not UI surface.
- Basemap is **CARTO Positron (light)** (`MAP_STYLE`). New panels use `background: THEME.panelBg` + `border: THEME.panelBorder` + `boxShadow: THEME.shadow` (use `shadowLg` for floating cards/dropdowns).
- **Label convention:** active labels use `THEME.textPrimary`, inactive labels use `THEME.textInactive`. Never invert — an active label must read heavier than an inactive one.
- **Legend swatches intentionally run at higher opacity than the map fills they represent.** Small chips need extra weight to stay visible on white, so a swatch drawn at 0.2–0.4 opacity may represent a map fill at a much lower opacity. This mismatch is deliberate — do **not** "reconcile" legend swatch opacity down to the map fill.
- **IRS state choropleth fill:** activated states use `#4ADE80` at a *gradient* opacity of `0.08 + statePctActivated * 0.16` (≈0.08 at 0% activated → 0.24 at 100%). The gradient encodes activation completeness and **must be preserved** through any future restyling — do not flatten it to a constant. No-activation states are flat `#FCA5A5` / `0.12`.

---

## Commands

```bash
npm run dev       # Start dev server with HMR (port 5173)
npm run build     # Production build to dist/
npm run preview   # Serve production build locally
npm run lint      # ESLint check
```

Data pipeline scripts (all ESM, run from project root):
```bash
node tools/geocode_psi.js          # Re-geocode all 563 US PSI sites (~3-5 min)
node tools/join_performance.js     # Join performance data onto sites GeoJSON
node tools/join_optimus.js         # Join Optimus scores + category data
node tools/join_lease.js           # Join lease intelligence data
node tools/regen_radii.js          # Regenerate all 50-mile radius polygons from sites
node tools/governance_check.js     # Full data governance audit → tools/governance_report.md
node tools/fix_duplicate_coords.js # Apply 20m offsets to co-located sites
```

When updating PSI site data, the typical pipeline order is:
1. `geocode_psi.js` → produces `data_psi_sites.geojson` + `data_psi_radii.geojson`
2. `join_performance.js` → enriches sites with performance tier data
3. `join_optimus.js` → enriches O&O sites with Optimus quality scores
4. `join_lease.js` → enriches O&O sites with lease intelligence
5. `regen_radii.js` → regenerates rings if coordinates changed
6. `governance_check.js` → validate everything

---

## Architecture

### Single-component map (`src/components/BigFootMap.jsx`)

The entire application is one large React component (~1,400+ lines). Entry: `src/main.jsx` → `src/App.jsx` → `BigFootMap`. The component owns all state and renders directly into a MapLibre `<Map>`.

**Module-level constants** (defined before the component):
- `DATA_QUALITY` — provenance registry for every layer (source, classification, confidence, last updated)
- `LAYER_GROUPS` — defines the layer panel structure with counts
- `PSI_COLORS`, `PERF_TIER_LABELS`, `OPTIMUS_COLORS`, `LEASE_ACTION_COLORS` — all visual constants
- MapLibre expressions (`PERF_COLOR_EXPR`, `PERF_RADIUS_EXPR`, `OPTIMUS_RADIUS_EXPR`, `LEASE_RING_COLOR_EXPR`) — defined at module level as plain JS arrays

**State inside `BigFootMap`**:
- `layers` — flat object controlling 14 industry/base layer toggles
- `psiLayers` — `{oo, authorized, mg, td, amp}` — PSI site type toggles
- `performanceMode`, `optimusMode` — mutually exclusive via `togglePerformanceMode` / `toggleOptimusMode`
- `showRadii`, `showLeaseIntel` — overlay toggles
- `filterStates`, `filterPerfTiers`, `filterOptusTiers` — active map filters (null = no filter)
- `filterPanelOpen`, `stateDropOpen` — UI open/close state
- `clickInfo`, `hoverInfo` — feature info from map interactions

**Critical rendering rule — no Fragment children inside `<Source>`**: react-map-gl's Source iterates children via `React.Children` and does not unwrap Fragments. All `<Layer>` components must be direct conditional children of `<Source>`, not wrapped in `<>...</>`. This is a known gotcha that causes all layers to disappear silently.

**Layer rendering order** (z-order, bottom to top):
1. States, Metros, Population, Urban/Rural (base)
2. PSI 50-mile radii (`psi-radii` source)
3. Industry hub symbol layers (POINT_LAYERS)
4. PSI site circles (`psi-sites` source): normal → optimus → performance mode layers
5. Critical Optimus pulse (`psi-critical-optimus`)
6. Lease rings (`psi-lease-contract-pulse`, `psi-lease-ring`)

**Filter composition**: All PSI layer filters pass through `addPsiFilters(baseFilter)`, which appends active state/tier/Optimus filters as a MapLibre `['all', ...]` expression. This function is defined inside the component and must be called for every PSI `<Layer>` filter prop.

**Sub-components** (defined in same file, above `BigFootMap`):
- `QualityBadge` — small colored dot indicating data classification
- `DataSourcePanel` — full provenance block shown in quality mode
- `QualitySummaryBar` — top banner when quality mode is on
- `Legend({ layers, psiLayers, showRadii, qualityMode, performanceMode, optimusMode, showLeaseIntel })` — bottom-left floating legend
- `InfoCard({ info, onClose, qualityMode, optimusMode, showLeaseIntel })` — bottom-right feature details

The `extractInfo` callback normalises clicked feature properties into a flat `info` object. PSI sites (detected by layer ID matching `PSI_INTERACTIVE` or `psi-perf-circle` / `psi-optimus-oo-circle`) get an `isPsi: true` flag and all enriched fields including performance, Optimus, and lease data.

---

## Data Files

All GeoJSON lives in `public/data/`. Served as static files — not imported as modules (loaded via URL string in Source components). Exception: `metros.geojson` is also in `public/data/metros.geojson`.

### Industry/Market Intelligence Layers

| File | Features | Source | Classification |
|---|---|---|---|
| `data_airports.geojson` | 1,054 | OpenFlights | REAL |
| `data_universities.geojson` | 5,987 | NCES IPEDS HD2023 | REAL |
| `data_financial.geojson` | 8,557 | FDIC BankFind (10k API sample) | REAL_PARTIAL |
| `data_manufacturing.geojson` | 3,579 | WRI Global Power Plant Database 2021 | REAL |
| `data_healthcare.geojson` | 2,215 | CMS reference + city model | MODELLED |
| `data_government.geojson` | 2,698 | City population model | MODELLED |
| `data_technology.geojson` | 2,737 | City population + BLS boost | MODELLED |
| `data_railway.geojson` | 1,545 | City population / Amtrak logic | MODELLED |
| `data_cultural.geojson` | 1,916 | City population model | MODELLED |
| `data_agriculture.geojson` | 1,439 | City population, 30 ag states | MODELLED |
| `data_population.geojson` | 62 | Census 2023 county estimates | MODELLED |
| `data_urban_rural.geojson` | 100 | Manually curated | CURATED |
| `metros.geojson` | 85 | Python-generated circular buffers | MODELLED |
| _(states)_ | 51 | PublicaMundi CDN / Census TIGER | REAL (external URL) |

> ⚠️ `data_manufacturing.geojson` is labeled "Manufacturing" in the UI but contains WRI **power plant** data. It is a proxy for heavy industrial workforce concentration, not factories.

### PSI Network Files

| File | Features | Description |
|---|---|---|
| `data_psi_sites.geojson` | 544 | Geocoded PSI test centers. Properties include core site info + performance, Optimus, and lease data joined in. See below for full property list. |
| `data_psi_radii.geojson` | 544 | Accurate 50-mile geographic polygons (haversine, 64 points). Must stay 1:1 with sites — run `regen_radii.js` after any coordinate changes. |
| `data_psi_performance.json` | 749 records | Reference copy of raw performance data (not loaded by the map). |

**`data_psi_sites.geojson` property schema** (key fields):
```
id, name, propertyType, category (OO|3P), address, city, state, zip, geocodeSource
scoreBucket (1-5), scoreRaw, cdVolume, avgMonthlyVol, seats, zdTicketRate, dispRate, reschdRate, dmaRegion
optimusScore (0-1), optimusTier (A|B|C), fy25Volume, fy25Utilization, priority, quickWins
osDate, oc01–oc09 (category scores 0-1), adaFlag, brandingFlag
leaseAction, leaseStatus, daysRemaining, leaseUtilization, monthlyRevenue, contractFlag, recommendedAction, licensureNote, leaseExpiry
criticalOptimus (boolean — currently only site 5129)
phone, email (added for verified sites)
```

### Tools / Source Data

All live in `tools/` and are **not served to the browser**:
- `psi_raw.json` — raw export of all 594 sites from the PSI Excel file
- `optimus_raw.json`, `optimus_categories.json` — Optimus Summary + Category Details exports
- `lease_raw.json`, `lease_flags_raw.json`, `lease_crosswalk.json` — lease data exports and join results
- `performance_raw.json` — performance data export
- `governance_report.md` — latest governance check output

Source Excel files live outside the repo at:
`C:\Users\Samad.Khan\OneDrive - ...\PSI Documents - ASK\Channel PSI\4. Work Documents\Big Foot - US Network Gap Analysis\PSI\`

---

## IRS Clearance Overlay

### Pipeline paths

**Pipeline root:**
```
C:\Users\Samad.Khan\OneDrive - Educational Testing Service\Documents\PSI Documents - ASK\Channel PSI\4. Work Documents\IRS\IRS_Map_Pipeline\
```

**Export script:**
```
IRS_Map_Pipeline\scripts\export_irs_for_bigfoot.js
```

**Source data:**
```
IRS_Map_Pipeline\data\Status Query - Partner.xlsx
IRS_Map_Pipeline\data\Active Test Center List With Address 20 May 2026.xlsx
```

**Output files:**
```
IRS_Map_Pipeline\output\irs_clearance_data.json
IRS_Map_Pipeline\output\irs_city_summary.json
IRS_Map_Pipeline\output\irs_state_summary.json
IRS_Map_Pipeline\output\irs_pipeline_log.txt
```

### Bigfoot GeoJSON (read in place — do not copy or move)

```
C:\Users\Samad.Khan\OneDrive - Educational Testing Service\Documents\PSI Documents - ASK\Channel PSI\4. Work Documents\Big Foot - US Network Gap Analysis\Development\project-bigfoot\public\data\data_psi_sites.geojson
```

### To refresh the map data

1. Security team updates Status Query on SharePoint
2. OneDrive syncs automatically (or download manually)
3. Run: `node scripts/export_irs_for_bigfoot.js` from `IRS_Map_Pipeline\` folder
4. Run: `node tools/join_irs.js` from Bigfoot project folder
5. Map reflects latest IRS clearance data

---

## Priority Cities

Source: US Census population data (Plotly top-1000 cities CSV).
Top 2 most populous cities per state selected automatically.
101 cities total (2 per state × 50 states + Washington DC).
No Master Tracker dependency. Refresh by running:
`node tools/export_priority_cities.js` from the Bigfoot project root.

Output file: `public/data/priority_cities.geojson` (101 features, all `isPriority: true`).

Diamond icon encoding on the map (`'icon-rotate': 45` applied to square SVG):
- **Green + gold border** — PSI site present AND IRS clearance in city
- **Green + green border** — PSI site present, no clearance yet
- **Red + gold border** — No PSI site, but IRS clearance exists in city
- **Red + red border** — Coverage gap, no PSI presence

`cityStateKey` format: `City|StateName` (pipe-separated, exact case from Census data).
Used by `join_irs.js` to set `inPriorityCity` on PSI site features.

---

## Visual Modes

The map has three mutually exclusive O&O coloring modes plus independent overlays:

| Mode | Trigger | O&O color | 3P color | Dot size |
|---|---|---|---|---|
| Normal | default | amber `#f59e0b` | type-specific | fixed |
| Performance | `togglePerformanceMode()` | amber scale by bucket | blue scale by bucket | log(cdVolume) |
| Optimus | `toggleOptimusMode()` | green/indigo/orange by tier | normal type colors | optimusScore × 10 |

Independent overlays (work in any mode):
- **50-mile radii** — `showRadii` — dashed rings per type color
- **Lease Intelligence** — `showLeaseIntel` — action-colored outline rings + amber pulse for contract flags
- **Critical Optimus** — `psi-critical-optimus` layer — always renders, red pulse for `criticalOptimus=true` sites

---

## Known Issues (from `tools/governance_report.md`)

**Critical (FAIL):**
- **19 of 563 US sites missing from GeoJSON** — mainly VI/PR territories and sites with non-standard addresses that failed geocoding (Daleville AL, Fairbanks AK, Harrison AR, etc.)
- **Site 5129 (NEW PROVIDENCE, NJ)** — Optimus score 28.6% (only site below 40%). `criticalOptimus: true` is set. Has red pulse ring on map. Needs immediate facilities review.

**Warnings (WARN):**
- 10 sites share duplicate coordinates (same building, different suites) — `fix_duplicate_coords.js` has been run to apply 20m offsets, but root geocodes remain identical for suite-level resolution
- PSI Authorized count 351 vs expected ~397 (46 ungeocoded sites)
- 32 O&O sites operating on expired leases ($3.4M monthly revenue)
- 4 lease sites permanently unmatched: El Paso TX, Towson MD, Colorado Springs CO, Philadelphia/Lanham MD
- No O&O site achieves Tier A Optimus score (≥85%) — avg is 66.5%
- Manufacturing layer is power plant data, not factories (known disclosure item)
- WRI power plant data is from 2021 — may be outdated

---

## What Was Last Worked On

1. **Governance check** — `tools/governance_check.js` runs 47 automated checks across all data files and produces `tools/governance_report.md`
2. **Site 5129 remediation** — coordinates corrected by 3.36 km (geocoder drift), properties updated with verified details, `criticalOptimus` flag added, pulsing red ring added to map
3. **Duplicate coordinate fix** — 16 sites across 6 groups offset by ~20m so they are individually clickable
4. **Optimus info card** — always shown for O&O sites regardless of mode; includes 9-category score grid with mini progress bars, ADA/branding flags, score progress bar
5. **Lease Intelligence layer** — action-colored rings over existing dots, contract flag amber pulse, info card section, legend with revenue callout
6. **Filter panel** — collapsible panel below header with state multi-select, performance tier checkboxes (gated on performanceMode), Optimus tier checkboxes (gated on optimusMode)

---

## Next Steps (Phase 2)

**Data quality — high priority:**
- Recover 19 ungeocoded sites (manually verify coordinates)
- Replace circular metro approximations with real Census CBSA polygons (requires FastAPI backend to bypass CORS)
- Monthly volume sparklines from `PSI USA Test Center CD Vol by Month_Jan '24 - Dec '25.xlsx` (File 3)

**Data quality — medium priority:**
- Replace FDIC 10k sample with full paginated coverage (~70k branches)
- Replace healthcare model with CMS Provider of Services data
- Replace railway model with Amtrak open data + GTFS feeds
- Replace cultural model with IMLS Museum Data Files (35k+ museums)
- Replace agriculture model with USDA NASS data
- Replace government model with GSA Federal Real Property Profile

**Map features:**
- DMA Region boundary layer (data already present in `dmaRegion` property)
- Monthly volume trend sparkline in click card (File 3 data available)
- Displacement/reschedule reason breakdown in click card (File 4 data available)
- Assess-Close action type needs dedicated visual treatment (currently Review purple)
