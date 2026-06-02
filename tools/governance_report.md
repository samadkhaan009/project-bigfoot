# Project Big Foot — Governance Report

_Generated: 2026-06-02 14:20 UTC_

---

## ❗ Site 5129 — Critical Alert

| Field | Value |
|---|---|
| TC ID | 5129 |
| Site | **NEW PROVIDENCE — Murray Hill Office Center** |
| Address | 571 Central Avenue Suite 117, New Providence NJ 07974 |
| Phone | (908) 219-4595 |
| Email | NJ.NewProvidence@psionline.com |
| Performance Tier | ✅ **Top Performer (Bucket 5)** — highest operational tier |
| Optimus Score | ❌ **28.6% — Tier C (CRITICAL)** — only site in network below 40% |
| Contradiction | Highest operational performance, worst physical facility condition |
| Coordinate Fix | Corrected by 3.36 km (census geocoder drift) — updated to (-74.4432, 40.6998) |
| Recommended Action | **Immediate facilities review and Optimus re-audit required before demo** |

> This site presents a unique risk: leadership may ask why the top-performing operational site has the worst physical quality score in the network. Prepare an explanation — likely a high-volume urban location with deferred maintenance.

---

## Executive Summary

| Metric | Value |
|---|---|
| Overall status | **❌ FAIL** |
| Total checks run | **47** |
| ✅ Passed | **35** |
| ⚠️ Warnings | **10** |
| ❌ Failed | **2** |
| Total PSI sites geocoded | **544** |
| Sites with performance data | **524** |
| O&O sites with Optimus data | **126** |
| Sites with lease intelligence | **57** |


## Data File Inventory

| Status | File | Features | Geometry | Size | Null Geom | Sample Properties |
|---|---|---|---|---|---|---|
| ✅ | `data_agriculture.geojson` | 1439 | Point | 302.4 KB | 0 null | name, city, state, type |
| ✅ | `data_airports.geojson` | 1054 | Point | 196.1 KB | 0 null | name, iata, type |
| ✅ | `data_cultural.geojson` | 1916 | Point | 389.8 KB | 0 null | name, city, state, type |
| ✅ | `data_financial.geojson` | 8557 | Point | 1774.9 KB | 0 null | name, city, state, type |
| ✅ | `data_government.geojson` | 2698 | Point | 557.8 KB | 0 null | name, city, state, type |
| ✅ | `data_healthcare.geojson` | 2215 | Point | 451.7 KB | 0 null | name, city, state, type |
| ✅ | `data_manufacturing.geojson` | 3579 | Point | 943.5 KB | 0 null | name, city, state, type, fuel, capacity_mw, owner |
| ✅ | `data_population.geojson` | 62 | Polygon | 43.5 KB | 0 null | name, population, density, type |
| ✅ | `data_psi_radii.geojson` | 544 | Polygon | 872.1 KB | 0 null | siteId, propertyType, category |
| ✅ | `data_psi_sites.geojson` | 544 | Point | 455.5 KB | 0 null | id, name, propertyType, category, address, city, state, zip |
| ✅ | `data_railway.geojson` | 1545 | Point | 313.1 KB | 0 null | name, city, state, type |
| ✅ | `data_technology.geojson` | 2737 | Point | 561.0 KB | 0 null | name, city, state, type |
| ✅ | `data_universities.geojson` | 5987 | Point | 1421.9 KB | 0 null | name, city, state, type, control |
| ✅ | `data_urban_rural.geojson` | 100 | Point | 18.3 KB | 0 null | name, classification, type |
| ✅ | `metros.geojson` | 85 | Polygon | 138.0 KB | 0 null | NAME, population_m, type |

## Coordinate Validation

| Status | Check | Detail |
|---|---|---|
| ✅ | Coords: data_psi_sites.geojson | 544/544 valid |
| ✅ | Coords: data_airports.geojson | 1054/1054 valid |
| ✅ | Coords: data_universities.geojson | 5987/5987 valid |
| ✅ | Coords: data_healthcare.geojson | 2215/2215 valid |
| ✅ | Coords: data_financial.geojson | 8557/8557 valid |
| ✅ | Coords: data_government.geojson | 2698/2698 valid |
| ✅ | Coords: data_technology.geojson | 2737/2737 valid |
| ✅ | Coords: data_manufacturing.geojson | 3579/3579 valid |
| ✅ | Coords: data_railway.geojson | 1545/1545 valid |
| ✅ | Coords: data_cultural.geojson | 1916/1916 valid |
| ✅ | Coords: data_agriculture.geojson | 1439/1439 valid |
| ✅ | Coords: data_urban_rural.geojson | 100/100 valid |
| ✅ | Polygon rings: metros.geojson | 85 polygons — 85 closed, 0 unclosed |
| ✅ | Polygon rings: data_population.geojson | 62 polygons — 62 closed, 0 unclosed |

## PSI Site Data Validation

| Status | Check | Detail |
|---|---|---|
| ✅ | PSI geocoding coverage | 544/563 US+territory sites geocoded (96.6%) |
| ✅ | No duplicate TC IDs | No duplicates found |
| ⚠️ | No duplicate coordinates | 10 sites share exact coordinates |
| ✅ | Property types valid | All property types match expected set |
| ✅ | Radii 1:1 with sites | Sites: 544  Radii: 544 |
| ❌ | Missing site check | 19 of 563 US sites not in GeoJSON: St Croix - University of the Virgin Islands, St Thomas - University of the Virgin Islands, Daleville - Southeast Community Training Center, Fairbanks - University of Alaska, Harrison - North Arkansas College… |

## Performance Data Join

| Status | Check | Detail |
|---|---|---|
| ✅ | Performance join coverage | 524/544 sites matched (96.3%) |
| ✅ | Score bucket distribution | 1:13 2:119 3:169 4:167 5:56 |
| ✅ | Volume data | Min:7 Max:45,061 Avg:5,108 — 20 with zero/null volume |
| ✅ | Seats outlier check | No seats > 200 |

## Optimus Data Join

| Status | Check | Detail |
|---|---|---|
| ✅ | Optimus join coverage | 126/141 O&O sites matched (89.4%) |
| ✅ | Optimus tier distribution | Tier A:0 Tier B:49 Tier C:77 |
| ✅ | Optimus score range | Min:28.6% Max:82.3% Avg:66.5% |
| ⚠️ | Tier A candidates (≥85%) | No site currently achieves Tier A (≥85%) |
| ❌ | Critical score sites (<40%) | 1 critical: 5129(29%) |

## Lease Data Join

| Status | Check | Detail |
|---|---|---|
| ✅ | Lease join coverage | 57 sites with lease data |
| ✅ | Lease action distribution | Renew:35 Relocate:10 Refurbish:6 Renew+Expand:3 Assess-Close:2 Review:1 |
| ⚠️ | Expired lease count | 32 sites with EXPIRED status |
| ✅ | Contract flags | 7 sites with contractFlag=true (expected 7) |
| ✅ | 3P sites with lease data | Lease data correctly applied to O&O sites only |
| ✅ | Revenue data integrity | Total: $8.2M — Min: $12,167 Max: $597,891 Avg: $146,127/mo |
| ✅ | Crosswalk confidence | HIGH:55 MEDIUM:4 UNMATCHED:4 |

## Governance Flags (A–G)

| Status | Check | Detail |
|---|---|---|
| ⚠️ | CHECK A — Manufacturing labeling | Layer labeled "Manufacturing" but contains energy/power plant data. Fuel types found: Industrial Energy (Gas), Industrial Energy (Oil), Industrial Energy (Coal), Industrial Energy (Biomass), Industrial Energy (Waste), Industrial Energy (Nuclear) |
| ⚠️ | CHECK B — Population coverage | 62 features of 3,144 US counties (2.0%) — layer covers high-density zones only |
| ⚠️ | CHECK C — Metro shape accuracy | 85 metro areas — avg aspect ratio 1.27 — irregular — 0 wider than 3° |
| ✅ | CHECK D — 50-mile radius accuracy | 5-ring sample avg radius: 50.00 miles (target 50.0) — max deviation: 0.0% |
| ⚠️ | CHECK E — Urban/Rural completeness | 100 points — Major Urban:30 Urban:34 Rural Hub:36 — 0 outside US bounds — manually curated starter set, not comprehensive |
| ✅ | CHECK F — Duplicate site IDs | 0 duplicate TC IDs |
| ⚠️ | CHECK F — Duplicate coordinates | 10 sites share exact coordinates |
| ⚠️ | CHECK G — Data freshness | NCES universities 2023, WRI power plants 2021, FDIC 2026, Optimus 2025, Lease May 2026 — WRI power plants may be outdated |

## Cross-Layer Consistency (H–J)

| Status | Check | Detail |
|---|---|---|
| ⚠️ | CHECK H — Property type counts | PSI Authorized: got 351, expected ~397 |
| ✅ | CHECK I — Perf tier sum = total sites | Buckets sum(524) + no-data(20) = 544 — total sites = 544 |
| ✅ | CHECK J — Radii = sites | Sites: 544  Radii: 544 |

---

## Critical Issues (FAIL) — Action Required Before Demo

- **Missing site check**: 19 of 563 US sites not in GeoJSON: St Croix - University of the Virgin Islands, St Thomas - University of the Virgin Islands, Daleville - Southeast Community Training Center, Fairbanks - University of Alaska, Harrison - North Arkansas College…
- **Critical score sites (<40%)**: 1 critical: 5129(29%)

---

## Warnings (WARN) — Monitor or Disclose

- **No duplicate coordinates**: 10 sites share exact coordinates
- **Tier A candidates (≥85%)**: No site currently achieves Tier A (≥85%)
- **Expired lease count**: 32 sites with EXPIRED status
- **CHECK A — Manufacturing labeling**: Layer labeled "Manufacturing" but contains energy/power plant data. Fuel types found: Industrial Energy (Gas), Industrial Energy (Oil), Industrial Energy (Coal), Industrial Energy (Biomass), Industrial Energy (Waste), Industrial Energy (Nuclear)
- **CHECK B — Population coverage**: 62 features of 3,144 US counties (2.0%) — layer covers high-density zones only
- **CHECK C — Metro shape accuracy**: 85 metro areas — avg aspect ratio 1.27 — irregular — 0 wider than 3°
- **CHECK E — Urban/Rural completeness**: 100 points — Major Urban:30 Urban:34 Rural Hub:36 — 0 outside US bounds — manually curated starter set, not comprehensive
- **CHECK F — Duplicate coordinates**: 10 sites share exact coordinates
- **CHECK G — Data freshness**: NCES universities 2023, WRI power plants 2021, FDIC 2026, Optimus 2025, Lease May 2026 — WRI power plants may be outdated
- **CHECK H — Property type counts**: PSI Authorized: got 351, expected ~397

---

## Recommendations (Priority Order)

- Run geocoding scripts to recover remaining sites
- Target Tier A through facility improvements
- Immediate action required for critical-score sites
- Priority: resolve expired leases — liability and operations risk
- Manually resolve 4 unmatched lease sites
- Rename layer to "Industrial Energy Sites" or update DATA_QUALITY note to clarify data represents power plants, not factories
- Expand population layer to include more counties for gap analysis
- Replace with real Census CBSA boundary polygons via Phase 2 FastAPI proxy
- Expand to full algorithmic urban/rural classification once test-taker ZIP data is available
- Plan annual refresh of WRI power plant data and NCES enrollment figures
- Some expected site type counts differ — verify PSI site list completeness
