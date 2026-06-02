/**
 * Joins lease intelligence data onto data_psi_sites.geojson features.
 * Uses tools/lease_crosswalk.json (HIGH + MEDIUM confidence only).
 * Run: node tools/join_lease.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const sitesPath    = path.join(__dirname, '..', 'public', 'data', 'data_psi_sites.geojson');
const crosswalkPath = path.join(__dirname, 'lease_crosswalk.json');

const sites    = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
const cw       = JSON.parse(fs.readFileSync(crosswalkPath, 'utf8'));

// Build lookup: tcId → lease record (HIGH + MEDIUM only)
const leaseById = {};
for (const rec of cw) {
  if (rec.matchedTcId && rec.confidence !== 'UNMATCHED') {
    leaseById[String(rec.matchedTcId)] = rec;
  }
}

// Parse utilization string "73%" → 0.73
const parsePct = v => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace('%', ''));
  return isNaN(n) ? null : +(n / 100).toFixed(4);
};

let joined = 0, cleared = 0;

sites.features.forEach(f => {
  const id  = String(f.properties.id);
  const rec = leaseById[id];

  if (rec) {
    f.properties.leaseAction       = rec.action          || null;
    f.properties.leaseStatus       = rec.status          || null;
    f.properties.daysRemaining     = rec.daysRemaining   ?? null;
    f.properties.leaseUtilization  = parsePct(rec.utilization);
    f.properties.monthlyRevenue    = rec.monthlyRevenue  ?? null;
    f.properties.contractFlag      = rec.contractFlag    === true;
    f.properties.recommendedAction = rec.recommendedAction || null;
    f.properties.licensureNote     = rec.licensureNote   || null;
    f.properties.opsNotes          = rec.opsNotes        || null;
    f.properties.leaseExpiry       = rec.leaseExpiry     || null;
    joined++;
  } else {
    // Ensure fields are null for clean GeoJSON
    ['leaseAction','leaseStatus','daysRemaining','leaseUtilization',
     'monthlyRevenue','contractFlag','recommendedAction','licensureNote',
     'opsNotes','leaseExpiry'].forEach(k => { f.properties[k] = null; });
    cleared++;
  }
});

fs.writeFileSync(sitesPath, JSON.stringify(sites));

// Summary
console.log(`Lease join complete`);
console.log(`  Joined: ${joined}  Cleared: ${cleared}`);

const actionCounts = {}, expiredSites = [], flaggedSites = [];
let totalRevenue = 0, expiredRevenue = 0;

sites.features.forEach(f => {
  const p = f.properties;
  if (!p.leaseAction) return;
  actionCounts[p.leaseAction] = (actionCounts[p.leaseAction]||0)+1;
  if (p.monthlyRevenue) totalRevenue += p.monthlyRevenue;
  if (p.leaseStatus === 'EXPIRED') {
    expiredSites.push(p.id);
    if (p.monthlyRevenue) expiredRevenue += p.monthlyRevenue;
  }
  if (p.contractFlag) flaggedSites.push(p.id);
});

console.log(`\nAction breakdown:`);
Object.entries(actionCounts).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${v.toString().padStart(3)}  ${k}`));
console.log(`\nExpired leases: ${expiredSites.length}`);
console.log(`Contract flags: ${flaggedSites.length}`);
console.log(`Total monthly revenue (matched): $${Math.round(totalRevenue).toLocaleString()}`);
console.log(`Expired monthly revenue at risk:  $${(expiredRevenue/1e6).toFixed(1)}M`);
