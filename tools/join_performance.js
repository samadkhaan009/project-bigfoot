/**
 * Joins performance data (File 1) onto data_psi_sites.geojson features.
 * Adds: scoreBucket, scoreRaw, seats, cdVolume, avgMonthlyVol,
 *       zdTicketRate, dispRate, reschdRate, dmaRegion
 * Also writes public/data/data_psi_performance.json (reference copy).
 * Run: node tools/join_performance.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const perfRaw  = JSON.parse(fs.readFileSync(path.join(__dirname, 'performance_raw.json'), 'utf8').replace(/^﻿/, ''));
const sitesPath = path.join(__dirname, '..', 'public', 'data', 'data_psi_sites.geojson');
const perfPath  = path.join(__dirname, '..', 'public', 'data', 'data_psi_performance.json');

const sites = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));

// Build lookup keyed by tcId (string)
const perfById = Object.fromEntries(perfRaw.map(r => [r.tcId, r]));

let joined = 0, missing = 0;

sites.features.forEach(f => {
  const id   = String(f.properties.id);
  const perf = perfById[id];

  if (perf) {
    f.properties.scoreBucket   = perf.scoreBucket   || null;
    f.properties.scoreRaw      = perf.scoreRaw      || null;
    // Preserve seats from the source Excel (set in rebuild_sites.mjs); only fall
    // back to the performance value when the site has no source seat count.
    if (f.properties.seats == null) f.properties.seats = perf.seats || null;
    f.properties.cdVolume      = perf.cdVolume      || null;
    f.properties.avgMonthlyVol = perf.avgMonthlyVol || null;
    f.properties.zdTicketRate  = perf.zdTicketRate  ?? null;
    f.properties.dispRate      = perf.dispRate      ?? null;
    f.properties.reschdRate    = perf.reschdRate     ?? null;
    f.properties.dmaRegion     = perf.dmaRegion     || null;
    joined++;
  } else {
    // Ensure fields exist as null so MapLibre coalesce works cleanly.
    // NOTE: seats is intentionally NOT reset — source-Excel seat counts are kept.
    f.properties.scoreBucket = f.properties.scoreRaw = null;
    f.properties.cdVolume = f.properties.avgMonthlyVol = null;
    f.properties.zdTicketRate = f.properties.dispRate = f.properties.reschdRate = null;
    f.properties.dmaRegion = null;
    missing++;
  }
});

fs.writeFileSync(sitesPath, JSON.stringify(sites));
fs.writeFileSync(perfPath,  JSON.stringify({ records: perfRaw }, null, 2));

// Stats
const bucketDist = {};
sites.features.forEach(f => {
  const b = f.properties.scoreBucket;
  if (b) bucketDist[b] = (bucketDist[b] || 0) + 1;
});

console.log(`Performance join complete`);
console.log(`  Joined:  ${joined} / ${sites.features.length} sites`);
console.log(`  No match: ${missing} sites (shown gray in performance mode)`);
console.log(`\nScore bucket distribution (joined sites):`);
Object.keys(bucketDist).sort().forEach(b =>
  console.log(`  Bucket ${b}: ${bucketDist[b]} sites`)
);
console.log(`\n→ ${sitesPath}`);
console.log(`→ ${perfPath}`);
