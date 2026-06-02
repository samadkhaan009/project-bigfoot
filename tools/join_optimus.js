/**
 * Joins Optimus scores onto PSI O&O features in data_psi_sites.geojson.
 * Matches on siteId (Optimus) vs id (GeoJSON). Only O&O sites are enriched.
 * Run: node tools/join_optimus.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const sitesPath  = path.join(__dirname, '..', 'public', 'data', 'data_psi_sites.geojson');
const rawPath    = path.join(__dirname, 'optimus_raw.json');
const catsPath   = path.join(__dirname, 'optimus_categories.json');

const sites  = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
const optRaw = JSON.parse(fs.readFileSync(rawPath,  'utf8').replace(/^﻿/, ''));
const cats   = JSON.parse(fs.readFileSync(catsPath, 'utf8').replace(/^﻿/, ''));

const optById  = Object.fromEntries(optRaw.map(r => [r.siteId, r]));
const catsById = Object.fromEntries(cats.map(r => [r.siteId, r]));

let joined = 0, skipped = 0;

sites.features.forEach(f => {
  const p = f.properties;
  if (p.category !== 'OO') return; // Optimus only applies to O&O

  const rec = optById[String(p.id)];
  if (rec) {
    p.optimusScore    = rec.optimusScore    ?? null;
    p.optimusTier     = rec.optimusTier     || null;
    p.fy25Volume      = rec.fy25Volume      ?? null;
    p.fy25Utilization = rec.fy25Utilization ?? null;
    p.priority        = rec.priority        || null;
    p.quickWins       = rec.quickWins       || null;
    // Category scores + flags
    const cat = catsById[String(p.id)];
    if (cat) {
      p.osDate      = cat.submissionDate || null;
      p.oc01 = cat.c01 ?? null; p.oc02 = cat.c02 ?? null; p.oc03 = cat.c03 ?? null;
      p.oc04 = cat.c04 ?? null; p.oc05 = cat.c05 ?? null; p.oc06 = cat.c06 ?? null;
      p.oc07 = cat.c07 ?? null; p.oc08 = cat.c08 ?? null; p.oc09 = cat.c09 ?? null;
      p.adaFlag      = cat.adaFlag      === true;
      p.brandingFlag = cat.brandingFlag === true;
    } else {
      ['osDate','oc01','oc02','oc03','oc04','oc05','oc06','oc07','oc08','oc09'].forEach(k => { p[k] = null; });
      p.adaFlag = p.brandingFlag = false;
    }
    joined++;
  } else {
    // Ensure fields exist as null for clean GeoJSON
    p.optimusScore = p.optimusTier = p.fy25Volume = p.fy25Utilization = null;
    p.priority = p.quickWins = null;
    p.osDate = null;
    ['oc01','oc02','oc03','oc04','oc05','oc06','oc07','oc08','oc09'].forEach(k => { p[k] = null; });
    p.adaFlag = p.brandingFlag = false;
    skipped++;
  }
});

fs.writeFileSync(sitesPath, JSON.stringify(sites));

const tierDist = {};
sites.features.filter(f => f.properties.optimusTier)
  .forEach(f => { const t = f.properties.optimusTier; tierDist[t] = (tierDist[t]||0)+1; });

console.log(`Optimus join complete`);
console.log(`  O&O joined:    ${joined}`);
console.log(`  O&O no match:  ${skipped}`);
console.log(`  Tier distribution:`, tierDist);
