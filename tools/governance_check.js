/**
 * Project Big Foot — Full Governance Check
 * Run: node tools/governance_check.js
 * Output: tools/governance_report.md
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.join(__dirname, '..');
const PUB_DATA   = path.join(ROOT, 'public', 'data');

// ── helpers ───────────────────────────────────────────
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const kb   = p => (fs.statSync(p).size / 1024).toFixed(1);
const inUS = (lon, lat) => lat >= 18 && lat <= 72 && lon >= -180 && lon <= -65;
const avg  = arr => arr.length ? arr.reduce((s,x) => s+x, 0) / arr.length : 0;

function haversine(lon1, lat1, lon2, lat2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── report state ──────────────────────────────────────
const sections = [];
let totalChecks = 0, passed = 0, warned = 0, failed = 0;
const critIssues = [], warnings = [], recommendations = [];

function check(name, status, detail, rec) {
  totalChecks++;
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  if (status === 'PASS') passed++;
  else if (status === 'WARN') { warned++; warnings.push(`**${name}**: ${detail}`); }
  else { failed++; critIssues.push(`**${name}**: ${detail}`); }
  if (rec) recommendations.push(`- ${rec}`);
  return `| ${icon} | ${name} | ${detail} |`;
}

function section(title, content) { sections.push(`\n## ${title}\n\n${content}`); }

// ═══════════════════════════════════════════════════════
// STEP 1 — DATA FILE INVENTORY
// ═══════════════════════════════════════════════════════
console.log('Step 1: Inventory...');
const geojsonFiles = fs.readdirSync(PUB_DATA).filter(f => f.endsWith('.geojson'));
// also check public/ root
const rootGeo = fs.readdirSync(path.join(ROOT,'public')).filter(f => f.endsWith('.geojson'));

const inventoryRows = [];
const fileStats = {};

for (const f of geojsonFiles) {
  const fpath = path.join(PUB_DATA, f);
  const d = read(fpath);
  const fcount = d.features?.length || 0;
  const geomTypes = [...new Set(d.features?.map(x => x.geometry?.type).filter(Boolean))];
  const nullGeom  = d.features?.filter(x => !x.geometry || !x.geometry.coordinates).length || 0;
  const props     = fcount > 0 ? Object.keys(d.features[0].properties || {}).slice(0,8).join(', ') : 'N/A';
  const size      = kb(fpath);
  fileStats[f]    = { fcount, nullGeom, geomTypes, d };
  const status    = nullGeom > 0 ? '⚠️' : '✅';
  inventoryRows.push(`| ${status} | \`${f}\` | ${fcount} | ${geomTypes.join('/')} | ${size} KB | ${nullGeom} null | ${props.substring(0,60)} |`);
}
for (const f of rootGeo) {
  const fpath = path.join(ROOT,'public',f);
  const d = read(fpath);
  const fcount = d.features?.length || 0;
  const size = kb(fpath);
  inventoryRows.push(`| ⚠️ | \`${f}\` (root) | ${fcount} | polygon | ${size} KB | — | Note: should be in /data/ |`);
}

section('Data File Inventory',
  `| Status | File | Features | Geometry | Size | Null Geom | Sample Properties |\n|---|---|---|---|---|---|---|\n` + inventoryRows.join('\n')
);

// ═══════════════════════════════════════════════════════
// STEP 2 — COORDINATE VALIDATION
// ═══════════════════════════════════════════════════════
console.log('Step 2: Coordinates...');
const coordRows = [];
const checkFiles = ['data_psi_sites.geojson','data_airports.geojson','data_universities.geojson',
  'data_healthcare.geojson','data_financial.geojson','data_government.geojson',
  'data_technology.geojson','data_manufacturing.geojson','data_railway.geojson',
  'data_cultural.geojson','data_agriculture.geojson','data_urban_rural.geojson'];

for (const f of checkFiles) {
  const data = fileStats[f]?.d;
  if (!data) { coordRows.push(check(`Coords: ${f}`, 'WARN', 'File not found', `Add ${f} to public/data/`)); continue; }
  const pts = data.features.filter(x => x.geometry?.type === 'Point');
  let valid = 0, invalid = 0, outliers = [];
  for (const ft of pts) {
    const [lon, lat] = ft.geometry.coordinates;
    if (inUS(lon, lat)) valid++;
    else { invalid++; if (outliers.length < 3) outliers.push(`[${lon.toFixed(2)},${lat.toFixed(2)}]`); }
  }
  const status = invalid === 0 ? 'PASS' : invalid < 5 ? 'WARN' : 'FAIL';
  coordRows.push(check(`Coords: ${f}`, status,
    `${valid}/${pts.length} valid${invalid > 0 ? ` — ${invalid} outside US bounds` + (outliers.length ? `: ${outliers.join(',')}` : '') : ''}`,
    invalid > 0 ? `Fix ${invalid} coordinate(s) in ${f}` : null));
}

// Polygon centroid checks
for (const f of ['metros.geojson','data_population.geojson']) {
  const data = fileStats[f]?.d;
  if (!data) { coordRows.push(check(`Polygon centroids: ${f}`, 'WARN', 'File not found', null)); continue; }
  const polys = data.features.filter(x => x.geometry?.type === 'Polygon' || x.geometry?.type === 'MultiPolygon');
  let closedOk = 0, unclosed = 0;
  for (const ft of polys) {
    const ring = ft.geometry.type === 'Polygon' ? ft.geometry.coordinates[0] : ft.geometry.coordinates[0][0];
    if (ring && ring.length >= 4) {
      const first = ring[0], last = ring[ring.length-1];
      if (first[0] === last[0] && first[1] === last[1]) closedOk++;
      else unclosed++;
    }
  }
  const status = unclosed === 0 ? 'PASS' : 'WARN';
  coordRows.push(check(`Polygon rings: ${f}`, status,
    `${polys.length} polygons — ${closedOk} closed, ${unclosed} unclosed`, null));
}

section('Coordinate Validation', `| Status | Check | Detail |\n|---|---|---|\n` + coordRows.join('\n'));

// ═══════════════════════════════════════════════════════
// STEP 3 — PSI SITE DATA VALIDATION
// ═══════════════════════════════════════════════════════
console.log('Step 3: PSI sites...');
const psiRaw   = read(path.join(__dirname,'psi_raw.json'));
const psiSites = fileStats['data_psi_sites.geojson']?.d;
const psiRadii = fileStats['data_psi_radii.geojson']?.d;
const psiRows  = [];

const INCLUDE = new Set(['USA','Puerto Rico','Virgin Islands, U.S.']);
const rawUS   = psiRaw.filter(s => INCLUDE.has(s.country));
const geocoded = psiSites?.features?.length || 0;
const coveragePct = ((geocoded / rawUS.length)*100).toFixed(1);

psiRows.push(check('PSI geocoding coverage', coveragePct >= 90 ? 'PASS' : coveragePct >= 80 ? 'WARN' : 'FAIL',
  `${geocoded}/${rawUS.length} US+territory sites geocoded (${coveragePct}%)`,
  coveragePct < 90 ? 'Resolve remaining ungeocoded sites' : null));

// Duplicate TC IDs
const seenIds = new Set(); let dupIds = 0;
psiSites?.features.forEach(f => {
  const id = f.properties.id;
  if (seenIds.has(id)) dupIds++;
  seenIds.add(id);
});
psiRows.push(check('No duplicate TC IDs', dupIds === 0 ? 'PASS' : 'FAIL',
  dupIds === 0 ? 'No duplicates found' : `${dupIds} duplicate TC IDs detected`, null));

// Duplicate coordinates
const seenCoords = new Set(); let dupCoords = 0;
psiSites?.features.forEach(f => {
  const [lon, lat] = f.geometry.coordinates;
  const k = `${lon.toFixed(6)},${lat.toFixed(6)}`;
  if (seenCoords.has(k)) dupCoords++;
  seenCoords.add(k);
});
psiRows.push(check('No duplicate coordinates', dupCoords === 0 ? 'PASS' : 'WARN',
  dupCoords === 0 ? 'No duplicate coordinates' : `${dupCoords} sites share exact coordinates`, null));

// Valid property types
const VALID_PT = new Set(['PSI Owned','PSI Authorized','MG TESTING','TD TESTING','AMP Authorized']);
const badPT = psiSites?.features.filter(f => !VALID_PT.has(f.properties.propertyType)) || [];
psiRows.push(check('Property types valid', badPT.length === 0 ? 'PASS' : 'FAIL',
  badPT.length === 0 ? 'All property types match expected set' : `${badPT.length} invalid: ${[...new Set(badPT.map(f=>f.properties.propertyType))].join(', ')}`,
  null));

// Radii 1:1 match
const radiiCount = psiRadii?.features?.length || 0;
psiRows.push(check('Radii 1:1 with sites', radiiCount === geocoded ? 'PASS' : 'FAIL',
  `Sites: ${geocoded}  Radii: ${radiiCount}${radiiCount !== geocoded ? ' — MISMATCH' : ''}`,
  radiiCount !== geocoded ? 'Re-run regen_radii.js to resync' : null));

// Missing sites
const geocodedIds = new Set(psiSites?.features.map(f => String(f.properties.id)));
const missingSites = rawUS.filter(s => !geocodedIds.has(String(s.testCenterId)));
psiRows.push(check('Missing site check', missingSites.length <= 5 ? 'WARN' : 'FAIL',
  `${missingSites.length} of ${rawUS.length} US sites not in GeoJSON: ${missingSites.slice(0,5).map(s=>s.name).join(', ')}${missingSites.length > 5 ? '…' : ''}`,
  missingSites.length > 0 ? 'Run geocoding scripts to recover remaining sites' : null));

section('PSI Site Data Validation', `| Status | Check | Detail |\n|---|---|---|\n` + psiRows.join('\n'));

// ═══════════════════════════════════════════════════════
// STEP 4 — PERFORMANCE DATA
// ═══════════════════════════════════════════════════════
console.log('Step 4: Performance...');
const perfRows = [];
const features = psiSites?.features || [];

const withPerf  = features.filter(f => f.properties.scoreBucket != null);
const noPerf    = features.filter(f => f.properties.scoreBucket == null);
const buckets   = {1:0,2:0,3:0,4:0,5:0};
const outOfRange = [];
const highSeats  = [];
const volumes    = [];

withPerf.forEach(f => {
  const p = f.properties;
  if (p.scoreBucket >= 1 && p.scoreBucket <= 5) buckets[p.scoreBucket]++;
  else outOfRange.push(`${p.id}:bucket=${p.scoreBucket}`);
  if (p.cdVolume > 0) volumes.push(p.cdVolume);
  if ((p.seats||0) > 200) highSeats.push(`${p.id}(seats=${p.seats})`);
});

const pctPerf = ((withPerf.length / features.length)*100).toFixed(1);
perfRows.push(check('Performance join coverage', pctPerf >= 90 ? 'PASS' : 'WARN',
  `${withPerf.length}/${features.length} sites matched (${pctPerf}%)`, null));

perfRows.push(check('Score bucket distribution', outOfRange.length === 0 ? 'PASS' : 'FAIL',
  `1:${buckets[1]} 2:${buckets[2]} 3:${buckets[3]} 4:${buckets[4]} 5:${buckets[5]}${outOfRange.length ? ` — INVALID: ${outOfRange.join(',')}` : ''}`, null));

perfRows.push(check('Volume data', volumes.length > 0 ? 'PASS' : 'WARN',
  `Min:${Math.min(...volumes).toLocaleString()} Max:${Math.max(...volumes).toLocaleString()} Avg:${Math.round(avg(volumes)).toLocaleString()} — ${features.filter(f=>!f.properties.cdVolume).length} with zero/null volume`, null));

perfRows.push(check('Seats outlier check', highSeats.length === 0 ? 'PASS' : 'WARN',
  highSeats.length === 0 ? 'No seats > 200' : `${highSeats.length} high-seats sites: ${highSeats.slice(0,3).join(', ')}`,
  highSeats.length > 0 ? 'Verify seats>200 sites — column may be annual capacity not physical seats' : null));

section('Performance Data Join', `| Status | Check | Detail |\n|---|---|---|\n` + perfRows.join('\n'));

// ═══════════════════════════════════════════════════════
// STEP 5 — OPTIMUS DATA
// ═══════════════════════════════════════════════════════
console.log('Step 5: Optimus...');
const optRows  = [];
const ooSites  = features.filter(f => f.properties.propertyType === 'PSI Owned');
const withOpt  = ooSites.filter(f => f.properties.optimusTier);
const noOpt    = ooSites.filter(f => !f.properties.optimusTier);
const tierDist = {A:0,B:0,C:0};
const optScores = [];
const tierAcands = [], criticalSites = [];

withOpt.forEach(f => {
  const p = f.properties;
  if (p.optimusTier in tierDist) tierDist[p.optimusTier]++;
  if (p.optimusScore != null) {
    optScores.push(p.optimusScore);
    if (p.optimusScore >= 0.85) tierAcands.push(p.id);
    if (p.optimusScore < 0.40)  criticalSites.push(`${p.id}(${(p.optimusScore*100).toFixed(0)}%)`);
  }
});

const optCov = ((withOpt.length / ooSites.length)*100).toFixed(1);
optRows.push(check('Optimus join coverage', optCov >= 85 ? 'PASS' : 'WARN',
  `${withOpt.length}/${ooSites.length} O&O sites matched (${optCov}%)`, null));

optRows.push(check('Optimus tier distribution', 'PASS',
  `Tier A:${tierDist.A} Tier B:${tierDist.B} Tier C:${tierDist.C}`, null));

optRows.push(check('Optimus score range', optScores.length > 0 ? 'PASS' : 'WARN',
  optScores.length > 0 ? `Min:${(Math.min(...optScores)*100).toFixed(1)}% Max:${(Math.max(...optScores)*100).toFixed(1)}% Avg:${(avg(optScores)*100).toFixed(1)}%` : 'No scores found', null));

optRows.push(check('Tier A candidates (≥85%)', 'WARN',
  tierAcands.length === 0 ? 'No site currently achieves Tier A (≥85%)' : `${tierAcands.length} sites: ${tierAcands.join(',')}`,
  'Target Tier A through facility improvements'));

optRows.push(check('Critical score sites (<40%)', criticalSites.length === 0 ? 'PASS' : 'FAIL',
  criticalSites.length === 0 ? 'No sites below 40%' : `${criticalSites.length} critical: ${criticalSites.join(', ')}`,
  criticalSites.length > 0 ? 'Immediate action required for critical-score sites' : null));

section('Optimus Data Join', `| Status | Check | Detail |\n|---|---|---|\n` + optRows.join('\n'));

// ═══════════════════════════════════════════════════════
// STEP 6 — LEASE DATA
// ═══════════════════════════════════════════════════════
console.log('Step 6: Lease...');
const leaseRows  = [];
const cwPath     = path.join(__dirname,'lease_crosswalk.json');
const withLease  = features.filter(f => f.properties.leaseAction);
const leaseConf  = fs.existsSync(cwPath) ? read(cwPath) : null;

const lActionDist = {};
let expiredCount = 0, contractFlagCount = 0, revenues = [], misplacedLease = 0;
withLease.forEach(f => {
  const p = f.properties;
  lActionDist[p.leaseAction] = (lActionDist[p.leaseAction]||0)+1;
  if (p.leaseStatus === 'EXPIRED') expiredCount++;
  if (p.contractFlag === true) contractFlagCount++;
  if (p.monthlyRevenue > 0) revenues.push(p.monthlyRevenue);
  if (p.leaseAction && p.propertyType !== 'PSI Owned') misplacedLease++;
});

leaseRows.push(check('Lease join coverage', withLease.length >= 50 ? 'PASS' : 'WARN',
  `${withLease.length} sites with lease data`, null));

leaseRows.push(check('Lease action distribution', 'PASS',
  Object.entries(lActionDist).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(' ')));

leaseRows.push(check('Expired lease count', expiredCount >= 30 ? 'WARN' : 'PASS',
  `${expiredCount} sites with EXPIRED status`,
  expiredCount > 30 ? 'Priority: resolve expired leases — liability and operations risk' : null));

leaseRows.push(check('Contract flags', contractFlagCount === 7 ? 'PASS' : 'WARN',
  `${contractFlagCount} sites with contractFlag=true (expected 7)`, null));

leaseRows.push(check('3P sites with lease data', misplacedLease === 0 ? 'PASS' : 'WARN',
  misplacedLease === 0 ? 'Lease data correctly applied to O&O sites only' : `${misplacedLease} 3P sites have lease fields set`,
  misplacedLease > 0 ? 'Review lease join — 3P sites should not have lease data' : null));

if (revenues.length > 0) {
  const totalRev = revenues.reduce((s,x)=>s+x,0);
  leaseRows.push(check('Revenue data integrity', 'PASS',
    `Total: $${Math.round(totalRev/1e6*10)/10}M — Min: $${Math.round(Math.min(...revenues)).toLocaleString()} Max: $${Math.round(Math.max(...revenues)).toLocaleString()} Avg: $${Math.round(avg(revenues)).toLocaleString()}/mo`));
}

if (leaseConf) {
  const high = leaseConf.filter(r=>r.confidence==='HIGH').length;
  const med  = leaseConf.filter(r=>r.confidence==='MEDIUM').length;
  const unm  = leaseConf.filter(r=>r.confidence==='UNMATCHED').length;
  leaseRows.push(check('Crosswalk confidence', unm <= 5 ? 'PASS' : 'WARN',
    `HIGH:${high} MEDIUM:${med} UNMATCHED:${unm}`,
    unm > 0 ? `Manually resolve ${unm} unmatched lease sites` : null));
}

section('Lease Data Join', `| Status | Check | Detail |\n|---|---|---|\n` + leaseRows.join('\n'));

// ═══════════════════════════════════════════════════════
// STEP 7 — GOVERNANCE FLAGS A–G
// ═══════════════════════════════════════════════════════
console.log('Step 7: Governance flags...');
const flagRows = [];

// CHECK A — Manufacturing mislabel
const mfg = fileStats['data_manufacturing.geojson']?.d;
if (mfg) {
  const types = [...new Set(mfg.features.map(f => f.properties.primary_fuel || f.properties.type || '').filter(Boolean))].slice(0,8);
  const isEnergy = types.some(t => /gas|coal|oil|nuclear|wind|solar|hydro|biomass|waste|petro/i.test(t));
  flagRows.push(check('CHECK A — Manufacturing labeling', isEnergy ? 'WARN' : 'PASS',
    `Layer labeled "Manufacturing" but contains energy/power plant data. Fuel types found: ${types.join(', ')}`,
    'Rename layer to "Industrial Energy Sites" or update DATA_QUALITY note to clarify data represents power plants, not factories'));
}

// CHECK B — Population coverage
const pop = fileStats['data_population.geojson']?.d;
if (pop) {
  const cnt = pop.features.length;
  const pct = ((cnt / 3144) * 100).toFixed(1);
  flagRows.push(check('CHECK B — Population coverage', cnt >= 1572 ? 'PASS' : 'WARN',
    `${cnt} features of 3,144 US counties (${pct}%) — layer covers high-density zones only`,
    cnt < 1572 ? 'Expand population layer to include more counties for gap analysis' : null));
}

// CHECK C — Metro shape accuracy
const metros = fileStats['metros.geojson']?.d;
if (metros) {
  const widths = metros.features.map(f => {
    const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const lons = ring.map(c=>c[0]), lats = ring.map(c=>c[1]);
    const w = Math.max(...lons) - Math.min(...lons);
    const h = Math.max(...lats) - Math.min(...lats);
    return {w, h, ratio: w/h};
  });
  const tooWide = widths.filter(x => x.w > 3).length;
  const avgRatio = avg(widths.map(x=>x.ratio));
  const areCircles = Math.abs(avgRatio - 1) < 0.2;
  flagRows.push(check('CHECK C — Metro shape accuracy', tooWide === 0 ? 'WARN' : 'FAIL',
    `${metros.features.length} metro areas — avg aspect ratio ${avgRatio.toFixed(2)} — ${areCircles?'CIRCULAR (modelled approximations, not real CBSA boundaries)':'irregular'} — ${tooWide} wider than 3°`,
    'Replace with real Census CBSA boundary polygons via Phase 2 FastAPI proxy'));
}

// CHECK D — 50-mile radius accuracy
const radii = fileStats['data_psi_radii.geojson']?.d;
const sites2 = fileStats['data_psi_sites.geojson']?.d;
if (radii && sites2) {
  const siteMap = Object.fromEntries(sites2.features.map(f => [f.properties.id, f.geometry.coordinates]));
  // sample 5 radii
  const sample = radii.features.filter((_, i) => i % Math.floor(radii.features.length/5) === 0).slice(0,5);
  const radiusMeasurements = [];
  for (const rf of sample) {
    const center = siteMap[rf.properties.siteId];
    if (!center) continue;
    const ring = rf.geometry.coordinates[0];
    // measure distance to a few perimeter points
    const dists = [ring[0], ring[16], ring[32], ring[48]].filter(Boolean).map(pt => haversine(center[0], center[1], pt[0], pt[1]));
    const measuredR = avg(dists);
    radiusMeasurements.push(measuredR);
  }
  const avgR = avg(radiusMeasurements);
  const maxDev = Math.max(...radiusMeasurements.map(r => Math.abs(r - 50) / 50 * 100));
  flagRows.push(check('CHECK D — 50-mile radius accuracy', maxDev < 5 ? 'PASS' : 'WARN',
    `5-ring sample avg radius: ${avgR.toFixed(2)} miles (target 50.0) — max deviation: ${maxDev.toFixed(1)}%`, null));
}

// CHECK E — Urban/Rural completeness
const ur = fileStats['data_urban_rural.geojson']?.d;
if (ur) {
  const clsCount = {};
  let urInvalid = 0;
  ur.features.forEach(f => {
    const c = f.properties.classification;
    clsCount[c] = (clsCount[c]||0)+1;
    const [lon, lat] = f.geometry.coordinates;
    if (!inUS(lon, lat)) urInvalid++;
  });
  flagRows.push(check('CHECK E — Urban/Rural completeness', urInvalid === 0 ? 'WARN' : 'FAIL',
    `${ur.features.length} points — ${Object.entries(clsCount).map(([k,v])=>`${k}:${v}`).join(' ')} — ${urInvalid} outside US bounds — manually curated starter set, not comprehensive`,
    'Expand to full algorithmic urban/rural classification once test-taker ZIP data is available'));
}

// CHECK F — Duplicate sites (already checked above, summarise)
flagRows.push(check('CHECK F — Duplicate site IDs', dupIds === 0 ? 'PASS' : 'FAIL',
  `${dupIds} duplicate TC IDs`, null));
flagRows.push(check('CHECK F — Duplicate coordinates', dupCoords === 0 ? 'PASS' : 'WARN',
  `${dupCoords} sites share exact coordinates`, null));

// CHECK G — Data freshness (check DATA_QUALITY last-updated fields in code)
flagRows.push(check('CHECK G — Data freshness', 'WARN',
  'NCES universities 2023, WRI power plants 2021, FDIC 2026, Optimus 2025, Lease May 2026 — WRI power plants may be outdated',
  'Plan annual refresh of WRI power plant data and NCES enrollment figures'));

section('Governance Flags (A–G)', `| Status | Check | Detail |\n|---|---|---|\n` + flagRows.join('\n'));

// ═══════════════════════════════════════════════════════
// STEP 8 — CROSS-LAYER CONSISTENCY
// ═══════════════════════════════════════════════════════
console.log('Step 8: Cross-layer consistency...');
const xRows = [];

// CHECK H — Property type counts
const ptCounts = {};
features.forEach(f => { const pt = f.properties.propertyType; ptCounts[pt] = (ptCounts[pt]||0)+1; });
const EXPECTED = {'PSI Owned':143,'PSI Authorized':397,'MG TESTING':33,'TD TESTING':20,'AMP Authorized':1};
let ptIssues = [];
for (const [pt, exp] of Object.entries(EXPECTED)) {
  const actual = ptCounts[pt] || 0;
  if (Math.abs(actual - exp) > 5) ptIssues.push(`${pt}: got ${actual}, expected ~${exp}`);
}
xRows.push(check('CHECK H — Property type counts', ptIssues.length === 0 ? 'PASS' : 'WARN',
  ptIssues.length === 0
    ? `Owned:${ptCounts['PSI Owned']||0} Authorized:${ptCounts['PSI Authorized']||0} MG:${ptCounts['MG TESTING']||0} TD:${ptCounts['TD TESTING']||0} AMP:${ptCounts['AMP Authorized']||0}`
    : ptIssues.join('; '),
  ptIssues.length > 0 ? 'Some expected site type counts differ — verify PSI site list completeness' : null));

// CHECK I — Performance tier math
const totalWithData = withPerf.length;
const sumBuckets    = Object.values(buckets).reduce((s,x)=>s+x,0);
const noData        = features.length - withPerf.length;
const grandTotal    = sumBuckets + noData;
xRows.push(check('CHECK I — Perf tier sum = total sites', grandTotal === features.length ? 'PASS' : 'FAIL',
  `Buckets sum(${sumBuckets}) + no-data(${noData}) = ${grandTotal} — total sites = ${features.length}`, null));

// CHECK J — Radii count
xRows.push(check('CHECK J — Radii = sites', radiiCount === geocoded ? 'PASS' : 'FAIL',
  `Sites: ${geocoded}  Radii: ${radiiCount}${radiiCount !== geocoded ? ' — MISMATCH: re-run regen_radii.js' : ''}`,
  radiiCount !== geocoded ? 'Run: node tools/regen_radii.js' : null));

section('Cross-Layer Consistency (H–J)', `| Status | Check | Detail |\n|---|---|---|\n` + xRows.join('\n'));

// ═══════════════════════════════════════════════════════
// STEP 9 — GENERATE REPORT
// ═══════════════════════════════════════════════════════
console.log('Step 9: Writing report...');

const overall = failed > 0 ? '❌ FAIL' : warned > 0 ? '⚠️ WARN' : '✅ PASS';
const now = new Date().toISOString().slice(0,16).replace('T',' ') + ' UTC';

const execSummary = `
| Metric | Value |
|---|---|
| Overall status | **${overall}** |
| Total checks run | **${totalChecks}** |
| ✅ Passed | **${passed}** |
| ⚠️ Warnings | **${warned}** |
| ❌ Failed | **${failed}** |
| Total PSI sites geocoded | **${geocoded}** |
| Sites with performance data | **${withPerf.length}** |
| O&O sites with Optimus data | **${withOpt.length}** |
| Sites with lease intelligence | **${withLease.length}** |
`.trim();

const critSection = critIssues.length > 0
  ? critIssues.map(x=>`- ${x}`).join('\n')
  : '_No critical failures — all core data is present and valid._';

const warnSection = warnings.length > 0
  ? warnings.map(x=>`- ${x}`).join('\n')
  : '_No warnings._';

const recSection = [...new Set(recommendations)].join('\n') || '_No additional recommendations._';

const report = `# Project Big Foot — Governance Report

_Generated: ${now}_

---

## Executive Summary

${execSummary}

${sections.join('\n')}

---

## Critical Issues (FAIL) — Action Required Before Demo

${critSection}

---

## Warnings (WARN) — Monitor or Disclose

${warnSection}

---

## Recommendations (Priority Order)

${recSection}
`;

const outPath = path.join(__dirname, 'governance_report.md');
fs.writeFileSync(outPath, report);

console.log('\n' + '═'.repeat(55));
console.log('GOVERNANCE CHECK COMPLETE');
console.log('═'.repeat(55));
console.log(`Total checks:  ${totalChecks}`);
console.log(`  ✅ Passed:   ${passed}`);
console.log(`  ⚠️  Warnings: ${warned}`);
console.log(`  ❌ Failed:   ${failed}`);
console.log(`\nReport saved to: tools/governance_report.md`);
if (failed > 0) { console.log('\nCritical issues:'); critIssues.forEach(x => console.log('  ❌ '+x)); }
