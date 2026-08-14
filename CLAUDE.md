# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What Is Project Big Foot

A React/Vite web application built for PSI/ETS that maps the PSI test center network against US market intelligence layers. It is a **strategic planning and gap analysis tool** used by PSI leadership to identify coverage gaps, assess site quality, and make network decisions. The platform also includes an AI chat assistant (Big Foot Assistant) powered by the Anthropic API that answers questions about the network using live map data.

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

**DEPLOYMENT PATTERN (confirmed working Aug 2026):**
- Build must run from the real project path (OneDrive path) — the `C:\bf` junction causes rolldown to mis-resolve `index.html`
- Deploy (`npm.cmd run deploy` / gh-pages) must run from `C:\bf` — the short path avoids the 260-char Windows path limit that breaks gh-pages
- git PATH: add GitHub Desktop bundled git before deploying:
  ```powershell
  $env:PATH += ';$env:LOCALAPPDATA\GitHubDesktop\app-3.6.4\resources\app\git\cmd'
  ```
  (check app version in `%LOCALAPPDATA%\GitHubDesktop\` if this fails — version number changes on GitHub Desktop updates)

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
| `data_cbsa_boundaries.geojson` | 935 | Census CBSA 2023 boundaries (replaces metros.geojson) | REAL |
| _(states)_ | 51 | PublicaMundi CDN / Census TIGER | REAL (external URL) |

> Removed layers (data files retained, not wired to map): `metros.geojson` (superseded by CBSA boundaries), `data_population.geojson` (incomplete, 62 counties only), `data_urban_rural.geojson` (manually curated, 100 points).

> ⚠️ `data_manufacturing.geojson` is labeled "Manufacturing" in the UI but contains WRI **power plant** data. It is a proxy for heavy industrial workforce concentration, not factories.

### PSI Network Files

| File | Features | Description |
|---|---|---|
| `data_psi_sites.geojson` | 4,252 | Geocoded active US PSI test centers (4,250 native + 2 IRS synthetic). Properties include core site info + performance, Optimus, lease, IRS clearance, cbsaCode, cbsaName joined in. See below for full property list. |
| `data_psi_radii.geojson` | 677 | 50-mile geographic polygons (haversine, 64 points) for O&O + PSI Authorized only (not the full network). Run `regen_radii.js` after coordinate changes. |
| `data_psi_performance.json` | 749 records | Reference copy of raw performance data (not loaded by the map). |
| `data_cbsa_summary.json` | 677 records | MSA market summary (633 covered + 43 gap markets with population data). |
| `data_cbsa_boundaries.geojson` | 935 features | Census CBSA boundary polygons (2023 definitions), joined with summary. |
| `priority_cities.geojson` | 143 features | Top 3 cities per state by Census population, numbered diamond markers. |

**Property types in network (active US sites):**
```
PSI Owned: 319 · PSI Authorized: 356 · HiSET CSS: 985
HiSET TCA: 789 · HiSET TCAR: 798 · NBSTSA: 527
ETS STN: 233 · USPS: 95 · ONE-OFF TESTING: 67
MG TESTING: 52 · TD TESTING: 19 · Client Site: 8
Innovative Exams: 2
Source: Test Center List With Address 14 August 2026.xlsx
```

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
IRS_Map_Pipeline\data\16th July Active Test Center List With Address (1).xlsx
```

**Output files:**
```
IRS_Map_Pipeline\output\irs_clearance_data.json
IRS_Map_Pipeline\output\irs_city_summary.json
IRS_Map_Pipeline\output\irs_state_summary.json
IRS_Map_Pipeline\output\irs_pipeline_log.txt
```

### Key pipeline decisions (locked)
- Activation definition: ISLA Granted OR Final Clearance >= 1
- Current activated count: 168 sites (Aug 2026 refresh)
- MOBILE TCAs: excluded (no fixed site address)
- Site 18217 London-Ampra: excluded (Canadian site)
- Site 18897 Duluth CBT: absent from Status Query entirely
- Master Tracker: PARKED. Status Query is sole authoritative IRS data source.
- Pipeline uses header-name lookup (not column indices) — immune to future Status Query schema shifts
- Partner TCAs sheet now carries City and State columns natively (added by Security team) — address file no longer needed for partner city/state assignment
- 8 synthetic features: PSI sites present in Status Query but absent from core GeoJSON, placed via FALLBACK_SITES coordinate map. Tagged irsSyntheticFeature=true.

### MOBILE exclusion
MOBILE entries in the Status Query represent MG Testing mobile examiners with no fixed site. These are excluded from the pipeline. Log entry: 'Excluded (MOBILE/no fixed site): N'

### Canonical IRS numbers (do not cite superseded figures)
| Figure | Value | Notes |
|---|---|---|
| Current activated | 168 | Aug 2026, ISLA-or-Final |
| Previous (stale) | 161 | Pre-Aug 2026 refresh |
| Previous (stale) | 104 | Final-only definition |
| Previous (stale) | 118 | Master Tracker, inflated |

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
Top 3 most populous cities per state, ranked by population.
143 cities total (some states have fewer than 3 in source).
No Master Tracker dependency.

cityLevel field: 1 = most populous, 2 = second, 3 = third.

Map visual: numbered diamond markers (no color coding).
White diamond, thin #334155 border, rank number centered.
Icon variants: pc-rank-1, pc-rank-2, pc-rank-3.

50-mile radius logic: a city is siteActivated if any PSI
site within 50 miles has IRS clearance (ISLA or Final).
nearestActivated field: closest cleared site name + distance.

Aliases handled via CITY_ALIASES map in the script:
- 'spokane valley|washington' → 'spokane|washington'
- 'boise|idaho' → 'boise city|idaho'
- 'lexington|kentucky' → 'lexington-fayette|kentucky'
- 'south burlington|vermont' → 'burlington|vermont'
- 'w. des moines|iowa' → 'west des moines|iowa'

Known: Augusta-Richmond County GA handled via NAME_OVERRIDES
and GEO_FALLBACK map in export_priority_cities.js.

Refresh: node tools/export_priority_cities.js from root.
Output: public/data/priority_cities.geojson (143 features)

---

## Visual Modes

The map has three mutually exclusive O&O coloring modes plus independent overlays:

| Mode | Trigger | O&O color | 3P color | Dot size |
|---|---|---|---|---|
| Normal | default | navy `#0047BB` (PSI brand blue) | teal `#0d9488` (PSI Authorized), type-specific others | fixed |
| Performance | `togglePerformanceMode()` | amber scale by bucket | blue scale by bucket | log(cdVolume) |
| Optimus | `toggleOptimusMode()` | green/indigo/orange by tier | normal type colors | optimusScore × 10 |

Independent overlays (work in any mode):
- **50-mile radii** — `showRadii` — dashed rings per type color
- **Lease Intelligence** — `showLeaseIntel` — action-colored outline rings + amber pulse for contract flags
- **Critical Optimus** — `psi-critical-optimus` layer — always renders, red pulse for `criticalOptimus=true` sites
- **IRS Clearance** — irsMode — green rings (activated) + amber dashed rings (in process) + state choropleth
- **MSA Markets** — showCbsa — CBSA boundary polygons colored by PSI presence and population tier
- **Priority Cities** — showPriorityCities — numbered diamond markers (rank 1/2/3) for top cities per state
- **Coverage Radius** — showRadii — selectable radius (25/50/75/100/125/150 miles), default 50 miles
- **Big Foot Assistant** — isChatOpen — slide-in AI chat panel (right side), Anthropic API, claude-sonnet-4-6

---

## Known Issues (from `tools/governance_report.md`)

**Critical (FAIL):**
- **19 of 563 US sites missing from GeoJSON** — mainly VI/PR territories and sites with non-standard addresses that failed geocoding (Daleville AL, Fairbanks AK, Harrison AR, etc.)
- **Site 5129 (NEW PROVIDENCE, NJ)** — NOTE: Site 5129 New Providence score of 28.6% is a data artifact (6 of 9 Optimus categories never submitted, score is a zero-fill). Do NOT flag as critical. The one genuinely critical site is 5010 Macon GA (48.3%, complete data). criticalOptimus flag on 5129 should be reviewed.

**Warnings (WARN):**
- 10 sites share duplicate coordinates (same building, different suites) — `fix_duplicate_coords.js` has been run to apply 20m offsets, but root geocodes remain identical for suite-level resolution
- PSI Authorized count 351 vs expected ~397 (46 ungeocoded sites)
- 32 O&O sites operating on expired leases ($3.4M monthly revenue)
- 4 lease sites permanently unmatched: El Paso TX, Towson MD, Colorado Springs CO, Philadelphia/Lanham MD
- No O&O site achieves Tier A Optimus score (≥85%) — avg is 66.5%
- Manufacturing layer is power plant data, not factories (known disclosure item)
- WRI power plant data is from 2021 — may be outdated
- **8 synthetic IRS sites** — sites present in Status Query but absent from core GeoJSON. Created as synthetic features by join_irs.js via FALLBACK_SITES coordinates. Tagged irsSyntheticFeature=true. Includes Richmond Boulders II (19241) and Missoula (5995).
- **Duluth CBT (18897)** — absent from Status Query entirely. Not on map. Flagged for Security team.
- **Neal's lease count 66 vs 32** — repo supports 32 expired O&O leases. Neal's 66 likely from a broader file not yet shared.

---

## MSA Market Layer

Source: Census CBSA 2023 boundaries + HUD ZIP-to-CBSA
crosswalk (ZIP-CBSA_032026.xlsx) + Census population
estimates (cbsa-met-est2024-pop.xlsx).

Pipeline: node tools/build_cbsa.mjs from project root.

Key files:
  public/data/ZIP-CBSA_032026.xlsx (HUD crosswalk input)
  public/data/cbsa-met-est2024-pop.xlsx (population input)
  public/data/data_cbsa_summary.json (677 records output)
  public/data/data_cbsa_boundaries.geojson (935 polygons)

Canonical counts (static aggregate over all site types):
  393 US metros total (Census 2023)
  633 with PSI presence (coverageStatus: covered)
  43 gap markets with population > 0 (coverageStatus: gap)
  NOTE: the map recomputes covered/gap dynamically from the
  active PSI site toggles (cbsaDynamic in BigFootMap.jsx) —
  the summary file is the all-types-on baseline.

Color encoding:
  PSI present, large (>=1M): green #16a34a
  PSI present, mid (250K-1M): orange #ea580c
  PSI present, small (<250K): blue #3b82f6
  Gap, large (>=1M): dark red #7f1d1d
  Gap, mid (250K-1M): red #dc2626
  Gap, small: dark gray #374151
  Micropolitan (pop=0): transparent

Sub-toggles: 6 checkboxes (3 presence + 3 gap tiers).
State: cbsaFilters object in BigFootMap.jsx.

---

## Big Foot Assistant

Slide-in chat panel (right side of screen).
Trigger: 'Ask Big Foot' button in left control panel.
Powered by: Anthropic API, claude-sonnet-4-6.
API key: VITE_ANTHROPIC_API_KEY in .env (gitignored).

Context built once on first panel open:
- All 4,252 PSI site features (lean 24-field set)
- 143 priority city features with 50-mile radius data
- 457 MSA market records (data_cbsa_summary.json)
- Lease urgency: expiring90, expiring180, expired arrays
- IRS state summary, network summary totals

System prompt carries institutional knowledge:
- Canonical numbers (168 activated, ISLA-or-Final)
- Known exceptions (Duluth, 8 synthetic sites, Macon 5010)
- Business context (O&O break-even ~6-8K, Neal/Dwayne/Jim)
- Definition: 'gap market' = coverageStatus gap (no PSI
  sites), NEVER IRS unactivated

Multi-turn conversation per session. Stateless between
sessions (no memory persistence).

---

## Canonical Numbers of Record (Aug 2026)

| Metric | Value | Notes |
|---|---|---|
| Total sites mapped | 4,252 | 4,250 native + 2 synthetic |
| O&O sites | 319 | PSI Owned |
| 3P sites | 3,933 | All non-OO types |
| IRS activated | 168 | ISLA or Final, Aug 2026 |
| MSA covered markets | 633 | PSI presence (all types) |
| MSA gap markets | 43 | with population data |
| Priority cities | 143 | top 3 per state |
| Lease sites | 57 | with lease data |
| Expired leases | 32 | O&O |
| Optimus covered | 126 | O&O audited |
| Performance data | 561 | sites with scoreBucket |

Superseded figures (do not cite):
- 104 activated: Final-only definition, pre-Jun 2026
- 161 activated: pre-Aug 2026 Status Query refresh
- 118 activated: Master Tracker inflated figure
- 101 priority cities: pre-Aug 2026, top 2 per state

---

## What Was Last Worked On (Aug 2026)

0. Full network rebuild — 4,252 sites across 13 property
   types from Test Center List 14 Aug 2026. MSA layer now
   driven by active site toggles.
1. IRS Clearance Overlay — pipeline rebuilt with header-name
   lookup, MOBILE exclusion, 168 activated sites, synthetic
   feature fix, flat green rings, ISLA-or-Final definition
2. MSA Market Layer — CBSA boundaries, ZIP-to-CBSA join,
   population tiers, gap markets, 6-category sub-toggles
3. Big Foot Assistant — full context (4,252 sites, priority
   cities, lease urgency, MSA markets), institutional system
   prompt, gap market disambiguation
4. Priority Cities — rebuilt from Census (top 3 per state,
   143 cities, numbered diamonds, 50-mile radius logic)
5. Coverage Radius — selectable 25-150 miles
6. Layer cleanup — removed Metro Areas, Population Density,
   Urban/Rural Zones (superseded or incomplete)
7. Dot colors — O&O navy #0047BB, 3P teal #0d9488
8. GitHub Pages — deployed at samadkhaan009.github.io/
   project-bigfoot/

---

## Roadmap (Next Sessions)

High priority:
- Prometric competitor layer (September 30 deadline)
- Lease decision report for Jim Metzger (data ready)
- Neal's 66 vs 32 expired lease reconciliation
- QA audit of all platform numbers vs source data

Medium priority:
- MSA market filter export (Excel/CSV from assistant)
- Volume mode correlation with MSA market layer
- header-name lookup already in IRS pipeline — extend
  pattern to other join scripts
- Blueprint v4 documentation update

Lower priority:
- Synthetic sites → native GeoJSON features
- WRI power plant layer rename (currently 'Manufacturing')
- NCES universities refresh when HD2024 available
- Phase 2 backend (FastAPI, real-time data)
