/**
 * Injects 18 manually-verified coordinates into the GeoJSON files.
 * Reads address details from tools/geocoding_failures.csv,
 * matches by SiteID, and merges into existing GeoJSON.
 * Run: node tools/add_manual_coords.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── 18 manually verified coordinates ────────────────────
// Key = SiteID (matches geocoding_failures.csv)
const MANUAL = {
  '6199':  { lat: 34.1424, lon: -118.2551, propertyType: 'PSI Authorized' }, // Glendale - Integrated Digital Technologies
  '6264':  { lat: 42.4969, lon:  -71.1434, propertyType: 'MG TESTING'     }, // Woburn - Millennium Training Inst.
  '13111': { lat: 34.0645, lon:  -86.7680, propertyType: 'PSI Authorized' }, // Cullman - Wallace State Community College
  '5174':  { lat: 38.2069, lon:  -85.7543, propertyType: 'PSI Authorized' }, // Louisville - University of Louisville
  '5347':  { lat: 31.3571, lon:  -92.4282, propertyType: 'PSI Authorized' }, // Pineville - Flightline Air Service LLC
  '5124':  { lat: 44.2215, lon:  -93.9167, propertyType: 'PSI Authorized' }, // Mankato - North Star Aviation
  '19193': { lat: 44.9556, lon:  -93.1667, propertyType: 'PSI Authorized' }, // Saint Paul - Brainseed Testing Center
  '12907': { lat: 44.9239, lon:  -92.9544, propertyType: 'PSI Authorized' }, // Woodbury
  '6558':  { lat: 40.8187, lon:  -74.1143, propertyType: 'PSI Authorized' }, // Lyndhurst - K and M Testing Center
  '12956': { lat: 40.7891, lon:  -74.0601, propertyType: 'PSI Authorized' }, // Secaucus - AVNA Learning Center
  '18324': { lat: 43.2312, lon:  -75.4197, propertyType: 'PSI Authorized' }, // Rome - Mohawk Valley Testing Center
  '19147': { lat: 40.8173, lon:  -73.0307, propertyType: 'PSI Authorized' }, // Suffolk - AVNA Learning Center
  '13001': { lat: 46.8138, lon: -100.7587, propertyType: 'PSI Authorized' }, // Bismarck - North Dakota Safety Council
  '18587': { lat: 33.9967, lon:  -96.4086, propertyType: 'PSI Authorized' }, // Durant - Choctaw Nation of Oklahoma
  '5491':  { lat: 32.8193, lon:  -97.3624, propertyType: 'PSI Authorized' }, // Fort Worth - Pro Test
  '11510': { lat: 38.4163, lon:  -78.8742, propertyType: 'PSI Authorized' }, // Harrisonburg - Brainseed Testing Service
  '5037':  { lat: 41.5431, lon:  -83.6632, propertyType: 'PSI Owned'      }, // MAUMEE
  '6331':  { lat: 37.3454, lon:  -87.4990, propertyType: 'TD TESTING'     }, // Madisonville - Madisonville Community College
};

// ── Accurate 50-mile geographic circle ───────────────────
function generateCircle(lon, lat, radiusMiles = 50, pts = 64) {
  const R = 3958.8, d = radiusMiles / R;
  const lat1 = lat * Math.PI / 180, lon1 = lon * Math.PI / 180;
  const coords = [];
  for (let i = 0; i <= pts; i++) {
    const b = (2 * Math.PI * i) / pts;
    const lat2 = Math.asin(Math.sin(lat1)*Math.cos(d) + Math.cos(lat1)*Math.sin(d)*Math.cos(b));
    const lon2 = lon1 + Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat1), Math.cos(d) - Math.sin(lat1)*Math.sin(lat2));
    coords.push([+(lon2*180/Math.PI).toFixed(6), +(lat2*180/Math.PI).toFixed(6)]);
  }
  return coords;
}

// ── CSV parser ───────────────────────────────────────────
function parseCSVLine(line) {
  const out = []; let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') inQ = !inQ;
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

// ── Main ─────────────────────────────────────────────────
const csvPath   = path.join(__dirname, 'geocoding_failures.csv');
const sitesPath = path.join(__dirname, '..', 'public', 'data', 'data_psi_sites.geojson');
const radiiPath = path.join(__dirname, '..', 'public', 'data', 'data_psi_radii.geojson');

// Load address details — prefer CSV if it exists, fall back to psi_raw.json
let csvById = {};
const rawPath = path.join(__dirname, 'psi_raw.json');
if (fs.existsSync(csvPath)) {
  const csvRows = readCSV(csvPath);
  csvById = Object.fromEntries(csvRows.map(r => [r.SiteID, r]));
  console.log(`Using geocoding_failures.csv (${csvRows.length} rows)`);
} else {
  // CSV was deleted — build lookup from psi_raw.json
  const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf8').replace(/^﻿/, ''));
  rawData.forEach(r => {
    csvById[r.testCenterId] = {
      SiteID: r.testCenterId, SiteName: r.name, PropertyType: r.propertyType,
      Address1: r.address1, Address2: r.address2,
      City: r.city, State: r.state, ZIP: r.zip, Country: r.country,
    };
  });
  console.log(`CSV not found — using psi_raw.json (${rawData.length} rows)`);
}

// Load existing GeoJSON
const sitesGeo = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
const radiiGeo  = JSON.parse(fs.readFileSync(radiiPath, 'utf8'));

// Remove any stale entries for these IDs
const manualIds = new Set(Object.keys(MANUAL));
sitesGeo.features = sitesGeo.features.filter(f => !manualIds.has(f.properties.id));
radiiGeo.features  = radiiGeo.features.filter(f  => !manualIds.has(f.properties.siteId));

console.log('Adding 18 manually verified sites');
console.log('─'.repeat(55));

let added = 0;
const missing = [];

for (const [siteId, coord] of Object.entries(MANUAL)) {
  const row = csvById[siteId];
  if (!row) { missing.push(siteId); continue; }

  const { lat, lon, propertyType } = coord;
  const category = propertyType === 'PSI Owned' ? 'OO' : '3P';
  const address  = [row.Address1, row.Address2].filter(Boolean).join(', ');

  sitesGeo.features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      id: siteId, name: row.SiteName, propertyType, category,
      address, city: row.City, state: row.State,
      zip: row.ZIP, country: row.Country || 'USA',
      geocodeSource: 'manual',
    }
  });

  radiiGeo.features.push({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [generateCircle(lon, lat)] },
    properties: { siteId, propertyType, category }
  });

  console.log(`  ✓  [${siteId}] ${row.SiteName}`);
  added++;
}

if (missing.length) {
  console.log(`\nWarning: ${missing.length} ID(s) not found in CSV: ${missing.join(', ')}`);
}

// Write updated GeoJSON
fs.writeFileSync(sitesPath, JSON.stringify(sitesGeo));
fs.writeFileSync(radiiPath,  JSON.stringify(radiiGeo));

console.log('\n' + '─'.repeat(55));
console.log(`Added:      ${added} sites`);
console.log(`Total now:  ${sitesGeo.features.length} sites`);
console.log(`Radii:      ${radiiGeo.features.length} rings`);

if (fs.existsSync(csvPath)) {
  fs.unlinkSync(csvPath);
  console.log('\ntools/geocoding_failures.csv removed — all sites resolved.');
}
