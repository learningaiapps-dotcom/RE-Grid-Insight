// Adds plant CSVs (from the app's "All plants at once" export) to the stored history library.
// Usage: node scripts/add-history.cjs <folder> [<folder> ...]
// Each folder holds files like NRPC_<plant>.csv / WRPC_<plant>.csv / SRPC_<plant>.csv and, optionally,
// the <REGION>_checks_<from>_to_<to>.csv summary (used for the real plant name and data checks).
// Output: data/history/<REGION>/<file>.csv.gz plus data/history/index.json.
// A plant already in the library is merged: for every date present in the new file, the new rows replace the old.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const lib = path.join(root, "data", "history");
const indexFile = path.join(lib, "index.json");
const REGIONS = ["NRPC", "WRPC", "SRPC"];
const safe = s => String(s).replace(/[^\w.-]+/g, "_").slice(0, 60).replace(/_+$/, "");

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}
const cellOut = v => /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
const toText = rows => rows.map(r => r.map(cellOut).join(",")).join("\n") + "\n";
const read = file => fs.readFileSync(file, "utf8").replace(/^﻿/, "");

const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : {plants: []};
const byFile = new Map(index.plants.map(p => [p.file, p]));

for (const folder of process.argv.slice(2)) {
  const names = fs.readdirSync(folder).filter(n => n.toLowerCase().endsWith(".csv"));
  const checks = new Map();
  for (const n of names.filter(n => /_checks_/i.test(n))) {
    const region = n.split("_")[0].toUpperCase();
    const rows = parseCSV(read(path.join(folder, n)));
    const h = rows.shift().map(x => x.trim().toLowerCase());
    const iP = h.indexOf("plant"), iS = h.indexOf("status"), iC = h.indexOf("checks");
    for (const r of rows) checks.set(region + "_" + safe(r[iP]), {plant: r[iP], status: r[iS] || "", checks: r[iC] || ""});
  }
  for (const n of names) {
    if (/_(checks|skipped_files)_/i.test(n)) continue;
    const region = n.split("_")[0].toUpperCase();
    if (!REGIONS.includes(region)) { console.warn("Skipped (no NRPC_/WRPC_/SRPC_ prefix): " + n); continue; }
    const stem = n.replace(/\.csv$/i, "");
    const info = checks.get(stem) || {plant: stem.slice(region.length + 1), status: "", checks: ""};
    const rel = region + "/" + stem + ".csv.gz";
    const out = path.join(lib, rel);
    let rows = parseCSV(read(path.join(folder, n)));
    const header = rows.shift();
    if (!header || header[0].trim().toLowerCase() !== "date" || !rows.length) { console.warn("Skipped (no data): " + n); continue; }
    if (fs.existsSync(out)) {
      const old = parseCSV(zlib.gunzipSync(fs.readFileSync(out)).toString("utf8"));
      const oldHeader = old.shift();
      if (oldHeader.join(",") !== header.join(",")) throw new Error("Column headings differ from the stored file for " + n);
      const newDates = new Set(rows.map(r => r[0]));
      rows = old.filter(r => !newDates.has(r[0])).concat(rows);
    }
    rows = rows.map((r, i) => [r, i]).sort((a, b) => a[0][0].localeCompare(b[0][0]) || (+a[0][1]) - (+b[0][1]) || a[1] - b[1]).map(x => x[0]);
    fs.mkdirSync(path.dirname(out), {recursive: true});
    fs.writeFileSync(out, zlib.gzipSync(toText([header, ...rows]), {level: 9}));
    const dates = [...new Set(rows.map(r => r[0]))].sort();
    const prev = byFile.get(rel) || {};
    byFile.set(rel, {
      region, plant: info.plant || prev.plant, file: rel,
      first: dates[0], last: dates[dates.length - 1], dates: dates.length, records: rows.length,
      status: info.status || prev.status || "", checks: info.checks || prev.checks || ""
    });
  }
}
const plants = [...byFile.values()].sort((a, b) => a.region.localeCompare(b.region) || a.plant.localeCompare(b.plant));
fs.mkdirSync(lib, {recursive: true});
fs.writeFileSync(indexFile, JSON.stringify({updated: new Date().toISOString().slice(0, 10), plants}, null, 0));
for (const r of REGIONS) {
  const list = plants.filter(p => p.region === r);
  if (list.length) console.log(`${r}: ${list.length} plants, ${list.map(p => p.first).sort()[0]} to ${list.map(p => p.last).sort().pop()}`);
}
