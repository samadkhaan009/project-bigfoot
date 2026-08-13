/**
 * Phase 2 · Step 1 — fetch real CBSA boundary polygons from Census TIGERweb and
 * join the per-CBSA PSI summary onto each polygon.
 *
 * NOTE: the layer-128 URLs in the task spec 404 on the current TIGERweb service,
 * this MapServer does NOT support f=geojson or resultOffset paging, the field is
 * LSADC (not LSAD), and single large geometry queries error out. CBSA polygons
 * live in tigerWMS_Current as layer 93 (Metropolitan) + 91 (Micropolitan) = all
 * ~935 CBSAs. We enumerate OBJECTIDs, fetch esriJSON in objectId chunks with a
 * light maxAllowableOffset generalization, and convert to GeoJSON.
 *
 * Run: node tools/build_cbsa_boundaries.mjs   (from project root)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { arcgisToGeoJSON } from '@esri/arcgis-to-geojson-utils';
import xlsx from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DD = path.join(__dirname, '..', 'public', 'data');
const SUMMARY_PATH = path.join(DD, 'data_cbsa_summary.json');
const POP_PATH     = path.join(DD, 'cbsa-met-est2024-pop.xlsx');
const OUT_PATH     = path.join(DD, 'data_cbsa_boundaries.geojson');

const SERVICE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';
const LAYERS  = [93, 91]; // 93 = Metropolitan Statistical Areas, 91 = Micropolitan
const CHUNK   = 100;      // objectIds per request
const OFFSET  = 0.004;    // maxAllowableOffset in degrees (~440m) — light generalization

async function fetchLayer(layerId) {
  const idsRes = await fetch(`${SERVICE}/${layerId}/query?where=1%3D1&returnIdsOnly=true&f=json`);
  const idsData = await idsRes.json();
  const ids = idsData.objectIds || [];
  const collected = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK).join(',');
    const url = `${SERVICE}/${layerId}/query?objectIds=${chunk}&outFields=GEOID,NAME,LSADC`
      + `&outSR=4326&maxAllowableOffset=${OFFSET}&returnGeometry=true&f=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`layer ${layerId} chunk ${i}: HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`layer ${layerId} chunk ${i}: ${data.error.message}`);
    collected.push(...(data.features || []));
    console.log(`  layer ${layerId}: ${collected.length}/${ids.length}`);
  }
  return collected;
}

const stripSuffix = s => String(s || '')
  .replace(/\s+(Metro|Micro) Area$/i, '')
  .replace(/\s+(Metropolitan|Micropolitan) Statistical Area$/i, '')
  .trim();

const GAP = () => ({
  population2024: 0, totalSites: 0, ooSites: 0, threePSites: 0,
  irsActivated: 0, irsInProcess: 0, irsNotStarted: 0, hasAnyIRS: false,
  totalVolume: 0, avgScoreBucket: 0, hasExpiredLease: false,
  pctActivated: 0, coverageStatus: 'gap',
});

async function main() {
  console.log('Fetching CBSA polygons from TIGERweb (esriJSON → GeoJSON)…');
  let raw = [];
  for (const id of LAYERS) raw = raw.concat(await fetchLayer(id));
  console.log(`Fetched ${raw.length} CBSA polygons.`);

  const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
  const byCode = new Map(summary.filter(s => s.cbsaCode !== 'NON-METRO').map(s => [String(s.cbsaCode), s]));

  // Population by normalized MSA name — so GAP CBSAs (absent from the PSI summary)
  // still get their real 2024 population and can render by market size.
  const normName = s => String(s || '')
    .replace(/^\./, '').replace(/\s+Metro Area$/i, '')
    .replace(/\s+Micropolitan Statistical Area$/i, '').replace(/\s+Metropolitan Statistical Area$/i, '')
    .trim().toLowerCase();
  const popWb   = xlsx.readFile(POP_PATH, { raw: false, defval: '' });
  const popRows = xlsx.utils.sheet_to_json(popWb.Sheets['CBSA-MET-EST2024-POP'], { header: 1, raw: false, defval: '' });
  const popByName = new Map();
  for (let i = 4; i < popRows.length; i++) {
    const raw = String(popRows[i][0] ?? '');
    if (!/^\.[^.]/.test(raw)) continue;                 // single-dot MSA rows only
    const pop = parseInt(String(popRows[i][6] ?? '').replace(/[, ]/g, ''), 10);
    if (!isNaN(pop)) popByName.set(normName(raw), pop);
  }

  let matched = 0, gap = 0;
  const seen = new Set();
  const features = [];
  for (const f of raw) {
    const a = f.attributes || {};
    const geoid = String(a.GEOID ?? '').trim();
    if (!geoid || seen.has(geoid)) continue;      // dedup by GEOID
    if (!f.geometry) continue;
    seen.add(geoid);
    const geometry = arcgisToGeoJSON(f.geometry);  // {rings} → Polygon/MultiPolygon
    const s = byCode.get(geoid);
    let props;
    if (s) {
      props = {
        cbsaCode: geoid, cbsaName: s.cbsaName, population2024: s.population2024,
        totalSites: s.totalSites, ooSites: s.ooSites, threePSites: s.threePSites,
        irsActivated: s.irsActivated, irsInProcess: s.irsInProcess, irsNotStarted: s.irsNotStarted,
        hasAnyIRS: s.hasAnyIRS, totalVolume: s.totalVolume, avgScoreBucket: s.avgScoreBucket,
        hasExpiredLease: s.hasExpiredLease, pctActivated: s.pctActivated, coverageStatus: s.coverageStatus,
      };
      matched++;
    } else {
      const nm = stripSuffix(a.NAME);
      props = { cbsaCode: geoid, cbsaName: nm, ...GAP() };
      props.population2024 = popByName.get(normName(nm)) ?? 0;   // real pop for gap metros
      gap++;
    }
    features.push({ type: 'Feature', properties: props, geometry });
  }

  const out = { type: 'FeatureCollection', features };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out), 'utf8');
  const mb = fs.statSync(OUT_PATH).size / 1024 / 1024;
  console.log(`\nWrote ${features.length} features (${matched} covered/PSI, ${gap} gap) → ${path.basename(OUT_PATH)} (${mb.toFixed(2)} MB)`);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
