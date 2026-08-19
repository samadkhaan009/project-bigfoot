# CBSA / MSA Join Report — Project Big Foot (Phase 1)

_Data pipeline: HUD ZIP-CBSA (Mar 2026) → Census delineation (2020 + 2023 supplement) → PSI sites → per-CBSA summary._

## Site assignment

| Metric | Count |
|---|---|
| Total PSI sites processed | 4069 |
| Matched to a CBSA (numeric code) | 3547 |
| Tagged NON-METRO | 462 |
| Null ZIP (no match possible) | 60 |
| Unique CBSAs with ≥1 PSI site | 633 |
| CBSAs with irsActivated > 0 | 127 |
| CBSAs matched to a 2024 population | 350 / 633 |

## Top 10 CBSAs by site count

| Rank | CBSA | Code | Sites | O&O | 3P | Pop 2024 | IRS Activated |
|---|---|---|---|---|---|---|---|
| 1 | Non-Metro | NON-METRO | 462 | 1 | 461 | 0 | 2 |
| 2 | Los Angeles-Long Beach-Anaheim, CA | 31080 | 168 | 6 | 162 | 12,927,614 | 6 |
| 3 | Boston-Cambridge-Newton, MA-NH | 14460 | 104 | 0 | 104 | 5,025,517 | 1 |
| 4 | Nashville-Davidson--Murfreesboro--Franklin, TN | 34980 | 83 | 1 | 82 | 2,150,553 | 1 |
| 5 | Chicago-Naperville-Elgin, IL-IN | 16980 | 57 | 2 | 55 | 9,408,576 | 2 |
| 6 | Portland-South Portland, ME | 38860 | 57 | 0 | 57 | 571,534 | 0 |
| 7 | New York-Newark-Jersey City, NY-NJ | 35620 | 57 | 6 | 51 | 19,940,274 | 8 |
| 8 | Riverside-San Bernardino-Ontario, CA | 40140 | 50 | 1 | 49 | 4,744,214 | 1 |
| 9 | Knoxville, TN | 28940 | 48 | 0 | 48 | 957,608 | 0 |
| 10 | San Francisco-Oakland-Fremont, CA | 41860 | 44 | 3 | 41 | 4,648,486 | 3 |

## ZIPs that failed to match the HUD crosswalk (first 10)

- 35609
- 96799
- 71656
- 95814-5901
- 93281
- 93216-6000
- 96127-0790
- 93610-0099
- 93610-1501
- 95814-5901
