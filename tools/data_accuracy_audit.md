# Project Big Foot — Data Accuracy Audit

_Generated: 2026-06-03 18:51 UTC_

---

## Part 1 — Optimus Completeness (O&O Sites Only)

### Classification Summary

| Status | Count | Definition |
|---|---|---|
| **no_data** | **15** | No Optimus audit on record — site not in the Optimus system |
| **incomplete** | **2** | Audit started but ≥4/9 category scores are null (images/data never submitted) |
| **sound** | **49** | Complete data, Tier A or B |
| **weak** | **75** | Complete data, Tier C |
| _Total O&O_ | _141_ | |

> **Threshold**: a site is classified INCOMPLETE when ≥4 of 9 category scores are null, indicating that photo or condition data was never submitted for a material share of the inspection areas.

---

### INCOMPLETE Sites (2)

These sites have a tier assigned but are missing most of their category evidence. Their overall score is computed from only the categories that were submitted, so the score **understates quality** (remaining categories default to 0 in the calculation).

| ID | Name | City, State | Score | Tier | Missing | Null Categories |
|---|---|---|---|---|---|---|
| 5129 | NEW PROVIDENCE - Murray Hill Office Center | New Providence, New Jersey | 28.6% | C | 6/9 null | Site Exterior, Testing Rooms, Restrooms, Employee / Storage, ADA Compliance, Private Room |
| 72 | MYRTLE BEACH | MYRTLE BEACH, South Carolina | 47.2% | C | 5/9 null | Site Exterior, Restrooms, ADA Compliance, Signage & Branding, Private Room |

**Site 5129 (NEW PROVIDENCE) note:** Only Site Exterior (oc01), Testing Rooms (oc04), Restrooms (oc05), Employee/Storage (oc06), ADA Compliance (oc07), and Private Room (oc09) were never submitted. The three submitted categories score 75%, 70%, and 95% — these are not failing metrics. The 28.6% overall score is an artifact of zero-filling six missing categories, not a reflection of site condition.

**Site 72 (MYRTLE BEACH) note:** Five categories missing. The submitted scores include a low 45% for Entrance & Lobby, suggesting real issues exist, but the overall 47.2% score includes zero-fill penalty. The site should be re-audited with complete photo evidence before being actioned.

---

### NO_DATA Sites (15 — sample of 10)

| ID | Name | City, State |
|---|---|---|
| 17067 | PSIQA-KALA | glendale, California |
| 5714 | WALNUT CREEK | Walnut Creek, California |
| 133 | PUEBLO | Pueblo, Colorado |
| 12752 | PSI Chicago (SfE) | Chicago, Illinois |
| 19168 | SPRINGFIELD IL (ILES AVE) | Springfield, Illinois |
| 44 | WEST DES MOINES | W. DES MOINES, Iowa |
| 17279 | Olathe - GPS NHA QA | Olathe, Kansas |
| 11315 | PSI LAB 1.2 - OLATHE | Olathe, Kansas |
| 11240 | PSI LAB 2 - OLATHE | Olathe, Kansas |
| 11241 | PSI LAB 3 - OLATHE | Olathe, Kansas |

_...and 5 more_

---

### WEAK Sites Below 50% — criticalOptimus = TRUE (1)

These sites have **complete data** (fewer than 4 null categories) and a score below 50%, indicating genuine facility problems — not data gaps.

| ID | Name | City, State | Score | Tier |
|---|---|---|---|---|
| 5010 | MACON | Macon, Georgia | **48.3%** | C |

---

### SOUND Sites — Top 5

| ID | Name | Score | Tier |
|---|---|---|---|
| 6115 | DIAMOND BAR | 80.2% | B |
| 6712 | AGOURA HILLS | 73.4% | B |
| 5019 | BAKERSFIELD | 73.4% | B |
| 5029 | FRESNO | 70.6% | B |
| 5020 | CARSON | 70.2% | B |

---

### criticalOptimus Flag Correction

**Dropped** (INCOMPLETE data, not genuinely failing): Site 5129 — NEW PROVIDENCE - Murray Hill Office Center

**Added** (genuinely low score, complete data): Site 5010 — MACON (48.3%)

**New rule**: `criticalOptimus = true` only when `optimusStatus = "weak"` AND `optimusScore < 0.50`. INCOMPLETE sites are excluded regardless of their nominal score.

---

### Re-Audited Sites (20 sites appear 2–3× in optimus_raw.json)

The Optimus Excel file contains 147 rows but only 126 unique site IDs. 20 sites were audited more than once. The join uses the **last occurrence** in the file, which may not be the most recent audit date.

| ID | Name | Audits | Scores | Tiers |
|---|---|---|---|---|
| 53 | MONTGOMERY | 2 | 16.7% → 61.0% | C → C |
| 57 | BRISTOL | 2 | 60.7% → 57.7% | C → C |
| 59 | ERIE | 2 | 72.5% → 57.7% | B → C |
| 60 | GREENSBURG | 2 | 40.9% → 66.7% | C → C |
| 63 | PHILADELPHIA | 2 | 64.5% → 73.6% | C → B |
| 64 | PITTSBURGH | 2 | 63.1% → 67.5% | C → C |
| 98 | JOHNSON CITY | 2 | 57.5% → 58.8% | C → C |
| 143 | MCALESTER | 2 | 63.4% → 63.6% | C → C |
| 5040 | FARMINGTON | 2 | 38.8% → 66.2% | C → C |
| 5042 | NASHVILLE (1102 KERMIT DRIVE) | 2 | 54.4% → 66.1% | C → C |
| 5135 | BRICK | 2 | 54.4% → 65.0% | C → C |
| 5584 | MILFORD | 2 | 60.0% → 58.9% | C → C |
| 5617 | CHICAGO | 2 | 66.4% → 67.1% | C → C |
| 9001 | SOUTHFIELD - LAHSER ROAD | 2 | 69.1% → 66.7% | C → C |
| 9677 | ATLANTA (Marietta) | 2 | 71.3% → 73.8% | B → B |
| 10255 | ATLANTA (DULUTH) | 2 | 74.1% → 75.0% | B → B |
| 11553 | BRONX | 2 | 70.3% → 76.1% | B → B |
| 11555 | BROOKLYN | 2 | 56.2% → 60.8% | C → C |
| 12237 | TULSA (EAST 51ST) | 2 | 72.0% → 63.3% | B → C |
| 18969 | ST. LOUIS (BARRETT PARKWAY) | 3 | 66.6% → 69.4% → 71.4% | C → C → B |

> ⚠️ For sites where the tier changed between audits (e.g., B→C or C→B), the join result depends on file row order, not submission date. Consider de-duplicating optimus_raw.json by keeping the row with the latest `submissionDate` before re-running `join_optimus.js`.

---

## Part 2 — Count Reconciliation

### Authoritative Network Counts

| Entity | Raw (psi_raw) | Geocoded (GeoJSON) | Gap | Cause |
|---|---|---|---|---|
| **All sites (all countries)** | 594 | — | — | Source of truth |
| **All US + territories** | 563 | 544 | 19 | 19 failed geocoding |
| **Canada** | 31 | 0 | 31 | Excluded by design |
| **O&O (PSI Owned)** | **143** | **141** | **2** | See note below |
| **PSI Authorized** | 397 | 351 | 46 | 30 Canada + 16 ungeocoded US |
| **MG TESTING** | 33 | 32 | 1 | 0 Canada + 1 ungeocoded US |
| **TD TESTING** | 20 | 20 | 0 | 0 Canada + 0 ungeocoded US |
| **AMP Authorized** | 1 | 0 | 1 | Only site is Canada (Saskatoon SK) — excluded by design |

### Clearing Up the O&O Confusion (143 vs 147)

| Figure | Value | Source | Explanation |
|---|---|---|---|
| 143 | Raw O&O in psi_raw.json | psi_raw.json | The authoritative active O&O network — **all are US, 0 Canada** |
| 141 | Geocoded O&O in GeoJSON | data_psi_sites.geojson | 143 minus 2 that failed geocoding (PSI LAB 1 OLATHE, WEST KY PRACTICAL) |
| 147 | Rows in optimus_raw.json | optimus_raw.json export | **Not 147 unique sites** — 147 rows including 20 sites audited twice (20 extra rows) and 1 site audited three times (2 extra rows) |
| 126 | Unique IDs in Optimus | optimus_raw.json | True unique site count. 126 − 141 = **15 O&O sites never audited** |
| **126** | **O&O with Optimus data** | Joined GeoJSON | **This is the correct figure to cite** |

The "147" figure should not appear in any public count — it is an artifact of re-audit rows in the Optimus file, not a count of distinct sites.

### Clearing Up the PSI Authorized Gap (351 vs 397)

| Figure | Value | Explanation |
|---|---|---|
| 397 | All PSI Authorized globally | Includes all countries |
| 367 | US + territories | 397 minus 30 Canadian sites |
| 351 | Geocoded in GeoJSON | 367 US+territory minus 16 that failed geocoding |
| **46 gap** | = 30 Canada + 16 ungeocoded | Both are intentional/known — not missing data |

### Expired Lease Count — 32 (repo) vs 66 (Neal)

| Figure | Value | Source |
|---|---|---|
| **32** | Expired leases in this repo | PSI_Lease_Review_Simple (2).xlsx — **63 O&O sites**, dated May 28, 2026 |
| **66** | Neal's figure | Almost certainly from a **different or newer lease file** that either: (a) covers a broader date range, (b) includes 3P sites, or (c) is a more recent export. No file in this repo supports 66. |

> **Action required**: Ask Neal which source file his 66 figure comes from and whether it replaces the 63-site file in this repo. If so, replace `tools/lease_raw.json` with the new export and re-run `node tools/join_lease.js`.

The repo's 63-site lease file covers **O&O only**. It contains 63 rows, 32 of which are EXPIRED. No 3P lease data exists in this repo.

---

## Files Updated

| File | Change |
|---|---|
| `public/data/data_psi_sites.geojson` | Added `optimusStatus` (no_data/incomplete/sound/weak) to all features; corrected `criticalOptimus` |
| `tools/data_accuracy_audit.md` | This file |

## Recommended Follow-Up

1. **Optimus re-audits**: Sites 5129 and 72 should be re-submitted to the Optimus system with complete photo evidence before being included in any quality league table.
2. **De-duplicate Optimus**: Update `join_optimus.js` to keep the latest `submissionDate` per site when duplicates exist (affects 20 sites, some of which changed tier between audits).
3. **Lease file from Neal**: Obtain and replace the 63-site lease file if Neal's 66-expired figure comes from a broader/newer source.
4. **15 never-audited O&O sites**: These are not in Optimus at all — request audits be scheduled.
