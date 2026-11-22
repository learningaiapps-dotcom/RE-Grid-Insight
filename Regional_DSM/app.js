"use strict";
const el = id => document.getElementById(id);
const add = (parent, tag, text) => {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.append(node);
  return node;
};
let inputs = [], combined;
function clearOutput() {
  combined = null;
  el("output").hidden = true;
  el("msg").textContent = "";
}
function reset() {
  inputs = [];
  clearOutput();
  el("selection").hidden = true;
  el("inventory").textContent = "";
  el("files").value = "";
  const region = el("region").value;
  el("modeLabel").hidden = region !== "WRPC";
  el("files").accept = region === "NRPC" ? ".xlsx,.xls" : ".zip,.csv";
  el("format").textContent = region === "NRPC" ? "Select one or more Excel workbooks" : "Select one or more ZIP archives or CSV files";
}
el("region").onchange = reset;
el("mode").onchange = reset;
async function indexFile(file, region) {
  if (region === "NRPC") {
    const index = KD.nrpcIndex(XLSX.read(await file.arrayBuffer(), {type:"array"}));
    return {index, names:index.plants};
  }
  const zipped = /\.zip$/i.test(file.name);
  const zip = zipped ? await JSZip.loadAsync(await file.arrayBuffer()) : {files:[{name:file.name, async:()=>file.text()}]};
  if (region === "WRPC") {
    const index = await KD.wrpcIndex(zip, {plantFrom:el("mode").value});
    return {index, names:[...index.plants.keys()], skipped:index.skipped.length};
  }
  const entries = KD.wrpcEntries(zip);
  const candidates = zipped ? entries.filter(e=>/(^|\/)commercial_dev2022_/i.test(e.name)) : entries;
  const index = await KD.srpcIndex(candidates);
  return {index, names:index.map(p=>p.plant), skipped:entries.length-index.length};
}
el("files").onchange = async () => {
  inputs = [];
  clearOutput();
  el("selection").hidden = true;
  el("inventory").replaceChildren();
  el("controls").disabled = true;
  const names = new Set();
  try {
    for (const file of el("files").files) {
      el("msg").textContent = "Reading " + file.name;
      try {
        const item = await indexFile(file, el("region").value);
        inputs.push({...item, file:file.name});
        item.names.forEach(p=>names.add(p));
        add(el("inventory"), "div", file.name+" · "+new Set(item.names).size+" plants"+(item.skipped?" · "+item.skipped+" entries skipped":""));
      } catch (err) { add(el("inventory"), "div", file.name+" · Skipped. "+err.message); }
    }
    el("plant").replaceChildren(...Array.from(names).sort().map(n=>new Option(n,n)));
    el("selection").hidden = !names.size;
    updatePlant();
    if (!names.size) el("msg").textContent = "No compatible plant records found. Check the region and input format.";
  } finally { el("controls").disabled = false; }
};
function updatePlant() {
  clearOutput();
  const plant = el("plant").value;
  const maps = el("maps");
  maps.replaceChildren();
  for (const item of inputs) {
    if (!item.names.includes(plant)) {
      add(maps,"p",item.file+" · Plant absent. File excluded.");
      continue;
    }
    if (el("region").value !== "NRPC") continue;
    const group = add(maps,"details","");
    group.open = true;
    add(group,"summary",item.file+" · Review worksheet matches");
    item.mapping = {};
    for (const spec of KD.NR.slice(1)) {
      const entities = item.index.specs[spec.key].entities;
      const label = add(group,"label",spec.label+" ");
      const select = add(label,"select","");
      select.add(new Option("Leave blank",""));
      for (const name of entities) select.add(new Option(name,name));
      if (entities.includes(plant)) select.value = plant;
      item.mapping[spec.key] = select;
      select.onchange = clearOutput;
    }
  }
}
el("plant").onchange = updatePlant;
el("run").onclick = async () => {
  clearOutput();
  el("controls").disabled = true;
  const plant = el("plant").value, region = el("region").value;
  try {
    const rows = [], issues = [], details = [], mapping = [];
    let template, overlap = 0;
    const seen = new Map();
    for (const item of inputs.filter(i=>i.names.includes(plant))) {
      let results;
      if (region === "NRPC") {
        const sel = {solar:plant};
        for (const [key, field] of Object.entries(item.mapping)) sel[key] = field.value;
        results = [KD.nrpcExtract(item.index,sel)];
      } else if (region === "WRPC") results = [await KD.wrpcExtract(item.index,plant)];
      else results = item.index.filter(p=>p.plant===plant).map(KD.srpcExtract);
      for (const result of results) {
        const source = region === "SRPC" ? item.file+" / "+result.meta.mapping[0][1] : item.file;
        template = result;
        for (const issue of result.issues) issues.push({...issue, detail:source+" · "+issue.detail});
        for (const d of result.details) details.push({...d, issue:source+" · "+d.issue});
        for (const [sheet,name] of result.meta.mapping) mapping.push([source+" / "+sheet,name]);
        for (const row of result.rows) {
          const key = JSON.stringify([row.date,row.block,row.cons||""]);
          if (seen.has(key) && seen.get(key)!==result) overlap++;
          else seen.set(key,result);
          rows.push({...row, plant, source});
        }
      }
    }
    if (!rows.length) throw Error("No valid rows were found for this plant.");
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.block-b.block);
    const days = new Map();
    for (const row of rows) {
      if (!days.has(row.date)) days.set(row.date,new Set());
      days.get(row.date).add(row.block);
    }
    let missing = 0;
    for (const blocks of days.values()) missing += 96-blocks.size;
    const gaps = KD.gaps([...days.keys()]);
    if (gaps.length) issues.push({sev:"Warning",type:"Combined date gaps",detail:gaps.length+" calendar days missing between the first and last date.",count:gaps.length});
    if (overlap) issues.unshift({sev:"Warning",type:"Overlapping files",detail:overlap+" rows repeat a date, block and constituent from another source. All versions are included. Review Source file before summing.",count:overlap});
    const cols = [{key:"plant",h:"Plant"},...template.cols,{key:"source",h:"Source file"}];
    combined = {...template,cols,rows,issues,details,meta:{...template.meta,mapping,first:rows[0].date,last:rows.at(-1).date,dates:days.size,records:rows.length,missing}};
    el("stats").textContent = plant+" · "+rows.length.toLocaleString()+" rows · "+days.size+" dates · "+combined.meta.first+" to "+combined.meta.last;
    el("issues").replaceChildren();
    const check = add(el("issues"),"details","");
    check.open = !!overlap;
    add(check,"summary","Validation messages ("+issues.length+")");
    for (const i of issues) add(check,"p",i.type+" · "+i.detail);
    el("preview").replaceChildren();
    for (const values of [cols.map(c=>c.h),...rows.slice(0,25).map(r=>cols.map(c=>r[c.key]))]) {
      const tr = el("preview").insertRow();
      for (const value of values) add(tr,tr.rowIndex===0?"th":"td",value??"");
    }
    el("caption").textContent = "Preview shows "+Math.min(rows.length,25)+" rows. Downloads include all "+rows.length.toLocaleString()+" rows.";
    el("output").hidden = false;
  } catch (err) { clearOutput(); el("msg").textContent = err.message; }
  finally { el("controls").disabled = false; }
};
const filename = () => [combined.region,combined.plant.replace(/[^\w.-]+/g,"_"),combined.meta.first,combined.meta.last,"combined"].join("_");
el("csv").onclick = () => {
  const url = URL.createObjectURL(new Blob([KD.toCSV(combined)],{type:"text/csv;charset=utf-8"}));
  const link = add(document.body,"a","");
  link.href = url;
  link.download = filename()+".csv";
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
el("excel").onclick = () => XLSX.writeFile(KD.workbook(combined),filename()+".xlsx");
reset();
