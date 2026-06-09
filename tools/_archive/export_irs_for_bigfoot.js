/**
 * Step 1 of the IRS Clearance Overlay.
 * Reads three pre-aggregated summary tabs from the Master Tracker via PowerShell COM,
 * then structures and writes tools/irs_clearance_data.json.
 *
 * Run: node tools/export_irs_for_bigfoot.js
 *
 * Sheet layout confirmed:
 *   Site Summary  rows 2–893  cols: SiteId|SiteName|City|State|PropertyType|TotalTCAs|InProcess|Cleared|NotStarted|SiteActivated?
 *   City Summary  rows 2–484  cols: State|City|TotalTCAs|InProcess|Cleared|NotStarted|TotalSites|ActivatedSites
 *   State Summary rows 2–51   cols: State|TotalTCAs|InProcess|Cleared|NotStarted|%Cleared|TotalSites|ActivatedSites|%SitesActivated
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const EXCEL_PATH = String.raw`C:\Users\Samad.Khan\OneDrive - Educational Testing Service\Documents\PSI Documents - ASK\Channel PSI\4. Work Documents\IRS\Development\PSI_TCA_IRS_Master_Tracker_LIVE_v3_1.xlsx`;
const TMP_PATH   = path.join(__dirname, '_irs_raw_export.json');
const OUT_PATH   = path.join(__dirname, 'irs_clearance_data.json');

// ── PowerShell: copy file and read all three tabs ─────
const psScript = `
$src = '${EXCEL_PATH.replace(/'/g, "''")}'
$tmp = "$env:TEMP\\irs_export_tmp.xlsx"
Copy-Item $src $tmp -Force
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
$wb = $xl.Workbooks.Open($tmp)

function Parse-Num($v) { $n = ($v -replace '[^0-9.\\-]','') -as [double]; if ($n -ne $null) { return [int]$n } else { return 0 } }
function Parse-Pct($v) { $n = ($v -replace '%','').Trim() -as [double]; if ($n -ne $null) { return [math]::Round($n/100,4) } else { return 0 } }

# Site Summary
$shS = $wb.Sheets.Item("Site Summary")
$siteRows = New-Object System.Collections.Generic.List[object]
for ($r = 2; $r -le $shS.UsedRange.Rows.Count; $r++) {
    $siteId = $shS.Cells.Item($r,1).Text.Trim()
    if (-not $siteId) { continue }
    $obj = @{
        siteId       = $siteId
        siteName     = $shS.Cells.Item($r,2).Text.Trim()
        city         = $shS.Cells.Item($r,3).Text.Trim()
        state        = $shS.Cells.Item($r,4).Text.Trim()
        propertyType = $shS.Cells.Item($r,5).Text.Trim()
        totalTCAs    = (Parse-Num $shS.Cells.Item($r,6).Text)
        inProcess    = (Parse-Num $shS.Cells.Item($r,7).Text)
        cleared      = (Parse-Num $shS.Cells.Item($r,8).Text)
        notStarted   = (Parse-Num $shS.Cells.Item($r,9).Text)
        activated    = ($shS.Cells.Item($r,10).Text.Trim() -eq "✅ Activated")
    }
    $siteRows.Add($obj)
}

# City Summary
$shC = $wb.Sheets.Item("City Summary")
$cityRows = New-Object System.Collections.Generic.List[object]
for ($r = 2; $r -le $shC.UsedRange.Rows.Count; $r++) {
    $state = $shC.Cells.Item($r,1).Text.Trim()
    $city  = $shC.Cells.Item($r,2).Text.Trim()
    if (-not $state -or -not $city) { continue }
    $obj = @{
        state          = $state
        city           = $city
        cityTotalTCAs  = (Parse-Num $shC.Cells.Item($r,3).Text)
        cityInProcess  = (Parse-Num $shC.Cells.Item($r,4).Text)
        cityCleared    = (Parse-Num $shC.Cells.Item($r,5).Text)
        cityNotStarted = (Parse-Num $shC.Cells.Item($r,6).Text)
        citySites      = (Parse-Num $shC.Cells.Item($r,7).Text)
        cityActivated  = (Parse-Num $shC.Cells.Item($r,8).Text)
    }
    $cityRows.Add($obj)
}

# State Summary
$shSt = $wb.Sheets.Item("State Summary")
$stateRows = New-Object System.Collections.Generic.List[object]
for ($r = 2; $r -le $shSt.UsedRange.Rows.Count; $r++) {
    $state = $shSt.Cells.Item($r,1).Text.Trim()
    if (-not $state) { continue }
    $obj = @{
        state              = $state
        stateTotalTCAs     = (Parse-Num $shSt.Cells.Item($r,2).Text)
        stateInProcess     = (Parse-Num $shSt.Cells.Item($r,3).Text)
        stateCleared       = (Parse-Num $shSt.Cells.Item($r,4).Text)
        stateNotStarted    = (Parse-Num $shSt.Cells.Item($r,5).Text)
        statePctCleared    = (Parse-Pct $shSt.Cells.Item($r,6).Text)
        stateSites         = (Parse-Num $shSt.Cells.Item($r,7).Text)
        stateActivated     = (Parse-Num $shSt.Cells.Item($r,8).Text)
        statePctActivated  = (Parse-Pct $shSt.Cells.Item($r,9).Text)
    }
    $stateRows.Add($obj)
}

$wb.Close($false); $xl.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($xl) | Out-Null
Remove-Item $tmp -ErrorAction SilentlyContinue

$out = @{ sites=$siteRows; cities=$cityRows; states=$stateRows } | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText('${TMP_PATH.replace(/\\/g, '\\\\')}', $out, [System.Text.Encoding]::UTF8)
Write-Output "PS_OK sites=$($siteRows.Count) cities=$($cityRows.Count) states=$($stateRows.Count)"
`;

console.log('Reading Master Tracker via PowerShell COM…');
const ps = spawnSync('powershell', ['-NoProfile', '-Command', psScript], { encoding: 'utf8', timeout: 120000 });

if (ps.status !== 0) {
  console.error('PowerShell failed:\n', ps.stderr || ps.stdout);
  process.exit(1);
}

const psOut = (ps.stdout || '').trim();
console.log('PowerShell:', psOut.split('\n').find(l => l.startsWith('PS_OK')) || psOut.slice(-200));

if (!fs.existsSync(TMP_PATH)) {
  console.error('Temp file not written — check PS errors above');
  process.exit(1);
}

// ── Structure into final JSON ─────────────────────────
const raw = JSON.parse(fs.readFileSync(TMP_PATH, 'utf8').replace(/^﻿/, ''));
fs.unlinkSync(TMP_PATH);

// sites → object keyed by SiteId string
const sites = {};
for (const r of raw.sites) {
  const id = String(r.siteId);
  sites[id] = {
    siteId:        id,
    siteName:      r.siteName,
    city:          r.city,
    state:         r.state,
    irsSegment:    r.propertyType === 'PSI Owned' ? 'PSI Owned' : 'PSI 3rd Party',
    irsTotalTCAs:  r.totalTCAs,
    irsInProcess:  r.inProcess,
    irsCleared:    r.cleared,
    irsNotStarted: r.notStarted,
    irsActivated:  r.activated === true,
    irsSubmitted:  r.inProcess + r.cleared,   // proxy: submitted = in-process + cleared
  };
}

// cities → object keyed by "State|City"
const cities = {};
for (const r of raw.cities) {
  const key = `${r.state}|${r.city}`;
  cities[key] = {
    state:         r.state,
    city:          r.city,
    citySites:     r.citySites,
    cityActivated: r.cityActivated,
    cityCleared:   r.cityCleared,
    cityInProcess: r.cityInProcess,
  };
}

// states → object keyed by state name
const states = {};
for (const r of raw.states) {
  states[r.state] = {
    stateSites:        r.stateSites,
    stateActivated:    r.stateActivated,
    stateCleared:      r.stateCleared,
    stateInProcess:    r.stateInProcess,
    statePctActivated: r.statePctActivated,
  };
}

// Add headline KPI summary from Summary tab (unique TCA counts — NOT site-level rollups)
// Source: Summary tab rows 5–21 read as static reference values.
// These are the authoritative network-wide figures; site-level cleared/inProcess are
// inflated when a TCA is assigned to multiple sites (S1–S10), which is expected.
const summary = {
  totalTCAs:        1934,
  tcaOO:            667,
  tca3P:            1267,
  tcaInProcess:     678,
  tcaFinalCleared:  159,
  totalSites:       892,
  activatedSites:   118,
  pctActivated:     0.132,
  statesActivated:  37,
  note: 'Unique TCA counts from Summary tab. Per-site TCA counts in sites[] are inflated for multi-site TCA assignments.',
};

const output = { summary, sites, cities, states };
fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

// ── Validation summary ────────────────────────────────
const siteArr   = Object.values(sites);
const activated = siteArr.filter(s => s.irsActivated).length;
const inProc    = siteArr.filter(s => s.irsInProcess > 0).length;
const totalClr  = siteArr.reduce((s, r) => s + r.irsCleared,   0);
const totalIP   = siteArr.reduce((s, r) => s + r.irsInProcess, 0);

console.log('\n── irs_clearance_data.json written ──────────────');
console.log(`  Sites:          ${siteArr.length}  (expected 892)`);
console.log(`  Activated:      ${activated}  (expected 118)`);
console.log(`  In-process:     ${inProc} sites`);
console.log(`  Cleared TCAs:   ${totalClr}  (expected 159)`);
console.log(`  In-proc TCAs:   ${totalIP}  (expected ~678)`);
console.log(`  Cities:         ${Object.keys(cities).length}  (expected 483)`);
console.log(`  States:         ${Object.keys(states).length}  (expected 50)`);
console.log(`\n  Output: ${OUT_PATH}`);
console.log('\n  Sample site (ID=1):');
console.log(JSON.stringify(sites['1'], null, 4));
