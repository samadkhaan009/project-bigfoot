/**
 * Builds the MSA/CBSA data layer for Project Big Foot (Phase 1 — data only).
 *  1. ZIP → dominant CBSA lookup      (HUD ZIP-CBSA_032026.xlsx)
 *  2. CBSA code → name lookup          (cbsa_delineation.csv/.xls + supplement)
 *  3. Tag each PSI site with cbsaCode + cbsaName (writes data_psi_sites.geojson)
 *  4. Aggregate per-CBSA summary       (writes data_cbsa_summary.json)
 *  5. Join report                      (writes tools/cbsa_join_report.md)
 * Run: node tools/build_cbsa.mjs   (from Bigfoot project root)
 */
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DD   = path.join(ROOT, 'public', 'data');

const HUD_PATH   = path.join(DD, 'ZIP-CBSA_032026.xlsx');
const DELIN_PATH = path.join(DD, 'cbsa_delineation_2023.xls'); // 2023 delineation (list1_2023.xlsx) — names match the 2024 pop file; same layout: sheet "List 1", header row 2, code col0/title col3
const POP_PATH   = path.join(DD, 'cbsa-met-est2024-pop.xlsx');
const SITES_PATH = path.join(DD, 'data_psi_sites.geojson');
const BOUNDARIES_PATH = path.join(DD, 'data_cbsa_boundaries.geojson'); // Phase-2 output; source of gap-market codes/names/population
const SUMMARY_OUT= path.join(DD, 'data_cbsa_summary.json');
const REPORT_OUT = path.join(__dirname, 'cbsa_join_report.md');

// 5 codes missing from the 2020 delineation file (2023 additions)
const NAME_SUPPLEMENT = {
  '12520': 'Baker City, OR',
  '17410': 'Cleveland, OH',
  '28880': 'Kiryas Joel-Poughkeepsie-Newburgh, NY',
  '34880': 'Nantucket, MA',
  '42580': 'Seaford, DE',
};

const hasVal = v => v !== null && v !== undefined && String(v).trim() !== '';
const stripBom = s => s.replace(/^﻿/, '');

// ─── STEP 1: ZIP → dominant CBSA ──────────────────────────────────────────────
console.log('Step 1: reading HUD ZIP→CBSA crosswalk…');
const hudWb   = xlsx.readFile(HUD_PATH, { raw: false, defval: '' });
const hudRows = xlsx.utils.sheet_to_json(hudWb.Sheets[hudWb.SheetNames[0]], { header: 1, raw: false, defval: '' });
// header: zip(0) geoid(1) city(2) state(3) res_ratio(4) ...
const zipBest = new Map();  // zip5 → { code, res }
const zipSeen = new Set();  // every zip5 encountered (to detect all-99999)
for (let i = 1; i < hudRows.length; i++) {
  const r = hudRows[i];
  const zip5 = String(r[0] ?? '').trim().padStart(5, '0');
  const code = String(r[1] ?? '').trim();
  const res  = parseFloat(String(r[4] ?? '0').replace(/[, ]/g, '')) || 0;
  if (!zip5 || zip5 === '00000' || !code) continue;
  zipSeen.add(zip5);
  if (code === '99999') continue;               // rural/non-metro — excluded from dominance
  const prev = zipBest.get(zip5);
  if (!prev || res > prev.res) zipBest.set(zip5, { code, res });
}
console.log(`  ${zipSeen.size} unique ZIPs seen · ${zipBest.size} map to a non-99999 CBSA`);

// ─── STEP 2: CBSA code → name ─────────────────────────────────────────────────
console.log('Step 2: reading CBSA delineation…');
const delBuf  = fs.readFileSync(DELIN_PATH);
const delWb   = xlsx.read(delBuf, { type: 'buffer', raw: false });
const delRows = xlsx.utils.sheet_to_json(delWb.Sheets['List 1'], { header: 1, raw: false, defval: '' });
const codeToName = new Map();
// header at row index 2, data from row 3; col0 = CBSA Code, col3 = CBSA Title
for (let i = 3; i < delRows.length; i++) {
  const code = String(delRows[i][0] ?? '').trim();
  const name = String(delRows[i][3] ?? '').trim();
  if (!/^\d{5}$/.test(code)) continue;          // skip footnotes / blanks
  if (!codeToName.has(code)) codeToName.set(code, name);
}
for (const [code, name] of Object.entries(NAME_SUPPLEMENT)) codeToName.set(code, name); // supplement wins
console.log(`  ${codeToName.size} CBSA code→name pairs (incl. ${Object.keys(NAME_SUPPLEMENT).length} supplemented)`);

// ─── STEP 3: tag each PSI site ────────────────────────────────────────────────
console.log('Step 3: tagging PSI sites…');
const sites = JSON.parse(stripBom(fs.readFileSync(SITES_PATH, 'utf8')));
let nMatched = 0, nNonMetro = 0, nNull = 0;
const failedZips = [];
for (const f of sites.features) {
  const p = f.properties;
  const zip5 = String(p.zip || '').trim().padStart(5, '0');
  if (!hasVal(p.zip)) {
    p.cbsaCode = null; p.cbsaName = null; nNull++;
    continue;
  }
  const hit = zipBest.get(zip5);
  if (hit) {
    p.cbsaCode = hit.code;
    p.cbsaName = codeToName.get(hit.code) || null;   // name may be null if code unknown
    nMatched++;
  } else if (zipSeen.has(zip5)) {
    // ZIP present in HUD but only as 99999 rows → genuinely non-metro
    p.cbsaCode = 'NON-METRO'; p.cbsaName = 'Non-Metro'; nNonMetro++;
  } else {
    // ZIP has a value but is absent from the HUD crosswalk → no match possible (null per spec)
    p.cbsaCode = null; p.cbsaName = null; nNull++;
    if (failedZips.length < 10) failedZips.push(zip5);
  }
}
fs.writeFileSync(SITES_PATH, JSON.stringify(sites, null, 2), 'utf8');
console.log(`  matched=${nMatched} non-metro=${nNonMetro} nullZip=${nNull} → wrote ${path.basename(SITES_PATH)}`);

// ─── STEP 4: population lookup + per-CBSA aggregate ───────────────────────────
console.log('Step 4: building CBSA summary…');
// Build name → 2024 population from the population xlsx (single-dot MSA/micro rows)
const popWb   = xlsx.readFile(POP_PATH, { raw: false, defval: '' });
const popRows = xlsx.utils.sheet_to_json(popWb.Sheets['CBSA-MET-EST2024-POP'], { header: 1, raw: false, defval: '' });
const normName = s => String(s || '')
  .replace(/^\./, '')                                     // strip single leading dot
  .replace(/\s+Metro Area$/i, '')
  .replace(/\s+Micropolitan Statistical Area$/i, '')
  .replace(/\s+Metropolitan Statistical Area$/i, '')
  .trim()
  .toLowerCase();
const popByName = new Map();
for (let i = 4; i < popRows.length; i++) {
  const raw = String(popRows[i][0] ?? '');
  if (!/^\.[^.]/.test(raw)) continue;                     // single leading dot only
  const pop = parseInt(String(popRows[i][6] ?? '').replace(/[, ]/g, ''), 10);
  if (isNaN(pop)) continue;
  popByName.set(normName(raw), pop);
}
console.log(`  ${popByName.size} population rows parsed`);

// aggregate
const agg = new Map();  // cbsaCode → accumulator
function bucket(code, name) {
  if (!agg.has(code)) {
    agg.set(code, {
      cbsaCode: code, cbsaName: name, population2024: 0,
      totalSites: 0, ooSites: 0, threePSites: 0,
      irsActivated: 0, irsInProcess: 0, irsNotStarted: 0, hasAnyIRS: false,
      totalVolume: 0, _scoreSum: 0, _scoreN: 0, hasExpiredLease: false,
      pctActivated: 0, coverageStatus: 'covered',
    });
  }
  return agg.get(code);
}
for (const f of sites.features) {
  const p = f.properties;
  if (p.cbsaCode === null) continue;                      // null-ZIP sites excluded from summary
  const a = bucket(p.cbsaCode, p.cbsaName);
  a.totalSites++;
  if (p.category === 'OO') a.ooSites++; else a.threePSites++;
  const activated = p.irsActivated === true;
  const inProc    = (p.irsInProcess > 0) && !activated;
  if (activated) a.irsActivated++;
  if (inProc)    a.irsInProcess++;
  if (Number(p.irsTotalTCAs) === 0 || !hasVal(p.irsTotalTCAs)) a.irsNotStarted++;
  if (hasVal(p.cdVolume)) a.totalVolume += Number(p.cdVolume) || 0;
  if (hasVal(p.scoreBucket)) { a._scoreSum += Number(p.scoreBucket); a._scoreN++; }
  if (p.leaseStatus === 'EXPIRED') a.hasExpiredLease = true;
}

// finalize each entry
const summary = [];
for (const a of agg.values()) {
  const isNonMetro = a.cbsaCode === 'NON-METRO';
  a.population2024   = isNonMetro ? 0 : (popByName.get(normName(a.cbsaName)) ?? 0);
  a.avgScoreBucket   = a._scoreN ? Math.round((a._scoreSum / a._scoreN) * 10) / 10 : null;
  a.pctActivated     = a.totalSites ? Math.round((a.irsActivated / a.totalSites) * 1e4) / 1e4 : 0;
  a.hasAnyIRS        = (a.irsActivated + a.irsInProcess) > 0;
  a.coverageStatus   = isNonMetro ? 'non-metro' : (a.totalSites > 0 ? 'covered' : 'gap');
  delete a._scoreSum; delete a._scoreN;
  summary.push(a);
}
// ── Second pass: add GAP markets (CBSAs with zero PSI sites) from the boundary file ──
// The Phase-2 boundary build already joined 2024 population onto every CBSA polygon,
// so gap markets absent from the PSI-site aggregation can be recovered here.
const coveredCodes = new Set(summary.filter(s => s.cbsaCode !== 'NON-METRO').map(s => s.cbsaCode));
let gapRecords = [];
if (fs.existsSync(BOUNDARIES_PATH)) {
  const boundaries = JSON.parse(stripBom(fs.readFileSync(BOUNDARIES_PATH, 'utf8')));
  const seenGap = new Set();
  for (const feat of boundaries.features) {
    const bp = feat.properties || {};
    const code = String(bp.GEOID ?? bp.cbsaCode ?? '').trim();
    const pop  = Number(bp.population2024) || 0;
    if (!code || coveredCodes.has(code) || seenGap.has(code)) continue;  // covered/dupe → skip
    if (pop === 0) continue;                                             // micropolitan / no population → skip
    seenGap.add(code);
    gapRecords.push({
      cbsaCode:       code,
      cbsaName:       bp.NAME ?? bp.cbsaName ?? '',
      population2024: pop,
      totalSites:     0,
      ooSites:        0,
      threePSites:    0,
      irsActivated:   0,
      irsInProcess:   0,
      irsNotStarted:  0,
      hasAnyIRS:      false,
      totalVolume:    0,
      avgScoreBucket: null,
      hasExpiredLease: false,
      pctActivated:   0,
      coverageStatus: 'gap',
    });
  }
} else {
  console.log('  (data_cbsa_boundaries.geojson not found — skipping gap markets)');
}

// Merge covered + non-metro + gap records, sorted by 2024 population descending.
const merged = [...summary, ...gapRecords].sort((x, y) => y.population2024 - x.population2024);
fs.writeFileSync(SUMMARY_OUT, JSON.stringify(merged, null, 2), 'utf8');
const cbsaOnly = summary.filter(s => s.cbsaCode !== 'NON-METRO');
console.log(`  ${merged.length} summary rows (${cbsaOnly.length} covered + ${gapRecords.length} gap + non-metro) → wrote ${path.basename(SUMMARY_OUT)}`);

// ─── STEP 5: join report ──────────────────────────────────────────────────────
console.log('Step 5: writing join report…');
const total = sites.features.length;
const cbsasWithSites = cbsaOnly.length;
const cbsasWithActivation = cbsaOnly.filter(s => s.irsActivated > 0).length;
const popMatched = cbsaOnly.filter(s => s.population2024 > 0).length;
const topBySites = [...summary].sort((a, b) => b.totalSites - a.totalSites).slice(0, 10);

const L = [];
L.push('# CBSA / MSA Join Report — Project Big Foot (Phase 1)');
L.push('');
L.push('_Data pipeline: HUD ZIP-CBSA (Mar 2026) → Census delineation (2020 + 2023 supplement) → PSI sites → per-CBSA summary._');
L.push('');
L.push('## Site assignment');
L.push('');
L.push('| Metric | Count |');
L.push('|---|---|');
L.push(`| Total PSI sites processed | ${total} |`);
L.push(`| Matched to a CBSA (numeric code) | ${nMatched} |`);
L.push(`| Tagged NON-METRO | ${nNonMetro} |`);
L.push(`| Null ZIP (no match possible) | ${nNull} |`);
L.push(`| Unique CBSAs with ≥1 PSI site | ${cbsasWithSites} |`);
L.push(`| CBSAs with irsActivated > 0 | ${cbsasWithActivation} |`);
L.push(`| CBSAs matched to a 2024 population | ${popMatched} / ${cbsasWithSites} |`);
L.push('');
L.push('## Top 10 CBSAs by site count');
L.push('');
L.push('| Rank | CBSA | Code | Sites | O&O | 3P | Pop 2024 | IRS Activated |');
L.push('|---|---|---|---|---|---|---|---|');
topBySites.forEach((s, i) => {
  L.push(`| ${i + 1} | ${s.cbsaName} | ${s.cbsaCode} | ${s.totalSites} | ${s.ooSites} | ${s.threePSites} | ${s.population2024.toLocaleString()} | ${s.irsActivated} |`);
});
L.push('');
L.push('## ZIPs that failed to match the HUD crosswalk (first 10)');
L.push('');
L.push(failedZips.length ? failedZips.map(z => `- ${z}`).join('\n') : '- (none — every non-null ZIP was found in the crosswalk)');
L.push('');
fs.writeFileSync(REPORT_OUT, L.join('\n'), 'utf8');
console.log(`  wrote ${path.basename(REPORT_OUT)}`);
console.log('\nDone.');
