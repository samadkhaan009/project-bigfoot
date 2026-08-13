# CBSA / MSA Join Report — Project Big Foot (Phase 1)

_Data pipeline: HUD ZIP-CBSA (Mar 2026) → Census delineation (2020 + 2023 supplement) → PSI sites → per-CBSA summary._

## Site assignment

| Metric | Count |
|---|---|
| Total PSI sites processed | 554 |
| Matched to a CBSA (numeric code) | 529 |
| Tagged NON-METRO | 14 |
| Null ZIP (no match possible) | 11 |
| Unique CBSAs with ≥1 PSI site | 294 |
| CBSAs with irsActivated > 0 | 127 |
| CBSAs matched to a 2024 population | 231 / 294 |

## Top 10 CBSAs by site count

| Rank | CBSA | Code | Sites | O&O | 3P | Pop 2024 | IRS Activated |
|---|---|---|---|---|---|---|---|
| 1 | New York-Newark-Jersey City, NY-NJ | 35620 | 31 | 6 | 25 | 19,940,274 | 7 |
| 2 | Chicago-Naperville-Elgin, IL-IN | 16980 | 17 | 2 | 15 | 9,408,576 | 2 |
| 3 | Non-Metro | NON-METRO | 14 | 2 | 12 | 0 | 2 |
| 4 | Los Angeles-Long Beach-Anaheim, CA | 31080 | 13 | 7 | 6 | 12,927,614 | 6 |
| 5 | Miami-Fort Lauderdale-West Palm Beach, FL | 33100 | 11 | 0 | 11 | 6,457,988 | 3 |
| 6 | Atlanta-Sandy Springs-Roswell, GA | 12060 | 11 | 2 | 9 | 6,411,149 | 2 |
| 7 | Dallas-Fort Worth-Arlington, TX | 19100 | 10 | 3 | 7 | 8,344,032 | 3 |
| 8 | Washington-Arlington-Alexandria, DC-VA-MD-WV | 47900 | 9 | 0 | 9 | 6,436,489 | 1 |
| 9 | Boston-Cambridge-Newton, MA-NH | 14460 | 7 | 0 | 7 | 5,025,517 | 1 |
| 10 | Seattle-Tacoma-Bellevue, WA | 42660 | 7 | 0 | 7 | 4,145,494 | 1 |

## ZIPs that failed to match the HUD crosswalk (first 10)

- 75962
