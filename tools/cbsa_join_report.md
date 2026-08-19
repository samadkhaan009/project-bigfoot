# CBSA / MSA Join Report — Project Big Foot (Phase 1)

_Data pipeline: HUD ZIP-CBSA (Mar 2026) → Census delineation (2020 + 2023 supplement) → PSI sites → per-CBSA summary._

## Site assignment

| Metric | Count |
|---|---|
| Total PSI sites processed | 4737 |
| Matched to a CBSA (numeric code) | 4196 |
| Tagged NON-METRO | 479 |
| Null ZIP (no match possible) | 62 |
| Unique CBSAs with ≥1 PSI site | 657 |
| CBSAs with irsActivated > 0 | 127 |
| CBSAs matched to a 2024 population | 364 / 657 |

## Top 10 CBSAs by site count

| Rank | CBSA | Code | Sites | O&O | 3P | Pop 2024 | IRS Activated |
|---|---|---|---|---|---|---|---|
| 1 | Non-Metro | NON-METRO | 479 | 1 | 478 | 0 | 2 |
| 2 | Los Angeles-Long Beach-Anaheim, CA | 31080 | 184 | 6 | 178 | 12,927,614 | 6 |
| 3 | Boston-Cambridge-Newton, MA-NH | 14460 | 109 | 0 | 109 | 5,025,517 | 1 |
| 4 | Nashville-Davidson--Murfreesboro--Franklin, TN | 34980 | 88 | 1 | 87 | 2,150,553 | 1 |
| 5 | New York-Newark-Jersey City, NY-NJ | 35620 | 82 | 6 | 76 | 19,940,274 | 8 |
| 6 | Chicago-Naperville-Elgin, IL-IN | 16980 | 71 | 2 | 69 | 9,408,576 | 2 |
| 7 | Portland-South Portland, ME | 38860 | 58 | 0 | 58 | 571,534 | 0 |
| 8 | Riverside-San Bernardino-Ontario, CA | 40140 | 56 | 1 | 55 | 4,744,214 | 1 |
| 9 | Atlanta-Sandy Springs-Roswell, GA | 12060 | 54 | 2 | 52 | 6,411,149 | 2 |
| 10 | San Francisco-Oakland-Fremont, CA | 41860 | 50 | 3 | 47 | 4,648,486 | 3 |

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
