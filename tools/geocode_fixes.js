/**
 * Geocodes the corrected addresses from tools/geocoding_failures.csv
 * and merges results into the existing data_psi_sites.geojson / data_psi_radii.geojson.
 * Run: node tools/geocode_fixes.js
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const RADIUS_MILES   = 50;
const CIRCLE_POINTS  = 64;
const NOMINATIM_WAIT = 1200;

// ── Geo helpers ──────────────────────────────────────────
function generateCircle(lon, lat) {
  const R = 3958.8, d = RADIUS_MILES / R;
  const lat1 = lat * Math.PI / 180, lon1 = lon * Math.PI / 180;
  const coords = [];
  for (let i = 0; i <= CIRCLE_POINTS; i++) {
    const b = (2 * Math.PI * i) / CIRCLE_POINTS;
    const lat2 = Math.asin(Math.sin(lat1)*Math.cos(d) + Math.cos(lat1)*Math.sin(d)*Math.cos(b));
    const lon2 = lon1 + Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat1), Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
    coords.push([+(lon2*180/Math.PI).toFixed(6), +(lat2*180/Math.PI).toFixed(6)]);
  }
  return coords;
}

// ── HTTP helpers ─────────────────────────────────────────
function httpsPost(hostname, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: urlPath, method: 'POST', headers }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(180000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const p = new URL(url);
    const req = https.get({ hostname: p.hostname, path: p.pathname + p.search, headers: { 'User-Agent': 'ProjectBigFoot/1.0 PSI-ETS (samadkhaan@gmail.com)' } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── CSV parser ───────────────────────────────────────────
function parseCSVLine(line) {
  const out = []; let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

// ── Pick best street line ────────────────────────────────
function pickStreet(addr1, addr2) {
  const a1 = (addr1 || '').trim(), a2 = (addr2 || '').trim();
  if (/^\d/.test(a1)) return a1;
  if (/^\d/.test(a2)) return a2;
  return a1;
}

// ── Census batch geocode ─────────────────────────────────
async function geocodeCensusBatch(sites) {
  const csvLines = sites.map((s, i) => {
    const street = pickStreet(s.Address1, s.Address2).replace(/"/g, '');
    const city   = (s.City  || '').replace(/"/g, '');
    const state  = (s.State || '').replace(/"/g, '');
    const zip    = (s.ZIP   || '').replace(/"/g, '').replace(/-.*$/, '');
    return `${i},"${street}","${city}","${state}","${zip}"`;
  });

  const boundary = 'FB' + Date.now();
  const body = [
    `--${boundary}\r\nContent-Disposition: form-data; name="benchmark"\r\n\r\nPublic_AR_Current`,
    `--${boundary}\r\nContent-Disposition: form-data; name="addressFile"; filename="a.csv"\r\nContent-Type: text/plain\r\n\r\n${csvLines.join('\n')}`,
    `--${boundary}--`,
  ].join('\r\n');

  const raw = await httpsPost('geocoding.geo.census.gov', '/geocoder/locations/addressbatch', body, {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': Buffer.byteLength(body),
  });

  const results = {};
  raw.split('\n').forEach(line => {
    line = line.trim(); if (!line) return;
    const p = parseCSVLine(line);
    if (p.length < 6) return;
    const idx = parseInt(p[0]);
    if ((p[2] || '').trim() === 'Match' && p[5]) {
      // Census returns lon,lat
      const [lonStr, latStr] = p[5].split(',');
      const lat = parseFloat(latStr), lon = parseFloat(lonStr);
      if (!isNaN(lat) && !isNaN(lon)) results[idx] = { lat, lon, source: 'census' };
    }
  });
  return results;
}

// ── Nominatim fallback ───────────────────────────────────
async function geocodeNominatim(s) {
  const street = pickStreet(s.Address1, s.Address2).replace(/['"]/g, '').trim();
  const params = new URLSearchParams({ format: 'json', limit: '1', addressdetails: '0' });
  if (street)  params.set('street',     street);
  if (s.City)  params.set('city',       s.City);
  if (s.ZIP)   params.set('postalcode', s.ZIP.replace(/-.*$/, ''));
  const cmap = { 'USA': 'US', 'Puerto Rico': 'US', 'Virgin Islands, U.S.': 'VI' };
  params.set('country', cmap[s.Country] || 'US');
  try {
    const data = JSON.parse(await httpsGet(`https://nominatim.openstreetmap.org/search?${params}`));
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, source: 'nominatim' };
    }
  } catch (e) { /* silent */ }
  return null;
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  const csvPath    = path.join(__dirname, 'geocoding_failures.csv');
  const sitesPath  = path.join(__dirname, '..', 'public', 'data', 'data_psi_sites.geojson');
  const radiiPath  = path.join(__dirname, '..', 'public', 'data', 'data_psi_radii.geojson');

  const fixes = readCSV(csvPath);
  console.log(`Geocoding Fixes — ${fixes.length} sites from CSV`);
  console.log('─'.repeat(55));

  // ── 1. Census batch ──────────────────────────────────
  process.stdout.write(`Census batch (${fixes.length} addresses)... `);
  let censusResults = {};
  try {
    censusResults = await geocodeCensusBatch(fixes);
    console.log(`matched ${Object.keys(censusResults).length}/${fixes.length}`);
  } catch (e) {
    console.error('Census batch failed:', e.message);
  }

  // ── 2. Nominatim for any misses ──────────────────────
  const needNominatim = fixes
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => !censusResults[i]);

  if (needNominatim.length > 0) {
    console.log(`\nNominatim fallback: ${needNominatim.length} sites`);
    for (const { s, i } of needNominatim) {
      const label = s.SiteName.substring(0, 48).padEnd(48);
      process.stdout.write(`  ${label} `);
      const coord = await geocodeNominatim(s);
      if (coord) { censusResults[i] = coord; process.stdout.write('✓\n'); }
      else        { process.stdout.write('✗ NOT FOUND\n'); }
      await sleep(NOMINATIM_WAIT);
    }
  }

  // ── 3. Build new features ────────────────────────────
  const newSiteFeatures  = [];
  const newRadiiFeatures = [];
  const stillFailed      = [];

  fixes.forEach((s, i) => {
    const coord = censusResults[i];
    if (!coord) { stillFailed.push(s); return; }
    const { lat, lon } = coord;
    const category = s.PropertyType === 'PSI Owned' ? 'OO' : '3P';
    const address  = [s.Address1, s.Address2].filter(Boolean).join(', ');

    newSiteFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { id: s.SiteID, name: s.SiteName, propertyType: s.PropertyType, category, address, city: s.City, state: s.State, zip: s.ZIP, country: s.Country, geocodeSource: coord.source }
    });
    newRadiiFeatures.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [generateCircle(lon, lat)] },
      properties: { siteId: s.SiteID, propertyType: s.PropertyType, category }
    });
  });

  // ── 4. Merge into existing GeoJSON ───────────────────
  const existingSites = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
  const existingRadii = JSON.parse(fs.readFileSync(radiiPath,  'utf8'));

  // Remove any stale entries for these IDs (in case of re-run)
  const fixIds = new Set(fixes.map(s => s.SiteID));
  existingSites.features = existingSites.features.filter(f => !fixIds.has(f.properties.id));
  existingRadii.features = existingRadii.features.filter(f => !fixIds.has(f.properties.siteId));

  existingSites.features.push(...newSiteFeatures);
  existingRadii.features.push(...newRadiiFeatures);

  fs.writeFileSync(sitesPath, JSON.stringify(existingSites));
  fs.writeFileSync(radiiPath,  JSON.stringify(existingRadii));

  // ── 5. Summary ───────────────────────────────────────
  console.log('\n' + '─'.repeat(55));
  console.log(`Added:    ${newSiteFeatures.length} new sites`);
  console.log(`Total now: ${existingSites.features.length} sites in GeoJSON`);
  if (stillFailed.length > 0) {
    console.log(`\nStill failed (${stillFailed.length}):`);
    stillFailed.forEach(s => console.log(`  [${s.SiteID}] ${s.SiteName} — ${s.City}, ${s.State}`));
  } else {
    console.log('All corrected addresses geocoded successfully.');
  }

  // Update CSV to only keep the ones still failed
  if (stillFailed.length > 0 && stillFailed.length < fixes.length) {
    const header = '"SiteID","SiteName","PropertyType","Address1","Address2","City","State","ZIP","Country","FailReason"';
    const lines  = stillFailed.map(s =>
      [s.SiteID, s.SiteName, s.PropertyType, s.Address1, s.Address2, s.City, s.State, s.ZIP, s.Country, s.FailReason]
        .map(v => `"${(v||'').replace(/"/g,'""')}"`)
        .join(',')
    );
    fs.writeFileSync(csvPath, [header, ...lines].join('\r\n'), 'utf8');
    console.log(`\nUpdated CSV now contains only the ${stillFailed.length} remaining failures.`);
  } else if (stillFailed.length === 0) {
    fs.unlinkSync(csvPath);
    console.log('\nAll fixed — CSV removed.');
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
