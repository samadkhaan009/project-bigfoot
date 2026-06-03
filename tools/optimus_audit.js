/**
 * Optimus completeness audit + count reconciliation.
 * Adds optimusStatus to data_psi_sites.geojson, corrects criticalOptimus.
 * Writes tools/data_accuracy_audit.md
 * Run: node tools/optimus_audit.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const raw   = JSON.parse(fs.readFileSync(path.join(__dirname,'psi_raw.json'),'utf8').replace(/^﻿/,''));
const sites = JSON.parse(fs.readFileSync(path.join(ROOT,'public','data','data_psi_sites.geojson'),'utf8'));
const optR  = JSON.parse(fs.readFileSync(path.join(__dirname,'optimus_raw.json'),'utf8').replace(/^﻿/,''));
const leaseR= JSON.parse(fs.readFileSync(path.join(__dirname,'lease_raw.json'),'utf8').replace(/^﻿/,''));

const CAT_KEYS = ['oc01','oc02','oc03','oc04','oc05','oc06','oc07','oc08','oc09'];
const CAT_NAMES = {
  oc01:'Site Exterior', oc02:'Entrance & Lobby', oc03:'Reception & Waiting',
  oc04:'Testing Rooms',  oc05:'Restrooms',         oc06:'Employee / Storage',
  oc07:'ADA Compliance', oc08:'Signage & Branding', oc09:'Private Room',
};

// ── Classify each O&O site ────────────────────────────
const ooFeatures = sites.features.filter(f => f.properties.propertyType === 'PSI Owned');

const INCOMPLETE_THRESHOLD = 4; // ≥4 null cats out of 9 = material incompleteness

const classified = { no_data:[], incomplete:[], sound:[], weak:[] };
const criticalBefore = [], criticalAfter = [];

ooFeatures.forEach(f => {
  const p = f.properties;
  const nullCats  = CAT_KEYS.filter(k => p[k] == null);
  const nullCount = nullCats.length;

  let status;
  if (!p.optimusTier) {
    status = 'no_data';
  } else if (nullCount >= INCOMPLETE_THRESHOLD) {
    status = 'incomplete';
  } else if (p.optimusTier === 'A' || p.optimusTier === 'B') {
    status = 'sound';
  } else {
    status = 'weak';
  }

  p.optimusStatus = status;

  // Track old criticalOptimus
  if (p.criticalOptimus === true) criticalBefore.push(p.id);

  // New rule: only genuinely WEAK sites with complete data and score < 0.50
  const newCritical = (status === 'weak' && (p.optimusScore || 0) < 0.50);
  p.criticalOptimus = newCritical;
  if (newCritical) criticalAfter.push(p.id);

  classified[status].push({
    id: p.id, name: p.name, city: p.city, state: p.state,
    optimusScore: p.optimusScore, optimusTier: p.optimusTier,
    nullCount, nullCats, status,
  });
});

// Also stamp non-O&O sites with null optimusStatus (clean GeoJSON)
sites.features.filter(f => f.properties.propertyType !== 'PSI Owned').forEach(f => {
  f.properties.optimusStatus = null;
  f.properties.criticalOptimus = false;
});

// ── Duplicate Optimus audit entries ───────────────────
const optIdCount = {};
optR.forEach(r => { optIdCount[r.siteId] = (optIdCount[r.siteId]||0)+1; });
const reAudited = Object.entries(optIdCount).filter(([,v]) => v > 1);

// ── Count reconciliation numbers ──────────────────────
const INCL = new Set(['USA','Puerto Rico','Virgin Islands, U.S.']);

const rawAll   = raw.length;
const rawUS    = raw.filter(s => INCL.has(s.country)).length;
const rawCA    = raw.filter(s => s.country === 'Canada').length;

const rawOO    = raw.filter(s => s.propertyType === 'PSI Owned');
const rawOO_n  = rawOO.length;
const rawOO_CA = rawOO.filter(s => s.country === 'Canada').length;  // 0
const geoOO_n  = ooFeatures.length;

const rawAuth  = raw.filter(s => s.propertyType === 'PSI Authorized');
const rawAuth_CA = rawAuth.filter(s => s.country === 'Canada').length;
const rawAuth_US = rawAuth.filter(s => INCL.has(s.country)).length;
const geoAuth_n  = sites.features.filter(f => f.properties.propertyType === 'PSI Authorized').length;
const geoAuth_ungeocoded = rawAuth_US - geoAuth_n;

const rawMG    = raw.filter(s => s.propertyType === 'MG TESTING').length;
const rawMG_CA = raw.filter(s => s.propertyType === 'MG TESTING' && s.country === 'Canada').length;
const geoMG    = sites.features.filter(f => f.properties.propertyType === 'MG TESTING').length;

const rawTD    = raw.filter(s => s.propertyType === 'TD TESTING').length;
const rawTD_CA = raw.filter(s => s.propertyType === 'TD TESTING' && s.country === 'Canada').length;
const geoTD    = sites.features.filter(f => f.properties.propertyType === 'TD TESTING').length;

const rawAMP   = raw.filter(s => s.propertyType === 'AMP Authorized');
// AMP is Canadian — won't appear in GeoJSON

const optUnique = Object.keys(optIdCount).length;
const optGeoMatched = ooFeatures.filter(f => f.properties.optimusTier).length;

const leaseExpiredRepo = leaseR.filter(r => r.status === 'EXPIRED').length;
const leaseTotal = leaseR.length;

// ── Save updated GeoJSON ──────────────────────────────
fs.writeFileSync(path.join(ROOT,'public','data','data_psi_sites.geojson'), JSON.stringify(sites));

// ── Generate markdown report ──────────────────────────
const fmtPct = v => v != null ? (v*100).toFixed(1)+'%' : 'N/A';

const incompleteRows = classified.incomplete.map(s =>
  `| ${s.id} | ${s.name} | ${s.city}, ${s.state} | ${fmtPct(s.optimusScore)} | ${s.optimusTier} | ${s.nullCount}/9 null | ${s.nullCats.map(k=>CAT_NAMES[k]).join(', ')} |`
).join('\n');

const weakCritRows = classified.weak
  .filter(s => (s.optimusScore||0) < 0.50)
  .sort((a,b) => a.optimusScore - b.optimusScore)
  .map(s => `| ${s.id} | ${s.name} | ${s.city}, ${s.state} | **${fmtPct(s.optimusScore)}** | ${s.optimusTier} |`)
  .join('\n');

const noDataSample = classified.no_data.slice(0,10)
  .map(s => `| ${s.id} | ${s.name} | ${s.city}, ${s.state} |`).join('\n');

const soundSample = classified.sound.slice(0,5)
  .sort((a,b) => (b.optimusScore||0)-(a.optimusScore||0))
  .map(s => `| ${s.id} | ${s.name} | ${fmtPct(s.optimusScore)} | ${s.optimusTier} |`).join('\n');

const reAuditedRows = reAudited.map(([id,cnt]) => {
  const rows = optR.filter(r => String(r.siteId) === id);
  const scores = rows.map(r => fmtPct(r.optimusScore)).join(' → ');
  const tiers  = rows.map(r => r.optimusTier).join(' → ');
  const site   = ooFeatures.find(f => f.properties.id === id);
  const name   = site?.properties?.name || '(not geocoded)';
  return `| ${id} | ${name} | ${cnt} | ${scores} | ${tiers} |`;
}).join('\n');

const critChangeNote = (() => {
  const dropped  = criticalBefore.filter(id => !criticalAfter.includes(id));
  const added    = criticalAfter.filter(id => !criticalBefore.includes(id));
  const lines = [];
  if (dropped.length) lines.push(`**Dropped** (INCOMPLETE data, not genuinely failing): ${dropped.map(id => {
    const f = ooFeatures.find(x=>x.properties.id===id);
    return `Site ${id} — ${f?.properties?.name}`;
  }).join(', ')}`);
  if (added.length) lines.push(`**Added** (genuinely low score, complete data): ${added.map(id => {
    const f = ooFeatures.find(x=>x.properties.id===id);
    return `Site ${id} — ${f?.properties?.name} (${fmtPct(f?.properties?.optimusScore)})`;
  }).join(', ')}`);
  if (!dropped.length && !added.length) lines.push('No change — same sites flagged as before.');
  return lines.join('\n\n');
})();

const now = new Date().toISOString().slice(0,16).replace('T',' ') + ' UTC';

const report = `# Project Big Foot — Data Accuracy Audit

_Generated: ${now}_

---

## Part 1 — Optimus Completeness (O&O Sites Only)

### Classification Summary

| Status | Count | Definition |
|---|---|---|
| **no_data** | **${classified.no_data.length}** | No Optimus audit on record — site not in the Optimus system |
| **incomplete** | **${classified.incomplete.length}** | Audit started but ≥4/9 category scores are null (images/data never submitted) |
| **sound** | **${classified.sound.length}** | Complete data, Tier A or B |
| **weak** | **${classified.weak.length}** | Complete data, Tier C |
| _Total O&O_ | _${ooFeatures.length}_ | |

> **Threshold**: a site is classified INCOMPLETE when ≥4 of 9 category scores are null, indicating that photo or condition data was never submitted for a material share of the inspection areas.

---

### INCOMPLETE Sites (${classified.incomplete.length})

These sites have a tier assigned but are missing most of their category evidence. Their overall score is computed from only the categories that were submitted, so the score **understates quality** (remaining categories default to 0 in the calculation).

| ID | Name | City, State | Score | Tier | Missing | Null Categories |
|---|---|---|---|---|---|---|
${incompleteRows}

**Site 5129 (NEW PROVIDENCE) note:** Only Site Exterior (oc01), Testing Rooms (oc04), Restrooms (oc05), Employee/Storage (oc06), ADA Compliance (oc07), and Private Room (oc09) were never submitted. The three submitted categories score 75%, 70%, and 95% — these are not failing metrics. The 28.6% overall score is an artifact of zero-filling six missing categories, not a reflection of site condition.

**Site 72 (MYRTLE BEACH) note:** Five categories missing. The submitted scores include a low 45% for Entrance & Lobby, suggesting real issues exist, but the overall 47.2% score includes zero-fill penalty. The site should be re-audited with complete photo evidence before being actioned.

---

### NO_DATA Sites (${classified.no_data.length} — sample of 10)

| ID | Name | City, State |
|---|---|---|
${noDataSample}
${classified.no_data.length > 10 ? `\n_...and ${classified.no_data.length - 10} more_` : ''}

---

### WEAK Sites Below 50% — criticalOptimus = TRUE (${criticalAfter.length})

These sites have **complete data** (fewer than 4 null categories) and a score below 50%, indicating genuine facility problems — not data gaps.

| ID | Name | City, State | Score | Tier |
|---|---|---|---|---|
${weakCritRows || '_None — no WEAK sites below 50% with complete data_'}

---

### SOUND Sites — Top 5

| ID | Name | Score | Tier |
|---|---|---|---|
${soundSample}

---

### criticalOptimus Flag Correction

${critChangeNote}

**New rule**: \`criticalOptimus = true\` only when \`optimusStatus = "weak"\` AND \`optimusScore < 0.50\`. INCOMPLETE sites are excluded regardless of their nominal score.

---

### Re-Audited Sites (${reAudited.length} sites appear 2–3× in optimus_raw.json)

The Optimus Excel file contains ${optR.length} rows but only ${optUnique} unique site IDs. ${reAudited.length} sites were audited more than once. The join uses the **last occurrence** in the file, which may not be the most recent audit date.

| ID | Name | Audits | Scores | Tiers |
|---|---|---|---|---|
${reAuditedRows}

> ⚠️ For sites where the tier changed between audits (e.g., B→C or C→B), the join result depends on file row order, not submission date. Consider de-duplicating optimus_raw.json by keeping the row with the latest \`submissionDate\` before re-running \`join_optimus.js\`.

---

## Part 2 — Count Reconciliation

### Authoritative Network Counts

| Entity | Raw (psi_raw) | Geocoded (GeoJSON) | Gap | Cause |
|---|---|---|---|---|
| **All sites (all countries)** | ${rawAll} | — | — | Source of truth |
| **All US + territories** | ${rawUS} | ${sites.features.length} | ${rawUS - sites.features.length} | ${rawUS - sites.features.length} failed geocoding |
| **Canada** | ${rawCA} | 0 | ${rawCA} | Excluded by design |
| **O&O (PSI Owned)** | **${rawOO_n}** | **${geoOO_n}** | **${rawOO_n - geoOO_n}** | See note below |
| **PSI Authorized** | ${rawAll > 0 ? raw.filter(s=>s.propertyType==='PSI Authorized').length : '?'} | ${geoAuth_n} | ${raw.filter(s=>s.propertyType==='PSI Authorized').length - geoAuth_n} | ${rawAuth_CA} Canada + ${geoAuth_ungeocoded} ungeocoded US |
| **MG TESTING** | ${rawMG} | ${geoMG} | ${rawMG - geoMG} | ${rawMG_CA} Canada + ${rawMG - rawMG_CA - geoMG} ungeocoded US |
| **TD TESTING** | ${rawTD} | ${geoTD} | ${rawTD - geoTD} | ${rawTD_CA} Canada + ${rawTD - rawTD_CA - geoTD} ungeocoded US |
| **AMP Authorized** | 1 | 0 | 1 | Only site is Canada (Saskatoon SK) — excluded by design |

### Clearing Up the O&O Confusion (143 vs 147)

| Figure | Value | Source | Explanation |
|---|---|---|---|
| 143 | Raw O&O in psi_raw.json | psi_raw.json | The authoritative active O&O network — **all are US, 0 Canada** |
| 141 | Geocoded O&O in GeoJSON | data_psi_sites.geojson | 143 minus 2 that failed geocoding (PSI LAB 1 OLATHE, WEST KY PRACTICAL) |
| 147 | Rows in optimus_raw.json | optimus_raw.json export | **Not 147 unique sites** — 147 rows including ${reAudited.length} sites audited twice (${reAudited.length} extra rows) and 1 site audited three times (2 extra rows) |
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

> **Action required**: Ask Neal which source file his 66 figure comes from and whether it replaces the 63-site file in this repo. If so, replace \`tools/lease_raw.json\` with the new export and re-run \`node tools/join_lease.js\`.

The repo's 63-site lease file covers **O&O only**. It contains ${leaseTotal} rows, ${leaseExpiredRepo} of which are EXPIRED. No 3P lease data exists in this repo.

---

## Files Updated

| File | Change |
|---|---|
| \`public/data/data_psi_sites.geojson\` | Added \`optimusStatus\` (no_data/incomplete/sound/weak) to all features; corrected \`criticalOptimus\` |
| \`tools/data_accuracy_audit.md\` | This file |

## Recommended Follow-Up

1. **Optimus re-audits**: Sites 5129 and 72 should be re-submitted to the Optimus system with complete photo evidence before being included in any quality league table.
2. **De-duplicate Optimus**: Update \`join_optimus.js\` to keep the latest \`submissionDate\` per site when duplicates exist (affects ${reAudited.length} sites, some of which changed tier between audits).
3. **Lease file from Neal**: Obtain and replace the 63-site lease file if Neal's 66-expired figure comes from a broader/newer source.
4. **15 never-audited O&O sites**: These are not in Optimus at all — request audits be scheduled.
`;

fs.writeFileSync(path.join(__dirname,'data_accuracy_audit.md'), report);

// ── Console summary ───────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('OPTIMUS AUDIT + COUNT RECONCILIATION');
console.log('═'.repeat(60));
console.log('\n── Optimus classification (141 O&O sites) ──');
console.log(`  no_data    : ${classified.no_data.length.toString().padStart(3)}  (no audit on record)`);
console.log(`  incomplete : ${classified.incomplete.length.toString().padStart(3)}  (4+ null categories — data not submitted)`);
console.log(`  sound      : ${classified.sound.length.toString().padStart(3)}  (complete data, Tier A or B)`);
console.log(`  weak       : ${classified.weak.length.toString().padStart(3)}  (complete data, Tier C)`);

console.log('\n── criticalOptimus changes ──');
const dropped = criticalBefore.filter(id => !criticalAfter.includes(id));
const added   = criticalAfter.filter(id => !criticalBefore.includes(id));
if (dropped.length) {
  dropped.forEach(id => {
    const f = ooFeatures.find(x=>x.properties.id===id);
    console.log(`  DROPPED: Site ${id} (${f?.properties?.name}) — INCOMPLETE, not genuinely failing`);
  });
}
if (added.length) {
  added.forEach(id => {
    const f = ooFeatures.find(x=>x.properties.id===id);
    console.log(`  ADDED:   Site ${id} (${f?.properties?.name}) — WEAK, score ${fmtPct(f?.properties?.optimusScore)}`);
  });
}
if (!dropped.length && !added.length) console.log('  No change.');

console.log('\n── Count reconciliation (authoritative) ──');
console.log(`  Total sites in psi_raw.json    : ${rawAll}  (all countries)`);
console.log(`  US + territories               : ${rawUS}  (Canada excluded)`);
console.log(`  Geocoded in GeoJSON            : ${sites.features.length}  (${rawUS-sites.features.length} failed geocoding)`);
console.log(`  O&O (PSI Owned) — raw/geo      : ${rawOO_n} / ${geoOO_n}  (2 ungeocoded: PSI Lab 1 Olathe, W KY Practical)`);
console.log(`  O&O with Optimus data          : ${optGeoMatched}  (correct figure — NOT 147)`);
console.log(`  PSI Authorized — raw/geo       : ${raw.filter(s=>s.propertyType==='PSI Authorized').length} / ${geoAuth_n}  (30 Canada + ${geoAuth_ungeocoded} ungeocoded US)`);
console.log(`  Expired leases in repo         : ${leaseExpiredRepo}  (63-site O&O file, May 2026)`);
console.log(`  Neal's 66 expired              : not in repo — needs separate file`);
console.log('\n  Report: tools/data_accuracy_audit.md');
console.log('  GeoJSON: data_psi_sites.geojson updated with optimusStatus + corrected criticalOptimus');
