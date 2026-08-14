/**
 * Derives priority cities from US Census population data.
 * Primary: Plotly top-1000 US cities CSV (public domain, no API key).
 *   Columns: City, State (full name), Population, lat, lon
 * Supplement: hardcoded second-city entries for the 4 states with only 1 city
 *   in the Plotly dataset (Alaska, Hawaii, Maine, Vermont).
 * DC is included with 1 city (Washington) — the only incorporated city in DC.
 * Selects top 3 cities per state (150 total + DC = ~151), geocodes via Nominatim,
 * joins IRS city summary + PSI site counts, writes priority_cities.geojson.
 * cityLevel is the population rank: 1 = most populous, 2 = second, 3 = third.
 * CDP (Census Designated Place) entries in the source data are kept, not filtered.
 * Run: node tools/export_priority_cities.js
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const IRS_CITY_PATH = path.join(
  'C:', 'Users', 'Samad.Khan',
  'OneDrive - Educational Testing Service', 'Documents', 'PSI Documents - ASK',
  'Channel PSI', '4. Work Documents', 'IRS', 'IRS_Map_Pipeline', 'output', 'irs_city_summary.json'
);
const SITES_PATH = path.join(ROOT, 'public', 'data', 'data_psi_sites.geojson');
const OUT_PATH   = path.join(ROOT, 'public', 'data', 'priority_cities.geojson');
const NOM_DELAY  = 1200;

const PLOTLY_URL = 'https://raw.githubusercontent.com/plotly/datasets/master/us-cities-top-1k.csv';

// Valid US states + DC (full names matching Plotly CSV "State" column)
const VALID_STATES = new Set([
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois',
  'Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts',
  'Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota',
  'Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina',
  'South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington',
  'West Virginia','Wisconsin','Wyoming',
]);

// City name overrides: Plotly/Census name → name used in PSI site data.
// Applied after city selection so cityStateKey matches data_psi_sites.geojson exactly.
const NAME_OVERRIDES = {
  'Boise City':        'Boise',           // Idaho: Plotly uses Census formal name; PSI uses "Boise"
  'Lexington-Fayette': 'Lexington',       // Kentucky: Census consolidated-govt name; PSI uses "Lexington"
  'Des Moines':        'West Des Moines', // Iowa: no PSI sites in Des Moines proper; site is in West Des Moines
  'Spokane':           'Spokane Valley',  // Washington: no PSI sites in Spokane proper; site is in Spokane Valley
  'Augusta-Richmond County': 'Augusta',   // Georgia: Census consolidated city-county name; Nominatim resolves "Augusta"
  // Burlington, VT: no override — South Burlington is already VT's #2 entry; renaming would create a duplicate
};

// Hardcoded coordinate fallbacks for cities Nominatim can't resolve by name.
// Keyed by "City|State" (name after NAME_OVERRIDES applied). Used only when the
// live geocode returns no result — keeps otherwise-valid priority cities on the map.
const GEO_FALLBACK = {
  'Augusta|Georgia': { lat: 33.4735, lon: -82.0105 },
};

// PSI city name aliases: maps PSI site city|state key → canonical priority city|state key.
// Applied after siteLookup and irsLookup are built, merging suburb/variant entries
// into the priority city they belong to.
const CITY_ALIASES = {
  'south burlington|vermont': 'burlington|vermont',   // PSI site is in South Burlington; priority city is Burlington
  'w. des moines|iowa':       'west des moines|iowa', // PSI data uses abbreviation; export uses "West Des Moines"
};

// 2nd-city supplement for states with only 1 city in the Plotly top-1000 dataset.
// Populations are 2020 Census estimates; used only for ranking, not displayed.
const SUPPLEMENTAL = {
  'Alaska':  [{ city:'Fairbanks',       pop:31535 }],
  'Hawaii':  [{ city:'Pearl City',      pop:47698 }],
  'Maine':   [{ city:'Lewiston',        pop:36592 }],
  'Vermont': [{ city:'South Burlington',pop:19814 }],
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const RADIUS_KM = 80.4672; // 50 miles

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) *
            Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fetchUrl(urlStr) {
  return new Promise((resolve, reject) => {
    const makeReq = (u) => {
      const parsed = new URL(u);
      const req = https.get({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': 'ProjectBigFoot/1.0 PSI-ETS (samadkhaan@gmail.com)' },
      }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) { makeReq(res.headers.location); return; }
        let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
      });
      req.on('error', reject);
      req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    };
    makeReq(urlStr);
  });
}

// CSV parser with quoted-field support
function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const fields = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, (fields[i] ?? '').replace(/^"|"$/g, '')]));
  });
}

// ─── STEP 1: Build top-3-per-state list ──────────────────────────────────────

console.log('Fetching Plotly top-1000 cities CSV…');
const csvRaw  = await fetchUrl(PLOTLY_URL);
const csvRows = parseCSV(csvRaw);
// Actual columns: City, State (full name), Population, lat, lon
console.log(`  → ${csvRows.length} rows parsed`);

const byState = {};
for (const r of csvRows) {
  const state = (r.State || '').trim();
  const city  = (r.City  || '').trim();
  const pop   = parseFloat((r.Population || '0').replace(/,/g, '')) || 0;
  if (!VALID_STATES.has(state) || !city) continue;
  if (!byState[state]) byState[state] = [];
  byState[state].push({ city, pop });
}
for (const state in byState) byState[state].sort((a, b) => b.pop - a.pop);

// Supplement states with < 2 cities using hardcoded table
for (const [state, extras] of Object.entries(SUPPLEMENTAL)) {
  const existing = new Set((byState[state] || []).map(c => c.city.toLowerCase()));
  for (const extra of extras) {
    if (!existing.has(extra.city.toLowerCase())) {
      if (!byState[state]) byState[state] = [];
      byState[state].push(extra);
      existing.add(extra.city.toLowerCase());
    }
  }
}

// Build final selected list: top 3 per state (1 for DC), cityLevel 1, 2, 3
// Apply NAME_OVERRIDES so cityStateKey matches PSI site data exactly.
const selected = [];
for (const state of VALID_STATES) {
  const cities = (byState[state] || []).slice(0, 3);
  cities.forEach((c, i) => selected.push({
    city:      NAME_OVERRIDES[c.city] || c.city,
    state,
    pop:       c.pop,
    cityLevel: i + 1,
  }));
}

console.log(`\nSelected ${selected.length} cities`);
const under3 = [...VALID_STATES].filter(s => s !== 'District of Columbia' && (byState[s] || []).length < 3);
const zero   = [...VALID_STATES].filter(s => !(byState[s] || []).length);
if (under3.length) console.log(`  ⚠ Fewer than 3: ${under3.map(s => `${s} (${(byState[s]||[]).length})`).join(', ')}`);
if (zero.length)   console.log(`  ✗ No cities:    ${zero.join(', ')}`);

// ─── STEP 2: Load join sources ────────────────────────────────────────────────

console.log('\nLoading IRS city summary…');
const irsData = JSON.parse(fs.readFileSync(IRS_CITY_PATH, 'utf8'));
const irsLookup = {};
for (const r of irsData) {
  irsLookup[`${r.city}|${r.state}`.toLowerCase()] = r;
}
console.log(`  → ${irsData.length} IRS city records`);

// If canonical priority city has no IRS record, inherit from alias key.
for (const [aliasKey, canonKey] of Object.entries(CITY_ALIASES)) {
  if (irsLookup[aliasKey] && !irsLookup[canonKey]) {
    irsLookup[canonKey] = irsLookup[aliasKey];
  }
}

console.log('Loading PSI sites GeoJSON…');
const sitesGeo = JSON.parse(fs.readFileSync(SITES_PATH, 'utf8'));
const siteLookup = {};
for (const f of sitesGeo.features) {
  const p = f.properties;
  if (!p.city || !p.state) continue;
  const k = `${p.city}|${p.state}`.toLowerCase();
  if (!siteLookup[k]) siteLookup[k] = { ooCount: 0, partnerCount: 0 };
  if (p.category === 'OO') siteLookup[k].ooCount++;
  else siteLookup[k].partnerCount++;
}
console.log(`  → ${Object.keys(siteLookup).length} unique city+state combos in GeoJSON`);

// Merge suburb/variant PSI site keys into their canonical priority city keys.
for (const [aliasKey, canonKey] of Object.entries(CITY_ALIASES)) {
  if (siteLookup[aliasKey]) {
    if (!siteLookup[canonKey]) siteLookup[canonKey] = { ooCount: 0, partnerCount: 0 };
    siteLookup[canonKey].ooCount      += siteLookup[aliasKey].ooCount;
    siteLookup[canonKey].partnerCount += siteLookup[aliasKey].partnerCount;
  }
}

// Flat array of all PSI sites with coordinates, used for 50-mile radius checks.
const siteArray = sitesGeo.features
  .filter(f => f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2)
  .map(f => ({
    lon:          f.geometry.coordinates[0],
    lat:          f.geometry.coordinates[1],
    id:           f.properties.id,
    name:         f.properties.name,
    city:         f.properties.city,
    state:        f.properties.state,
    category:     f.properties.category,
    irsActivated: !!f.properties.irsActivated,
    irsInProcess: f.properties.irsInProcess || 0,
  }));
console.log(`  → ${siteArray.length} sites available for radius checks`);

// ─── STEP 3: Geocode via Nominatim ───────────────────────────────────────────

console.log(`\nGeocoding ${selected.length} cities via Nominatim (~${Math.ceil(selected.length * NOM_DELAY / 60000)} min)…`);

function nominatimGet(city, state) {
  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&country=US&format=json&limit=1`;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': 'ProjectBigFoot/1.0 PSI-ETS (samadkhaan@gmail.com)' },
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const geoFailed = [];
let gDone = 0;
for (const c of selected) {
  let failReason = null;
  try {
    const raw = JSON.parse(await nominatimGet(c.city, c.state));
    if (raw.length > 0) {
      c.lon = parseFloat(raw[0].lon);
      c.lat = parseFloat(raw[0].lat);
    } else {
      c.lon = null; c.lat = null; failReason = 'no result';
    }
  } catch (e) {
    c.lon = null; c.lat = null; failReason = e.message;
  }
  // Coordinate fallback for cities Nominatim can't resolve by name
  if (c.lon == null || c.lat == null) {
    const fb = GEO_FALLBACK[`${c.city}|${c.state}`];
    if (fb) { c.lat = fb.lat; c.lon = fb.lon; failReason = null; }
  }
  if (failReason) geoFailed.push(`${c.city}, ${c.state} — ${failReason}`);
  gDone++;
  if (gDone % 20 === 0) process.stdout.write(`  ${gDone}/${selected.length}\n`);
  await sleep(NOM_DELAY);
}
if (gDone % 20 !== 0) process.stdout.write(`  ${gDone}/${selected.length}\n`);

// ─── STEP 4: Build GeoJSON features ──────────────────────────────────────────

const features = [];
for (const c of selected) {
  if (c.lon == null || c.lat == null) continue;
  const cityStateKey = `${c.city}|${c.state}`;
  const irs   = irsLookup[cityStateKey.toLowerCase()] || {};
  const sites = siteLookup[cityStateKey.toLowerCase()] || { ooCount: 0, partnerCount: 0 };

  // 50-mile radius check
  const withDist = siteArray.map(s => ({ ...s, distanceKm: haversineKm(c.lat, c.lon, s.lat, s.lon) }));
  const nearby   = withDist.filter(s => s.distanceKm <= RADIUS_KM);

  const nearbyTotal     = nearby.length;
  const nearbyActivated = nearby.filter(s => s.irsActivated).length;
  const nearbyInProcess = nearby.filter(s => s.irsInProcess > 0 && !s.irsActivated).length;
  const nearbyOO        = nearby.filter(s => s.category === 'OO').length;
  const nearby3P        = nearby.filter(s => s.category !== 'OO').length;
  const radiusActivated = nearbyActivated > 0;

  // Nearest activated site within 50 miles
  const activatedNearby = nearby.filter(s => s.irsActivated).sort((a, b) => a.distanceKm - b.distanceKm);
  const nearestActivated = activatedNearby.length > 0 ? {
    id:            activatedNearby[0].id,
    name:          activatedNearby[0].name,
    city:          activatedNearby[0].city,
    state:         activatedNearby[0].state,
    distanceKm:    Math.round(activatedNearby[0].distanceKm * 10) / 10,
    distanceMiles: Math.round(activatedNearby[0].distanceKm / 1.60934 * 10) / 10,
  } : null;

  const cityActivated  = (irs.activatedSites || 0) > 0;
  const siteActivated  = cityActivated || radiusActivated;

  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    properties: {
      city:             c.city,
      state:            c.state,
      cityStateKey,
      cityLevel:        c.cityLevel,
      isPriority:       true,
      ooCount:          sites.ooCount,
      partnerCount:     sites.partnerCount,
      totalSites:       sites.ooCount + sites.partnerCount,
      totalTCAs:        irs.totalTCAs    || 0,
      inProcess:        irs.inProcess    || 0,
      cleared:          irs.cleared      || 0,
      siteActivated,
      nearbyTotal,
      nearbyActivated,
      nearbyInProcess,
      nearbyOO,
      nearby3P,
      radiusActivated,
      nearestActivated,
      _cityActivated:   cityActivated,  // temp — stripped before write, used for report diff
    },
  });
}

// ─── STEP 5: Write output ─────────────────────────────────────────────────────

// Compute report data before stripping temp field
const oldActivatedCount  = features.filter(f => f.properties._cityActivated).length;
const newActivatedCount  = features.filter(f => f.properties.siteActivated).length;
const recovered          = features.filter(f => f.properties.radiusActivated && !f.properties._cityActivated);
const nearbyOnlyPresence = features.filter(f => f.properties.nearbyTotal > 0 && f.properties.totalSites === 0);
const trueDeserts        = features.filter(f => f.properties.nearbyTotal === 0 && f.properties.totalSites === 0);

const stateCount = {};
for (const f of features) stateCount[f.properties.state] = (stateCount[f.properties.state] || 0) + 1;
const statesWithOne  = Object.entries(stateCount).filter(([,n]) => n === 1).map(([s]) => s);

for (const f of features) delete f.properties._cityActivated;
fs.writeFileSync(OUT_PATH, JSON.stringify({ type: 'FeatureCollection', features }));

// ─── REPORT ───────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════');
console.log('  PRIORITY CITIES — COMPLETE');
console.log('══════════════════════════════════════════════');
console.log(`  Total features written:  ${features.length}`);
console.log(`  Geocoding failures:      ${geoFailed.length}`);
if (statesWithOne.length) console.log(`  1 city only (expected DC): ${statesWithOne.join(', ')}`);
if (geoFailed.length > 0) { geoFailed.forEach(f => console.log(`    ✗ ${f}`)); }

console.log('\n── 1. Recovered by radius logic (radiusActivated=true, old city-match=false) ─');
if (recovered.length === 0) {
  console.log('  None.');
} else {
  for (const f of recovered) {
    const p  = f.properties;
    const nr = p.nearestActivated;
    console.log(`  ${p.city}, ${p.state} — nearbyActivated: ${p.nearbyActivated}`);
    if (nr) console.log(`    nearest: ${nr.name} (${nr.city}, ${nr.state}) — ${nr.distanceMiles} mi`);
  }
}

console.log('\n── 2. siteActivated count: before vs after ──────────────────────────────────');
console.log(`  Before (city-match only):       ${oldActivatedCount}`);
console.log(`  After  (city-match OR radius):  ${newActivatedCount}`);
console.log(`  Net gain:                       +${newActivatedCount - oldActivatedCount}`);

console.log('\n── 3. nearbyTotal > 0 but totalSites = 0 (radius presence, no exact match) ──');
if (nearbyOnlyPresence.length === 0) {
  console.log('  None.');
} else {
  for (const f of nearbyOnlyPresence) {
    const p = f.properties;
    console.log(`  ${p.city}, ${p.state} — nearbyTotal: ${p.nearbyTotal} (OO: ${p.nearbyOO}, 3P: ${p.nearby3P})`);
  }
}

console.log('\n── 4. True deserts (nearbyTotal = 0 AND totalSites = 0) ────────────────────');
if (trueDeserts.length === 0) {
  console.log('  None.');
} else {
  for (const f of trueDeserts) {
    const p = f.properties;
    console.log(`  ${p.city}, ${p.state}`);
  }
}

console.log('\n── 5. Sample nearestActivated check ─────────────────────────────────────────');
for (const [city, state] of [['Seattle','Washington'],['Denver','Colorado'],['Boston','Massachusetts']]) {
  const f = features.find(x => x.properties.city === city && x.properties.state === state);
  if (!f) { console.log(`  ${city}, ${state}: NOT FOUND in features`); continue; }
  const p  = f.properties;
  const nr = p.nearestActivated;
  console.log(`  ${city}, ${state}:`);
  console.log(`    nearbyTotal: ${p.nearbyTotal}, nearbyActivated: ${p.nearbyActivated}, radiusActivated: ${p.radiusActivated}`);
  if (nr) console.log(`    nearestActivated: ${nr.name} (${nr.city}, ${nr.state}) — ${nr.distanceMiles} mi / ${nr.distanceKm} km`);
  else    console.log(`    nearestActivated: null`);
}

console.log(`\n  Output: ${OUT_PATH}`);
