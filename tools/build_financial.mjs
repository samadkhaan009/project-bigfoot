/**
 * Builds data_financial.geojson from the FDIC branch-office locations export.
 * Source: tools/Locations_8_17_2026.csv  (FDIC BankFind, full download)
 * Filter: full-service brick-and-mortar / retail branches with valid coordinates.
 * Run: node tools/build_financial.mjs   (from project root)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'Locations_8_17_2026.csv');
const OUT = path.join(__dirname, '..', 'public', 'data', 'data_financial.geojson');

const KEEP = new Set([
  'FULL SERVICE - BRICK AND MORTAR',
  'Full Service - Brick and Mortar',
  'FULL SERVICE - RETAIL',
]);

// Minimal RFC-4180 CSV line parser (handles quoted fields + embedded commas/quotes)
function parseLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

const raw = fs.readFileSync(SRC, 'utf8').replace(/^﻿/, '');
const lines = raw.split(/\r?\n/).filter(l => l.length > 0);
const header = parseLine(lines[0]);
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

const col = (r, name) => (r[idx[name]] ?? '').trim();

let kept = 0, skippedType = 0, skippedCoord = 0, skippedBranch = 0;
const features = [];
for (let i = 1; i < lines.length; i++) {
  const r = parseLine(lines[i]);
  const stype = col(r, 'SERVTYPE_DESC');
  if (!KEEP.has(stype)) { skippedType++; continue; }
  // Main / headquarters office only — drops branch duplicates
  if (col(r, 'MAINOFF') !== '1') { skippedBranch++; continue; }
  const lonS = col(r, 'LONGITUDE'), latS = col(r, 'LATITUDE');
  const lon = parseFloat(lonS), lat = parseFloat(latS);
  if (!lonS || !latS || !Number.isFinite(lon) || !Number.isFinite(lat) || lon === 0 || lat === 0) { skippedCoord++; continue; }
  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      name:        col(r, 'OFFNAME'),
      institution: col(r, 'NAME'),
      city:        col(r, 'CITY'),
      state:       col(r, 'STALP'),
      zip:         col(r, 'ZIP'),
      address:     col(r, 'ADDRESS'),
      cbsaCode:    col(r, 'CBSA_NO'),
      mainOffice:  col(r, 'MAINOFF') === '1',
      serviceType: stype,
      category:    'Financial',
    },
  });
  kept++;
}

fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }));
const mb = fs.statSync(OUT).size / 1024 / 1024;
console.log(`FDIC financial layer built`);
console.log(`  features written:      ${kept}`);
console.log(`  skipped (wrong type):  ${skippedType}`);
console.log(`  skipped (branch):      ${skippedBranch}`);
console.log(`  skipped (no coords):   ${skippedCoord}`);
console.log(`  file size:             ${mb.toFixed(2)} MB`);
