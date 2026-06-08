/**
 * Step 2 — Join IRS clearance data onto data_psi_sites.geojson.
 * Matches on feature.properties.id === irs.sites[siteId].
 * Unmatched Bigfoot sites get default 0/false values.
 * Unmatched IRS siteIds (HiSET/NBSTSA outside Bigfoot scope) are logged.
 * Run: node tools/join_irs.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const sitesPath  = path.join(ROOT, 'public', 'data', 'data_psi_sites.geojson');
const irsPath    = path.join(__dirname, 'irs_clearance_data.json');
const pcPath     = path.join(ROOT, 'public', 'data', 'priority_cities.geojson');

// Build priority city lookup (city+state key) if file exists
const priorityCityKeys = new Set();
if (fs.existsSync(pcPath)) {
  const pc = JSON.parse(fs.readFileSync(pcPath, 'utf8'));
  pc.features.forEach(f => {
    if (f.properties.isPriority) priorityCityKeys.add(f.properties.cityStateKey);
  });
}

const sites = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
const irs   = JSON.parse(fs.readFileSync(irsPath,   'utf8'));

const irsById    = irs.sites;                           // keyed by siteId string
const bigfootIds = new Set(sites.features.map(f => String(f.properties.id)));

let joined = 0, defaulted = 0;

sites.features.forEach(f => {
  const id  = String(f.properties.id);
  const rec = irsById[id];
  const p   = f.properties;

  if (rec) {
    p.irsActivated  = rec.irsActivated  === true;
    p.irsCleared    = rec.irsCleared    ?? 0;
    p.irsInProcess  = rec.irsInProcess  ?? 0;
    p.irsTotalTCAs  = rec.irsTotalTCAs  ?? 0;
    p.irsSubmitted  = rec.irsSubmitted  ?? 0;
    p.irsNotStarted = rec.irsNotStarted ?? 0;
    p.irsSegment       = rec.irsSegment    || null;
    joined++;
  } else {
    p.irsActivated  = false;
    p.irsCleared    = 0;
    p.irsInProcess  = 0;
    p.irsTotalTCAs  = 0;
    p.irsSubmitted  = 0;
    p.irsNotStarted = 0;
    p.irsSegment    = null;
    defaulted++;
  }
  // Priority city flag — uses city+state key (city field may vary in casing)
  const cityKey = `${(p.city||'').trim()}|${(p.state||'').trim()}`;
  p.inPriorityCity = priorityCityKeys.size > 0 ? priorityCityKeys.has(cityKey) : false;
});

fs.writeFileSync(sitesPath, JSON.stringify(sites));

// Write state lookup for choropleth (keyed by full state name)
const statesOutPath = path.join(ROOT, 'public', 'data', 'data_irs_states.json');
fs.writeFileSync(statesOutPath, JSON.stringify(irs.states, null, 2));

// ── Unmatched IRS siteIds (outside Bigfoot scope) ────
const unmatchedIrs = Object.keys(irsById).filter(id => !bigfootIds.has(id));
const unmatchedByType = {};
unmatchedIrs.forEach(id => {
  const seg = irsById[id].irsSegment || 'unknown';
  unmatchedByType[seg] = (unmatchedByType[seg] || 0) + 1;
});

// ── Verify activated count ────────────────────────────
const activatedInGeo = sites.features.filter(f => f.properties.irsActivated).length;
const inProcInGeo    = sites.features.filter(f => f.properties.irsInProcess > 0 && !f.properties.irsActivated).length;
const notStartedGeo  = sites.features.filter(f => f.properties.irsTotalTCAs === 0).length;

console.log('\n── IRS join complete ─────────────────────────────');
console.log(`  Bigfoot sites:         ${sites.features.length}`);
console.log(`  Joined (IRS data):     ${joined}`);
console.log(`  Defaulted (no IRS):    ${defaulted}`);
console.log(`\n  Activated (≥1 cleared): ${activatedInGeo}  (master tracker: ${irs.summary.activatedSites})`);
console.log(`  In-process only:        ${inProcInGeo}`);
console.log(`  Not in IRS yet:         ${notStartedGeo}`);
console.log(`\n  Unmatched IRS siteIds: ${unmatchedIrs.length} (outside Bigfoot scope)`);
Object.entries(unmatchedByType).sort((a,b)=>b[1]-a[1])
  .forEach(([k,v]) => console.log(`    ${v.toString().padStart(4)}  ${k}`));
if (unmatchedIrs.length <= 10) {
  console.log('  IDs:', unmatchedIrs.join(', '));
}
