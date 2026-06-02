import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RADIUS_MILES = 50;
const CIRCLE_POINTS = 64;
const CENSUS_BATCH_SIZE = 500;
const NOMINATIM_DELAY_MS = 1200;

// Accurate geographic circle using spherical law of cosines
function generateCircle(lon, lat) {
  const R = 3958.8;
  const d = RADIUS_MILES / R;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lon * Math.PI / 180;
  const coords = [];
  for (let i = 0; i <= CIRCLE_POINTS; i++) {
    const bearing = (2 * Math.PI * i) / CIRCLE_POINTS;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
    );
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
    coords.push([+(lon2 * 180 / Math.PI).toFixed(6), +(lat2 * 180 / Math.PI).toFixed(6)]);
  }
  return coords;
}

function httpsPost(hostname, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: urlPath, method: 'POST', headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(180000, () => { req.destroy(); reject(new Error('Census API timeout')); });
    req.write(body);
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'ProjectBigFoot/1.0 PSI-ETS-NetworkAnalysis (samadkhaan@gmail.com)' }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Nominatim timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}

// Pick the address line most likely to be a geocodeable street address.
// Prefer addr1 if it starts with a digit; otherwise try addr2; fall back to addr1.
function pickStreet(s) {
  const a1 = (s.address1 || '').trim();
  const a2 = (s.address2 || '').trim();
  if (/^\d/.test(a1)) return a1;
  if (/^\d/.test(a2)) return a2;
  return a1;
}

async function geocodeCensusBatch(sites) {
  const csvLines = sites.map((s, i) => {
    const street = pickStreet(s).replace(/"/g, '');
    const city   = (s.city     || '').replace(/"/g, '').trim();
    const state  = (s.state    || '').replace(/"/g, '').trim();
    const zip    = (s.zip      || '').replace(/"/g, '').replace(/-.*$/, '').trim();
    return `${i},"${street}","${city}","${state}","${zip}"`;
  });
  const csvContent = csvLines.join('\n');

  const boundary = 'FormBoundary' + Date.now();
  const body = [
    `--${boundary}\r\nContent-Disposition: form-data; name="benchmark"\r\n\r\nPublic_AR_Current`,
    `--${boundary}\r\nContent-Disposition: form-data; name="addressFile"; filename="addr.csv"\r\nContent-Type: text/plain\r\n\r\n${csvContent}`,
    `--${boundary}--`,
  ].join('\r\n');

  const raw = await httpsPost(
    'geocoding.geo.census.gov',
    '/geocoder/locations/addressbatch',
    body,
    {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': Buffer.byteLength(body),
    }
  );

  const results = {};
  raw.split('\n').forEach(line => {
    line = line.trim();
    if (!line) return;
    const parts = parseCSVLine(line);
    if (parts.length < 6) return;
    const idx    = parseInt(parts[0]);
    const status = (parts[2] || '').trim();
    const coords = (parts[5] || '').trim();
    if (status === 'Match' && coords) {
      // Census returns lon,lat — NOT lat,lon
      const [lonStr, latStr] = coords.split(',');
      const lat = parseFloat(latStr), lon = parseFloat(lonStr);
      if (!isNaN(lat) && !isNaN(lon)) results[idx] = { lat, lon, source: 'census' };
    }
  });
  return results;
}

async function geocodeNominatim(site) {
  const street = pickStreet(site).replace(/['"]/g, '').trim();
  const params = new URLSearchParams({ format: 'json', limit: '1', addressdetails: '0' });
  if (street)    params.set('street',     street);
  if (site.city) params.set('city',       site.city);
  if (site.zip)  params.set('postalcode', site.zip.replace(/-.*$/, ''));
  const countryMap = { 'USA': 'US', 'Puerto Rico': 'US', 'Virgin Islands, U.S.': 'VI' };
  params.set('country', countryMap[site.country] || 'US');

  try {
    const raw  = await httpsGet(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, source: 'nominatim' };
    }
  } catch (e) {
    console.error(`  Nominatim error for "${site.name}": ${e.message}`);
  }
  return null;
}

async function main() {
  console.log('PSI Test Center Geocoder');
  console.log('─'.repeat(55));

  const rawPath = path.join(__dirname, 'psi_raw.json');
  const raw = fs.readFileSync(rawPath, 'utf8').replace(/^﻿/, ''); // strip BOM
  const all = JSON.parse(raw);

  const INCLUDE = new Set(['USA', 'Puerto Rico', 'Virgin Islands, U.S.']);
  const sites = all.filter(s => INCLUDE.has(s.country));

  const usaSites       = sites.filter(s => s.country === 'USA');
  const territorySites = sites.filter(s => s.country !== 'USA');
  console.log(`Sites to geocode: ${sites.length} (${usaSites.length} USA + ${territorySites.length} territories)`);

  // ── 1. Census batch ──────────────────────────────────────
  const coordMap = {};
  let batchNum = 1, start = 0;
  while (start < usaSites.length) {
    const batch = usaSites.slice(start, start + CENSUS_BATCH_SIZE);
    process.stdout.write(`Census batch ${batchNum} (${batch.length} addrs)... `);
    try {
      const res = await geocodeCensusBatch(batch);
      const matched = Object.keys(res).length;
      process.stdout.write(`matched ${matched}/${batch.length}\n`);
      for (const [localIdx, coord] of Object.entries(res)) {
        coordMap[start + parseInt(localIdx)] = coord;
      }
    } catch (e) {
      console.error(`FAILED: ${e.message}`);
    }
    start += CENSUS_BATCH_SIZE;
    batchNum++;
    if (start < usaSites.length) { process.stdout.write('  (pausing 3s)\n'); await sleep(3000); }
  }

  // ── 2. Nominatim fallback ────────────────────────────────
  const fallbackQueue = [];
  usaSites.forEach((s, i) => { if (!coordMap[i]) fallbackQueue.push({ site: s, idx: i }); });
  territorySites.forEach((s, i) => fallbackQueue.push({ site: s, idx: usaSites.length + i }));

  if (fallbackQueue.length > 0) {
    console.log(`\nNominatim fallback: ${fallbackQueue.length} sites`);
    for (const { site, idx } of fallbackQueue) {
      const label = site.name.substring(0, 48).padEnd(48);
      process.stdout.write(`  ${label} `);
      const coord = await geocodeNominatim(site);
      if (coord) {
        coordMap[idx] = coord;
        process.stdout.write(`✓\n`);
      } else {
        process.stdout.write(`✗ NOT FOUND\n`);
      }
      await sleep(NOMINATIM_DELAY_MS);
    }
  }

  // ── 3. Build GeoJSON ─────────────────────────────────────
  const allSites = [...usaSites, ...territorySites];
  const siteFeatures = [], radiiFeatures = [];
  let skipped = 0;

  allSites.forEach((site, i) => {
    const coord = coordMap[i];
    if (!coord) { console.warn(`  SKIP (no coord): ${site.name}`); skipped++; return; }
    const { lat, lon } = coord;
    const category = site.propertyType === 'PSI Owned' ? 'OO' : '3P';
    const address = [site.address1, site.address2, site.address3, site.address4].filter(Boolean).join(', ');

    siteFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { id: site.testCenterId, name: site.name, propertyType: site.propertyType, category, address, city: site.city, state: site.state, zip: site.zip, country: site.country, geocodeSource: coord.source }
    });
    radiiFeatures.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [generateCircle(lon, lat)] },
      properties: { siteId: site.testCenterId, propertyType: site.propertyType, category }
    });
  });

  // ── 4. Write output ──────────────────────────────────────
  const outDir = path.join(__dirname, '..', 'public', 'data');
  fs.mkdirSync(outDir, { recursive: true });

  const sitesPath = path.join(outDir, 'data_psi_sites.geojson');
  const radiiPath = path.join(outDir, 'data_psi_radii.geojson');
  fs.writeFileSync(sitesPath, JSON.stringify({ type: 'FeatureCollection', features: siteFeatures }));
  fs.writeFileSync(radiiPath, JSON.stringify({ type: 'FeatureCollection', features: radiiFeatures }));

  console.log('\n' + '─'.repeat(55));
  console.log(`Done. Geocoded: ${siteFeatures.length}, Skipped: ${skipped}`);
  const src = {};
  Object.values(coordMap).forEach(c => { src[c.source] = (src[c.source] || 0) + 1; });
  console.log(`Sources: Census=${src.census || 0}, Nominatim=${src.nominatim || 0}`);
  console.log(`→ ${sitesPath}`);
  console.log(`→ ${radiiPath}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
