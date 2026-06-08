# IRS Clearance Overlay — Handoff for Project Bigfoot

## What This Is

This document describes how to overlay IRS security clearance data from the
PSI TCA IRS Master Tracker onto the Bigfoot map. The goal is to show IRS
clearance progress at the **site, city, and state level** on the map —
not at the individual TCA level. TCA counts appear only as detail in the
click/info card when a site is selected.

---

## Source File

**`PSI_TCA_IRS_Master_Tracker_LIVE_v3_1.xlsx`**
Location: `C:\Users\Samad.Khan\OneDrive - Educational Testing Service\Documents\PSI Documents - ASK\Channel PSI\4. Work Documents\IRS\Development\`

### Key columns used for the overlay

| Field | Column | Notes |
|---|---|---|
| TCA # | A | Unique TCA identifier |
| TCA Status | F | Active/Inactive |
| S1 Site ID | I | Primary site — join key to Bigfoot `id` |
| S1 City | K | City name |
| S1 State | L | State name |
| Site Type | M | PSI Owned vs 3rd Party (see segmentation below) |
| Submitted to IRS | BJ | Date — milestone 1 |
| Final Clearance | BP | Date — milestone 8 (site is "IRS Activated" if ≥1 TCA has this) |
| In IRS Tracker | BR | "Yes/No" — TCA is actively in the IRS process |
| Data rows | 2–1935 | |

### Segmentation logic

Use the **Segment column (BU)** — values are exactly `"O&O"` and `"3P"`. Do not use Site Type (col M) for this classification.

> Background: the live data contains Site Types of PSI Owned, PSI Authorized, MG TESTING, TD TESTING, NBSTSA, HiSET CSS, HiSET TCA, and HiSET TCAR. No "AMP" rows exist. A keyword rule on col M would misclassify NBSTSA and the three HiSET types as O&O. Column BU is the authoritative rollup (667 O&O / 1,267 3P as of this file).

At the site level (Site Summary tab), the equivalent rule is: Property Type == `"PSI Owned"` → O&O; everything else → 3P.

---

## What to Track on the Map

### Site level (dot on map)
Each PSI site dot gets these IRS properties added to its GeoJSON:

| Property | Type | Description |
|---|---|---|
| `irsActivated` | boolean | true if ≥1 TCA at this site has Final Clearance date |
| `irsCleared` | integer | Count of TCAs with Final Clearance at this site |
| `irsInProcess` | integer | Count of TCAs with In IRS Tracker = "Yes" |
| `irsTotalTCAs` | integer | Total TCA count at this site |
| `irsSubmitted` | integer | Count submitted to IRS |
| `irsSegment` | string | "PSI Owned" or "PSI 3rd Party" |

**TCA counts are NOT shown as a map visual** — they appear only in the
info card when a site is clicked.

### City level (for future city layer or filter)
Aggregate per city (State + City combination):

| Property | Description |
|---|---|
| `citySites` | Total sites in this city |
| `cityActivated` | Sites with ≥1 cleared TCA |
| `cityCleared` | Total cleared TCAs across all sites |
| `cityInProcess` | Total in-process TCAs across all sites |

### State level (for state choropleth or badge)
Aggregate per state:

| Property | Description |
|---|---|
| `stateSites` | Total sites in state |
| `stateActivated` | Sites with ≥1 cleared TCA |
| `stateCleared` | Total cleared TCAs |
| `stateInProcess` | Total in-process TCAs |
| `statePctActivated` | % of sites that are IRS activated |

---

## Visual Treatment (Suggested)

### Site dots
- **IRS Activated** (≥1 cleared TCA) → green ring/halo around existing dot
- **In Process** (≥1 TCA in process, none cleared) → amber ring
- **Not Started** (no IRS activity) → no ring / default dot appearance

This overlays cleanly on top of existing Performance/Optimus modes since
it uses a ring rather than changing the dot color.

### State layer
- Choropleth shading by `statePctActivated` — darker = more sites activated
- Or a simple badge/count label per state

### Info card (click popup)
When a site is clicked, add an IRS section showing:
- IRS Status: Activated / In Process / Not Started
- TCAs Cleared: X
- TCAs In Process: X
- Total TCAs: X
- Segment: PSI Owned / PSI 3rd Party

---

## Data Pipeline

### Step 1 — Export IRS data from Master Tracker (IRS Claude Code session)
Create `tools/export_irs_for_bigfoot.js` (ESM) in the Bigfoot project that reads the three pre-aggregated tabs from `PSI_TCA_IRS_Master_Tracker_LIVE_v3_1.xlsx` using xlsx/exceljs:

**Tab: Site Summary** (rows 2–893, all 892 sites)

| Tab column | Maps to JSON property |
|---|---|
| SiteId | join key (cast to string) |
| Site Activated? (`"✅ Activated"` / `"—"`) | `irsActivated` (boolean) |
| Cleared | `irsCleared` |
| In Process | `irsInProcess` |
| Total TCAs | `irsTotalTCAs` |
| Not Started | (informational, include if useful) |
| Property Type | `irsSegment` → `"PSI Owned"` = O&O, everything else = 3P |

**Tab: City Summary** (rows 2–484, State + City combinations)

| Tab column | Maps to JSON property |
|---|---|
| State + City | composite key |
| Total Sites | `citySites` |
| Activated Sites | `cityActivated` |
| Cleared | `cityCleared` |
| In Process | `cityInProcess` |

**Tab: State Summary** (rows 2–51, one row per state)

| Tab column | Maps to JSON property |
|---|---|
| State | key |
| Total Sites | `stateSites` |
| Activated Sites | `stateActivated` |
| Cleared | `stateCleared` |
| In Process | `stateInProcess` |
| % Sites Activated | `statePctActivated` |

Output: `tools/irs_clearance_data.json` with three top-level keys: `sites` (object keyed by SiteId string), `cities` (object keyed by `"State|City"`), `states` (object keyed by state name).

> Why these tabs instead of deriving from raw Master Tracker rows: computing from col I (S1 Site ID only) covers 548 of 892 sites and would render 102 activated dots against a headline of 118. The Summary tabs are computed by the workbook's live formulas across all S1–S10 assignments, are validated, and reconcile exactly to the Summary KPIs. Reading them is also simpler code. The CLAUDE.md warning about openpyxl applies to saving the workbook — reading it read-only/data_only here is safe.

### Step 2 — Join into GeoJSON (Bigfoot Claude Code session)
Create `tools/join_irs.js` following the same pattern as `join_performance.js`:
1. Reads `data_psi_sites.geojson`
2. Reads `tools/irs_clearance_data.json`
3. Joins on site `id`
4. Writes enriched GeoJSON back to `data_psi_sites.geojson`

### Step 3 — Add map layer in BigFootMap.jsx
1. Add `irsMode` state toggle (independent overlay, works in any mode)
2. Add ring/halo layers on `psi-sites` source filtered by `irsActivated` / `irsInProcess`
3. Add IRS section to `InfoCard` component
4. Add IRS toggle to Legend and layer panel
5. Add state choropleth option using existing states source

---

## Join Key Notes

- Bigfoot uses `id` (e.g. `"19771"`) as the site identifier — string type
- Site Summary SiteIds are purely numeric — cast to string for matching (verified: 892/892 numeric)
- Sites in Bigfoot with no matching IRS data (not yet in the process) — default all IRS properties to 0 / false
- IRS Site Summary contains 892 sites; Bigfoot currently holds ~594. Sites in the IRS tracker that have no Bigfoot dot (likely HiSET/NBSTSA types outside Bigfoot's test-center scope) will produce no-op join rows — expected, not data loss. Verify the actual id intersection after running Step 2 and log unmatched IRS SiteIds for awareness.
- Puerto Rico sites (San Juan, Bayamon, Carolina) have no rows in TCA_Data_GPS but may exist in Master Tracker — handle gracefully.

---

## Current IRS Clearance Snapshot (as of latest file open)

From the Summary tab of the Master Tracker (full 892-site basis, all S1–S10 assignments):
- Total TCAs tracked: 1,934
- In IRS clearance process: 678 (35.1%)
- Final Clearance granted: 159
- Total sites: 892
- Activated sites (≥1 cleared TCA): 118 (13.2%)
- States with an activated site: 37

These are the numbers the map should reconcile to when rendered, since the export reads the same Summary tabs.

---

## Files Referenced

| File | Location |
|---|---|
| Master Tracker | `...\IRS\Development\PSI_TCA_IRS_Master_Tracker_LIVE_v3_1.xlsx` |
| Bigfoot sites GeoJSON | `...\Big Foot - US Network Gap Analysis\PSI\public\data\data_psi_sites.geojson` |
| Bigfoot radii GeoJSON | `...\Big Foot - US Network Gap Analysis\PSI\public\data\data_psi_radii.geojson` |
| Bigfoot main component | `...\Big Foot - US Network Gap Analysis\PSI\src\components\BigFootMap.jsx` |
| IRS export script (to create) | `...\Big Foot - US Network Gap Analysis\PSI\tools\export_irs_for_bigfoot.js` |
| IRS join script (to create) | `...\Big Foot - US Network Gap Analysis\PSI\tools\join_irs.js` |
| IRS clearance data (to create) | `...\Big Foot - US Network Gap Analysis\PSI\tools\irs_clearance_data.json` |
