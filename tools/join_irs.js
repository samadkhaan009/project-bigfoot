/**
 * Step 2 — Join IRS clearance data onto data_psi_sites.geojson.
 * Consumes the FLAT ARRAY format emitted by IRS_Map_Pipeline.
 * Unmatched Bigfoot sites get default 0/false values.
 * Unmatched IRS site ids (pipeline sites absent from GeoJSON) are logged.
 * Run: node tools/join_irs.js   (from Bigfoot project root)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// ── Source paths ─────────────────────────────────────────────────────────────
const PIPELINE_OUTPUT = path.join(
  'C:', 'Users', 'Samad.Khan',
  'OneDrive - Educational Testing Service',
  'Documents', 'PSI Documents - ASK', 'Channel PSI',
  '4. Work Documents', 'IRS', 'IRS_Map_Pipeline', 'output'
);

const sitesPath        = path.join(ROOT, 'public', 'data', 'data_psi_sites.geojson');
const irsPath          = path.join(PIPELINE_OUTPUT, 'irs_clearance_data.json');
const stateSummaryPath = path.join(PIPELINE_OUTPUT, 'irs_state_summary.json');
const pcPath           = path.join(ROOT, 'public', 'data', 'priority_cities.geojson');

// ── Priority city lookup ──────────────────────────────────────────────────────
const priorityCityKeys = new Set();
if (fs.existsSync(pcPath)) {
  const pc = JSON.parse(fs.readFileSync(pcPath, 'utf8'));
  pc.features.forEach(f => {
    if (f.properties.isPriority) priorityCityKeys.add(f.properties.cityStateKey);
  });
}

// ── Load sources ──────────────────────────────────────────────────────────────
const sites    = JSON.parse(fs.readFileSync(sitesPath,        'utf8'));
const irsArray = JSON.parse(fs.readFileSync(irsPath,          'utf8')); // flat array
const stateArr = JSON.parse(fs.readFileSync(stateSummaryPath, 'utf8')); // flat array

// Build id → record lookup from the flat array (record.id is the key field)
const lookup = Object.fromEntries(irsArray.map(r => [String(r.id), r]));

const bigfootIds = new Set(sites.features.map(f => String(f.properties.id)));

let joined = 0, defaulted = 0;

// ── Join IRS data onto each GeoJSON feature ───────────────────────────────────
sites.features.forEach(f => {
  const id  = String(f.properties.id);
  const rec = lookup[id];
  const p   = f.properties;

  if (rec) {
    p.irsActivated  = rec.irsActivated === true;
    p.irsCleared    = rec.cleared    ?? 0;
    p.irsInProcess  = rec.inProcess  ?? 0;
    p.irsTotalTCAs  = rec.totalTCAs  ?? 0;
    p.irsSubmitted  = rec.submitted  ?? 0;
    // notStarted = TCAs not yet submitted to IRS
    p.irsNotStarted = Math.max(0, (rec.totalTCAs ?? 0) - (rec.submitted ?? 0));
    p.irsSegment     = rec.segment    || null;
    p.irsIslaGranted = rec.islaGranted ?? 0;
    // Synthetic features lack category/propertyType — patch them so perfLayerFilter passes
    if (p.irsSyntheticFeature) {
      const isOwned   = rec.segment === 'PSI Owned';
      p.category      = isOwned ? 'OO' : '3P';
      p.propertyType  = isOwned ? 'PSI Owned' : 'PSI Authorized';
      p.irsIslaGranted = rec.islaGranted ?? 0;
    }
    joined++;
  } else {
    p.irsActivated  = false;
    p.irsCleared    = 0;
    p.irsInProcess  = 0;
    p.irsTotalTCAs  = 0;
    p.irsSubmitted  = 0;
    p.irsNotStarted  = 0;
    p.irsSegment     = null;
    p.irsIslaGranted = 0;
    defaulted++;
  }

  // Priority city flag — uses city+state key matching priority_cities.geojson
  const cityKey = `${(p.city||'').trim()}|${(p.state||'').trim()}`;
  p.inPriorityCity = priorityCityKeys.size > 0 ? priorityCityKeys.has(cityKey) : false;
});

// ── Second pass: create synthetic features for pipeline records absent from GeoJSON ──
const unmatchedIds    = Object.keys(lookup).filter(id => !bigfootIds.has(id));
const syntheticSkipped = [];
let syntheticCreated  = 0;

unmatchedIds.sort((a, b) => Number(a) - Number(b)).forEach(id => {
  const rec = lookup[id];
  if (rec.lat == null || rec.long == null) {
    syntheticSkipped.push({ id, name: rec.name });
    return;
  }
  const cityKey      = `${(rec.city || '').trim()}|${(rec.state || '').trim()}`;
  const isOwned      = rec.segment === 'PSI Owned';
  sites.features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [rec.long, rec.lat] },
    properties: {
      id:                  String(rec.id),
      name:                rec.name    || '',
      city:                rec.city    || '',
      state:               rec.state   || '',
      segment:             rec.segment || null,
      // Required by perfLayerFilter and ring-radius expression in BigFootMap.jsx
      category:            isOwned ? 'OO' : '3P',
      propertyType:        isOwned ? 'PSI Owned' : 'PSI Authorized',
      irsActivated:        rec.irsActivated === true,
      irsCleared:          rec.cleared    ?? 0,
      irsInProcess:        rec.inProcess  ?? 0,
      irsTotalTCAs:        rec.totalTCAs  ?? 0,
      irsSubmitted:        rec.submitted  ?? 0,
      irsNotStarted:       Math.max(0, (rec.totalTCAs ?? 0) - (rec.submitted ?? 0)),
      irsSegment:          rec.segment    || null,
      irsIslaGranted:      rec.islaGranted ?? 0,
      inPriorityCity:      priorityCityKeys.size > 0 ? priorityCityKeys.has(cityKey) : false,
      irsSyntheticFeature: true,
    },
  });
  syntheticCreated++;
});

fs.writeFileSync(sitesPath, JSON.stringify(sites));

// ── Build and write state choropleth lookup ───────────────────────────────────
// data_irs_states.json: keyed by state name
// Map expects: stateActivated (int), statePctActivated (0-1 decimal)
const statesOut = {};
for (const r of stateArr) {
  statesOut[r.state] = {
    stateSites:        r.sites,
    stateActivated:    r.activatedSites,
    stateCleared:      r.cleared,
    stateInProcess:    r.inProcess,
    statePctActivated: r.sites > 0
      ? Math.round((r.activatedSites / r.sites) * 10000) / 10000
      : 0,
  };
}
const statesOutPath = path.join(ROOT, 'public', 'data', 'data_irs_states.json');
fs.writeFileSync(statesOutPath, JSON.stringify(statesOut, null, 2));

// ── Verify activated count ────────────────────────────────────────────────────
const activatedInGeo = sites.features.filter(f => f.properties.irsActivated).length;
const inProcInGeo    = sites.features.filter(f => f.properties.irsInProcess > 0 && !f.properties.irsActivated).length;
const notStartedGeo  = sites.features.filter(f => f.properties.irsTotalTCAs === 0).length;

console.log('\n── IRS join complete ─────────────────────────────────');
console.log(`  Native Bigfoot sites:    ${sites.features.length - syntheticCreated}`);
console.log(`  Joined (IRS data):       ${joined}`);
console.log(`  Defaulted (no IRS):      ${defaulted}`);
console.log(`  Synthetic features added:${syntheticCreated}`);
if (syntheticSkipped.length > 0) {
  console.log(`  Skipped (missing coords):${syntheticSkipped.length}`);
  syntheticSkipped.forEach(s => console.log(`    id=${s.id}  name="${s.name}"`));
}
console.log(`  Total features written:  ${sites.features.length}`);
console.log(`\n  Activated (ISLA or cleared):  ${activatedInGeo}`);
console.log(`  In-process only:         ${inProcInGeo}`);
console.log(`  Not in IRS yet:          ${notStartedGeo}`);
console.log(`\n  Synthetic feature ids/names:`);
unmatchedIds.sort((a, b) => Number(a) - Number(b)).forEach(id => {
  const r = lookup[id];
  const created = r.lat != null && r.long != null;
  console.log(`    id=${id}  activated=${r.irsActivated}  created=${created}  name="${r.name}"`);
});
console.log(`\n  data_irs_states.json:    ${Object.keys(statesOut).length} states written`);
