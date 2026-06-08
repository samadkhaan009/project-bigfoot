/**
 * Exports Priority Cities tab from Master Tracker, aggregates by city+state,
 * geocodes via Nominatim, writes public/data/priority_cities.geojson.
 * Run: node tools/export_priority_cities.js
 */
import { spawnSync } from 'child_process';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const EXCEL_PATH = String.raw`C:\Users\Samad.Khan\OneDrive - Educational Testing Service\Documents\PSI Documents - ASK\Channel PSI\4. Work Documents\IRS\Development\PSI_TCA_IRS_Master_Tracker_LIVE_v3_1.xlsx`;
const TMP_JSON   = path.join(__dirname, '_pc_raw.json');
const OUT_PATH   = path.join(ROOT, 'public', 'data', 'priority_cities.geojson');
const NOM_DELAY  = 1200;

// ── PowerShell: read Priority Cities tab ─────────────
const psScript = `
$src='${EXCEL_PATH.replace(/'/g,"''")}'; $tmp="$env:TEMP\\pc_tmp.xlsx"
Copy-Item $src $tmp -Force
$xl=New-Object -ComObject Excel.Application; $xl.Visible=$false; $xl.DisplayAlerts=$false
$wb=$xl.Workbooks.Open($tmp)
$sh=$wb.Sheets.Item("Priority Cities"); $rows=$sh.UsedRange.Rows.Count
$data=New-Object System.Collections.Generic.List[object]
for($r=2;$r-le$rows;$r++){
  $city=$sh.Cells.Item($r,2).Text.Trim()
  if(-not $city){continue}
  $n=$sh.Cells.Item($r,8).Value2-as[int]; $ip=$sh.Cells.Item($r,9).Value2-as[int]; $cl=$sh.Cells.Item($r,10).Value2-as[int]
  $data.Add(@{
    state      = $sh.Cells.Item($r,1).Text.Trim()
    city       = $city
    cityLevel  = ($sh.Cells.Item($r,3).Text.Trim()-as[int])
    isPriority = ($sh.Cells.Item($r,4).Text.Trim() -ne "")
    propType   = $sh.Cells.Item($r,5).Text.Trim()
    siteCode   = $sh.Cells.Item($r,6).Text.Trim()
    totalTCAs  = if($n){$n}else{0}
    inProcess  = if($ip){$ip}else{0}
    cleared    = if($cl){$cl}else{0}
    activated  = ($sh.Cells.Item($r,11).Text.Trim() -eq "✅ Activated")
  })
}
$wb.Close($false); $xl.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($xl)|Out-Null
Remove-Item $tmp -ErrorAction SilentlyContinue
[System.IO.File]::WriteAllText('${TMP_JSON.replace(/\\/g,'\\\\')}',($data|ConvertTo-Json -Depth 3),[System.Text.Encoding]::UTF8)
Write-Output "PS_OK rows=$($data.Count)"
`;

console.log('Reading Priority Cities tab…');
const ps = spawnSync('powershell', ['-NoProfile', '-Command', psScript], { encoding: 'utf8', timeout: 120000 });
if (ps.status !== 0) { console.error(ps.stderr || ps.stdout); process.exit(1); }
console.log('PowerShell:', (ps.stdout || '').trim().split('\n').find(l => l.startsWith('PS_OK')));

const rawRows = JSON.parse(fs.readFileSync(TMP_JSON, 'utf8').replace(/^﻿/, ''));
fs.unlinkSync(TMP_JSON);

// ── Aggregate by city+state ───────────────────────────
const cityMap = {};
for (const r of rawRows) {
  const key = `${r.city}|${r.state}`;
  if (!cityMap[key]) {
    cityMap[key] = {
      city: r.city, state: r.state,
      cityStateKey: key,
      cityLevel: r.cityLevel || null,
      isPriority: false,
      ooCount: 0, partnerCount: 0, totalSites: 0,
      totalTCAs: 0, inProcess: 0, cleared: 0,
      siteActivated: false,
    };
  }
  const c = cityMap[key];
  if (r.isPriority) c.isPriority = true;
  if (r.cityLevel && (c.cityLevel === null || r.cityLevel < c.cityLevel)) c.cityLevel = r.cityLevel;
  if (r.propType === 'Owned') c.ooCount++; else c.partnerCount++;
  c.totalSites++;
  c.totalTCAs  += r.totalTCAs;
  c.inProcess  += r.inProcess;
  c.cleared    += r.cleared;
  if (r.activated) c.siteActivated = true;
}

const cities = Object.values(cityMap);
console.log(`\nAggregated: ${cities.length} unique city+state combinations`);
console.log(`  Priority (Level 1-3): ${cities.filter(c => c.isPriority).length}`);
console.log(`  Level 4 / unleveled:  ${cities.filter(c => !c.isPriority).length}`);

// ── Geocode via Nominatim ─────────────────────────────
function nominatimGet(city, state) {
  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&country=US&format=json&limit=1`;
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = https.get({ hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'User-Agent': 'ProjectBigFoot/1.0 PSI-ETS (samadkhaan@gmail.com)' } },
      r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
    req.on('error', rej);
    req.setTimeout(15000, () => { req.destroy(); rej(new Error('timeout')); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log(`\nGeocoding ${cities.length} cities via Nominatim (~${Math.ceil(cities.length * NOM_DELAY / 60000)} min)…`);
const failed = [];
let done = 0;

for (const city of cities) {
  try {
    const raw  = JSON.parse(await nominatimGet(city.city, city.state));
    if (raw.length > 0) {
      city.lon = parseFloat(raw[0].lon);
      city.lat = parseFloat(raw[0].lat);
    } else {
      city.lon = null; city.lat = null;
      failed.push(`${city.city}, ${city.state}`);
    }
  } catch (e) {
    city.lon = null; city.lat = null;
    failed.push(`${city.city}, ${city.state} (${e.message})`);
  }
  done++;
  if (done % 50 === 0) process.stdout.write(`  ${done}/${cities.length}\n`);
  await sleep(NOM_DELAY);
}

// ── Write GeoJSON ─────────────────────────────────────
const features = cities
  .filter(c => c.lon != null && c.lat != null)
  .map(c => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    properties: {
      city:         c.city,
      state:        c.state,
      cityStateKey: c.cityStateKey,
      cityLevel:    c.cityLevel,
      isPriority:   c.isPriority,
      ooCount:      c.ooCount,
      partnerCount: c.partnerCount,
      totalSites:   c.totalSites,
      totalTCAs:    c.totalTCAs,
      inProcess:    c.inProcess,
      cleared:      c.cleared,
      siteActivated: c.siteActivated,
    },
  }));

fs.writeFileSync(OUT_PATH, JSON.stringify({ type: 'FeatureCollection', features }));

console.log(`\n── priority_cities.geojson written ──────────────`);
console.log(`  Features:       ${features.length}`);
console.log(`  Geocoded:       ${cities.filter(c=>c.lon!=null).length}/${cities.length}`);
console.log(`  Failed (${failed.length}):`);
failed.forEach(f => console.log(`    ✗ ${f}`));
console.log(`  Output: ${OUT_PATH}`);
