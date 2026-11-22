
const KD=(function(){
"use strict";
/* ---------- helpers ---------- */
const norm=s=>String(s==null?"":s).toLowerCase().replace(/%/g,"pct").replace(/[^a-z0-9]+/g,"");
const pad=n=>String(n).padStart(2,"0");
const MON={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
function ymd(y,m,d){y=+y;m=+m;d=+d;if(!(m>=1&&m<=12&&d>=1&&d<=31))return null;const t=new Date(Date.UTC(y,m-1,d));return t.getUTCMonth()===m-1?`${y}-${pad(m)}-${pad(d)}`:null}
/* Dates: ISO, DD-MM-YYYY (day first), 21-Sep-2026, 21 September 2026, Excel serial numbers, Date objects */
function parseDate(v){
  if(v==null||v==="")return null;
  if(v instanceof Date)return isNaN(v)?null:v.toISOString().slice(0,10);
  if(typeof v==="number")return(v>20000&&v<80000)?new Date(Math.floor(v-25569)*864e5).toISOString().slice(0,10):null;
  const t=String(v).trim();let m;
  if(/^\d{5}(\.\d+)?$/.test(t))return parseDate(parseFloat(t));
  if(m=t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))return ymd(m[1],m[2],m[3]);
  if(m=t.match(/^(\d{1,2})[-\/. ]+([A-Za-z]{3,9})[-\/. ,]+(\d{4})/)){const mo=MON[m[2].toLowerCase()];return mo?ymd(m[3],mo,m[1]):null}
  if(m=t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/))return ymd(m[3],m[2],m[1]);
  if(m=t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2})$/))return ymd("20"+m[3],m[2],m[1]);
  if(/^\d{8}$/.test(t))return /^(19|20)/.test(t)?ymd(t.slice(0,4),t.slice(4,6),t.slice(6,8)):ymd(t.slice(4,8),t.slice(2,4),t.slice(0,2));
  return null;
}
/* Numbers: keeps 0, flags blank and text. Returns {v,s:"ok"|"blank"|"bad"} */
function num(v){
  if(typeof v==="number")return isFinite(v)?{v,s:"ok"}:{v:null,s:"bad"};
  if(v==null)return {v:null,s:"blank"};
  const t=String(v).trim();
  if(t===""||/^(n\/?a|nan|null)$/i.test(t))return {v:null,s:"blank"};
  const n=Number(t.replace(/,/g,"").replace(/%$/,""));
  return isFinite(n)?{v:n,s:"ok"}:{v:null,s:"bad"};
}
const mul=(x,f)=>Number((x*f).toPrecision(12));
const div=(x,f)=>Number((x/f).toPrecision(12));
function parseCSV(text,delim){
  if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
  if(!delim){const l=(text.slice(0,4000).split("\n")[0]||"");delim=[",",";","\t"].map(d=>[d,l.split(d).length]).sort((a,b)=>b[1]-a[1])[0][0]}
  if(text.indexOf('"')<0){
    const lines=text.split("\n");if(lines.length&&lines[lines.length-1].trim()==="")lines.pop();
    return lines.map(l=>l.replace(/\r$/,"").split(delim));
  }
  const rows=[];let row=[],f="",q=false,i=0;const n=text.length;
  while(i<n){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i+=2;continue}q=false;i++;continue}f+=c;i++;continue}
    if(c==='"'){q=true;i++;continue}
    if(c===delim){row.push(f);f="";i++;continue}
    if(c==="\r"){i++;continue}
    if(c==="\n"){row.push(f);rows.push(row);row=[];f="";i++;continue}
    f+=c;i++;
  }
  if(f!==""||row.length){row.push(f);rows.push(row)}
  return rows;
}
const tick=()=>new Promise(r=>setTimeout(r,0));
function gaps(dates){ // calendar days missing between first and last date
  if(dates.length<2)return [];
  const set=new Set(dates),out=[];let d=new Date(dates[0]+"T00:00:00Z");const end=new Date(dates[dates.length-1]+"T00:00:00Z");
  for(;d<=end;d=new Date(d.getTime()+864e5)){const k=d.toISOString().slice(0,10);if(!set.has(k))out.push(k)}
  return out;
}
const countBy=(arr,f)=>{const m={};arr.forEach(x=>{const k=f(x);m[k]=(m[k]||0)+1});return m};

/* ---------- plant-name matching ---------- */
const STOP=new Set(["private","limited","pvt","ltd","llp","india","the","of","and"]);
const toks=s=>String(s).toLowerCase().split(/[^a-z0-9]+/).filter(t=>t&&!STOP.has(t));
function score(a,b){
  if(norm(a)===norm(b))return 1;
  const A=new Set(toks(a)),B=new Set(toks(b));if(!A.size||!B.size)return 0;
  let i=0;A.forEach(t=>{if(B.has(t))i++});return i/(A.size+B.size-i);
}
/* best candidate only if clearly ahead of the others; never a silent guess */
function suggest(list,target){
  const sc=list.map(n=>({n,s:score(n,target)})).sort((a,b)=>b.s-a.s);
  const top=sc[0];
  const auto=top&&top.s>=0.6&&(!sc[1]||top.s-sc[1].s>=0.08)?top:null;
  return {auto,top:sc.slice(0,3).filter(x=>x.s>0)};
}

/* ---------- NRPC ---------- */
const NR=[
 {key:"solar",label:"Solar_availability",match:"solaravailability",prefix:"DC",out:"Solar Availability (MW)",factor:400,required:true},
 {key:"act",label:"Act_Inj_Gen_Stations",match:"actinjgenstations",prefix:"D",out:"Actual Injection (MW)",factor:400},
 {key:"gs",label:"GS_Stations",match:"gsstations",prefix:"GS",out:"GS Station (MW)",factor:400},
 {key:"rate",label:"Contract_Rate",match:"contractrate",prefix:"D",out:"Contract Rate",factor:1},
 {key:"dev",label:"Deviation_Charges",match:"deviationcharges",prefix:"D",out:"Deviation Charges",factor:1}
];
const NR_COLS=[{key:"date",h:"Date"},{key:"block",h:"Block"},{key:"dcCol",h:"DC Column"},{key:"solar",h:"Solar Availability (MW)"},{key:"act",h:"Actual Injection (MW)"},{key:"gs",h:"GS Station (MW)"},{key:"rate",h:"Contract Rate"},{key:"dev",h:"Deviation Charges"}];

function guessCol(body,skip,test){
  const n=Math.min(body.length,40);let cols=0;body.slice(0,n).forEach(r=>{cols=Math.max(cols,r.length)});
  for(let j=0;j<cols;j++){
    if(skip.has(j))continue;
    const vals=body.slice(0,n).map(r=>r[j]).filter(v=>v!==""&&v!=null);
    if(vals.length&&vals.filter(test).length/vals.length>=0.8)return j;
  }
  return -1;
}
function analyzeSheet(aoa,prefix){
  const notes=[],maxR=Math.min(aoa.length,40),reP=new RegExp("^"+prefix+"\\s*0*(\\d{1,3})$","i");
  let best=null;
  for(let r=0;r<maxR;r++){
    const cols={};let n=0;
    aoa[r].forEach((c,j)=>{const m=String(c).trim().match(reP);if(m){const b=+m[1];if(b>=1&&b<=96&&cols[b]==null){cols[b]=j;n++}}});
    if(n>=48&&(!best||n>best.n))best={r,cols,n,prefix};
  }
  if(!best){
    for(let r=0;r<maxR;r++){
      const by={};
      aoa[r].forEach((c,j)=>{const m=String(c).trim().match(/^([A-Za-z]{1,4})\s*0*(\d{1,3})$/);if(m){const p=m[1].toUpperCase(),b=+m[2];if(b>=1&&b<=96)(by[p]=by[p]||{})[b]=j}});
      Object.keys(by).forEach(p=>{const n=Object.keys(by[p]).length;if(n>=48&&(!best||n>best.n))best={r,cols:by[p],n,prefix:p}});
    }
    if(best)notes.push(`Block columns are named ${best.prefix}1 to ${best.prefix}96 instead of the expected ${prefix}1 to ${prefix}96.`);
  }
  if(!best)return {ok:false,reason:`no ${prefix}1 to ${prefix}96 columns found in the first ${maxR} rows`};
  const hdr=aoa[best.r].map(norm),blockSet=new Set(Object.values(best.cols)),body=aoa.slice(best.r+1);
  let dateCol=hdr.findIndex((h,j)=>!blockSet.has(j)&&/date/.test(h));
  if(dateCol<0){dateCol=guessCol(body,blockSet,v=>parseDate(v)!=null);if(dateCol>=0)notes.push("The date column has no heading; it was identified from its contents.")}
  const skip=new Set([...blockSet,dateCol]);
  let nameCol=hdr.findIndex((h,j)=>!skip.has(j)&&/(plant|station|entity|generator|seller|name|gen)/.test(h));
  if(nameCol<0){nameCol=guessCol(body,skip,v=>typeof v==="string"&&v.trim()!==""&&isNaN(Number(v)));if(nameCol>=0)notes.push("The plant name column has no recognisable heading; it was identified from its contents.")}
  if(dateCol<0||nameCol<0)return {ok:false,reason:"the date column and/or the plant name column could not be identified"};
  return {ok:true,hdrRow:best.r,cols:best.cols,dateCol,nameCol,notes,body,prefix:best.prefix};
}
function nrpcIndex(wb){
  const out={specs:{},warnings:[],plants:[]};
  NR.forEach(sp=>{
    const sn=wb.SheetNames.find(n=>norm(n)===sp.match)||wb.SheetNames.find(n=>norm(n).includes(sp.match));
    const o={spec:sp,found:!!sn,sheet:sn||null,an:null,entities:[]};out.specs[sp.key]=o;
    if(!sn){out.warnings.push({sev:sp.required?"Error":"Warning",type:"Missing worksheet",detail:`Worksheet "${sp.label}" was not found in the workbook.`,count:1});return}
    const aoa=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:"",raw:true,blankrows:false});
    const an=analyzeSheet(aoa,sp.prefix);
    if(!an.ok){out.warnings.push({sev:"Error",type:"Unreadable worksheet",detail:`"${sn}": ${an.reason}.`,count:1});return}
    o.an=an;an.notes.forEach(t=>out.warnings.push({sev:"Info",type:"Structure note",detail:`"${sn}": ${t}`,count:1}));
    const seen=new Set();
    an.body.forEach(r=>{const n=String(r[an.nameCol]==null?"":r[an.nameCol]).trim();if(n&&!seen.has(n)&&parseDate(r[an.dateCol])){seen.add(n);o.entities.push(n)}});
    o.entities.sort((a,b)=>a.localeCompare(b));
    if(!o.entities.length)out.warnings.push({sev:"Warning",type:"Empty worksheet",detail:`"${sn}" contains no plant rows with a valid date.`,count:1});
  });
  out.plants=out.specs.solar.entities.slice();
  return out;
}
/* sel = {solar:"name", act:"name"|"", gs:..., rate:..., dev:...} */
function nrpcExtract(idx,sel){
  const issues=[],details=[],plant=sel.solar,maps={};
  idx.warnings.filter(w=>w.sev!=="Info").forEach(w=>issues.push(w));
  NR.forEach(sp=>{
    const o=idx.specs[sp.key];maps[sp.key]=null;
    if(!o||!o.an)return;
    const name=sel[sp.key];
    if(!name){issues.push({sev:"Warning",type:"Plant mapping",detail:`No entity selected for ${sp.label}. Column "${sp.out}" is left blank.`,count:1});return}
    const m=new Map();let dup=0,bad=0;
    o.an.body.forEach(r=>{
      if(String(r[o.an.nameCol]==null?"":r[o.an.nameCol]).trim()!==name)return;
      const d=parseDate(r[o.an.dateCol]);
      if(!d){bad++;return}
      if(m.has(d)){dup++;details.push({date:d,block:"",column:sp.label,issue:"Duplicate row for this plant and date (the first row was used)"});return}
      m.set(d,r);
    });
    if(bad)issues.push({sev:"Warning",type:"Invalid date",detail:`${bad} row(s) of "${sp.label}" for this plant have an unreadable date and were not used.`,count:bad});
    if(dup)issues.push({sev:"Warning",type:"Duplicate records",detail:`"${sp.label}" has ${dup} duplicate plant/date row(s). The first row of each was used.`,count:dup});
    maps[sp.key]=m;
  });
  const used=NR.filter(sp=>maps[sp.key]);
  const dateSet=new Set();used.forEach(sp=>maps[sp.key].forEach((_,d)=>dateSet.add(d)));
  const dates=[...dateSet].sort();
  const rows=[],cnt={};used.forEach(sp=>cnt[sp.key]={blank:0,bad:0,missDates:[]});
  let missingRecords=0;
  const solarO=idx.specs.solar,dcPrefix=solarO.an?solarO.an.prefix:"DC";
  dates.forEach(d=>{
    used.forEach(sp=>{if(!maps[sp.key].has(d))cnt[sp.key].missDates.push(d)});
    for(let b=1;b<=96;b++){
      const rec={date:d,block:b,dcCol:dcPrefix+b,solar:null,act:null,gs:null,rate:null,dev:null};
      let miss=false;
      used.forEach(sp=>{
        const r=maps[sp.key].get(d);
        if(!r){miss=true;return}
        const col=idx.specs[sp.key].an.cols[b];
        const x=num(col==null?"":r[col]);
        if(x.s==="ok")rec[sp.key]=sp.factor===1?x.v:mul(x.v,sp.factor);
        else{miss=true;cnt[sp.key][x.s==="bad"?"bad":"blank"]++;details.push({date:d,block:b,column:sp.out,issue:x.s==="bad"?`Invalid number: "${r[col]}"`:"Missing value"})}
      });
      if(miss)missingRecords++;
      rows.push(rec);
    }
  });
  used.forEach(sp=>{
    const c=cnt[sp.key];
    if(c.missDates.length)issues.push({sev:"Warning",type:"Missing dates",detail:`${sp.label}: ${c.missDates.length} date(s) have no data for this plant (${c.missDates.slice(0,5).join(", ")}${c.missDates.length>5?", …":""}). Values left blank.`,count:c.missDates.length});
    if(c.blank)issues.push({sev:"Warning",type:"Missing values",detail:`${sp.label}: ${c.blank} blank value(s). Left blank, not replaced with zero.`,count:c.blank});
    if(c.bad)issues.push({sev:"Warning",type:"Invalid numeric values",detail:`${sp.label}: ${c.bad} non-numeric value(s). Left blank.`,count:c.bad});
  });
  const g=gaps(dates);
  if(g.length)issues.push({sev:"Warning",type:"Missing dates",detail:`${g.length} calendar day(s) between the first and last date are missing in all worksheets (${g.slice(0,5).join(", ")}${g.length>5?", …":""}).`,count:g.length});
  if(!rows.length)issues.push({sev:"Error",type:"No data",detail:"No records were found for the selected plant.",count:1});
  return {region:"NRPC",plant,cols:NR_COLS,rows,issues,details,
    meta:{region:"NRPC",plant,first:dates[0]||"",last:dates[dates.length-1]||"",dates:dates.length,records:rows.length,missing:missingRecords,
      mapping:NR.map(sp=>[sp.label,sel[sp.key]||"(not mapped)"]),
      factors:NR.map(sp=>[sp.out,sp.factor===1?"Original value (no conversion)":"Original value × "+sp.factor]),at:new Date().toISOString()}};
}

/* ---------- WRPC ---------- */
const WF=[["date",/^date$/],["block",/^block(no|number)?$/],["cons",/^constituents?$/],["sched",/^schedule/],["actual",/^actual/],["rate",/^(wt|weighted)avgrate/],["cap",/^wssellercapacity/],["devmw",/^deviation(mwh|mw)$/],["devpct",/^deviation(pct|percent|percentage)$/],["dpay",/^dsmpayable/],["drec",/^dsmreceivable/]];
const WR_COLS=[{key:"date",h:"Date"},{key:"block",h:"Block"},{key:"cons",h:"Constituents"},{key:"sched",h:"Schedule (MW)"},{key:"actual",h:"Actual (MW)"},{key:"rate",h:"Wt. Avg. Rate (Rs/kWh)"},{key:"cap",h:"WS Seller Capacity (MW)"},{key:"devmw",h:"Deviation (MW)"},{key:"devpct",h:"Deviation (%)"}];
const WR_SRC={sched:"Schedule (MWh)",actual:"Actual (MWh)",rate:"Wt. Avg. Rate (p/kWh)",cap:"WS Seller Capacity (MWh)",devmw:"Deviation (MWh)",devpct:"Deviation (%)"};
const WR_CONV={sched:v=>mul(v,4),actual:v=>mul(v,4),rate:v=>div(v,100),cap:v=>mul(v,4),devmw:v=>mul(v,4),devpct:v=>v};
const WR_LABEL={sched:"Schedule (MW)",actual:"Actual (MW)",rate:"Wt. Avg. Rate (Rs/kWh)",cap:"WS Seller Capacity (MW)",devmw:"Deviation (MW)",devpct:"Deviation (%)"};

function wrpcHeader(rows){
  const lim=Math.min(rows.length,60);
  for(let r=0;r<lim;r++){
    const h=rows[r].map(norm);
    const di=h.findIndex(x=>x==="date"),bi=h.findIndex(x=>/^block(no|number)?$/.test(x));
    if(di>=0&&bi>=0){const cols={};WF.forEach(([k,re])=>{const j=h.findIndex(x=>re.test(x));if(j>=0)cols[k]=j});return {r,cols,h}}
  }
  return null;
}
function fileStem(name){
  let s=String(name).split(/[\\/]/).pop().replace(/\.csv$/i,"");
  s=s.replace(/[-_ ]*DSM[-_ ]?\d{4}[-_ ]?Data.*$/i,"");
  s=s.replace(/[-_ ]*(\d{4}[-_.]\d{2}[-_.]\d{2}|\d{2}[-_.]\d{2}[-_.]\d{4}|\d{8})(?=$|[-_ .])/g,"").replace(/^[-_ ]+|[-_ ]+$/g,"");
  return s||String(name).split(/[\\/]/).pop();
}
/* where the plant name comes from: a column, text above the table, or the file name */
function resolvePlant(rows,h,fname,mode){
  const colRe=/^(plant|plantname|entity|entityname|seller|sellername|generator|generatorname|station|stationname|utility|utilityname|qca|qcaname)$/;
  if(mode==="auto"||mode==="column"){const j=h.h.findIndex(x=>colRe.test(x));if(j>=0)return {source:"column",col:j}}
  if(mode==="auto"||mode==="above"){
    for(let r=0;r<h.r;r++){
      const row=rows[r];
      for(let j=0;j<row.length;j++){
        const c=String(row[j]).trim();
        let m=c.match(/^(entity|plant|seller|generator|station|name)[^:=]*[:=]\s*(.+)$/i);
        if(m&&m[2].trim())return {source:"above",col:-1,name:m[2].trim()};
        if(/^(entity|plant|seller|generator|station)(\s*name)?\s*:?$/i.test(c)){const nx=row.slice(j+1).find(x=>String(x).trim()!=="");if(nx!=null)return {source:"above",col:-1,name:String(nx).trim()}}
      }
    }
  }
  return {source:"filename",col:-1,name:fileStem(fname)};
}
function wrpcEntries(zip){
  return Object.values(zip.files).filter(f=>!f.dir&&/\.csv$/i.test(f.name)&&!/(^|\/)__MACOSX\//.test(f.name)&&!/(^|[\\/])\._/.test(f.name));
}
async function wrpcIndex(zip,opts,progress){
  opts=opts||{};const mode=opts.plantFrom||"auto";
  const entries=wrpcEntries(zip),plants=new Map(),skipped=[],src={column:0,above:0,filename:0};
  for(let i=0;i<entries.length;i++){
    const e=entries[i];
    let text="";try{text=await e.async("string")}catch(x){skipped.push({reason:"unreadable file"});continue}
    if(!text.trim()){skipped.push({reason:"empty file"});continue}
    const rows=parseCSV(text),h=wrpcHeader(rows);
    if(!h){skipped.push({reason:"no Date/Block header row"});continue}
    if(h.cols.sched==null&&h.cols.actual==null){skipped.push({reason:"not a DSM data file (no Schedule or Actual column)"});continue}
    const rp=resolvePlant(rows,h,e.name,mode);src[rp.source]++;
    const add=(name,n)=>{if(!plants.has(name))plants.set(name,{entries:[],rows:0});const p=plants.get(name);if(!p.entries.includes(e))p.entries.push(e);p.rows+=n};
    if(rp.col>=0){const cnt={};for(let k=h.r+1;k<rows.length;k++){const r=rows[k];if(!r||r[h.cols.date]==null||String(r[h.cols.date]).trim()==="")continue;const n=String(r[rp.col]).trim();if(n)cnt[n]=(cnt[n]||0)+1}Object.keys(cnt).forEach(n=>add(n,cnt[n]))}
    else add(rp.name,rows.length-h.r-1);
    if(progress&&(i%4===0||i===entries.length-1)){progress(i+1,entries.length);await tick()}
  }
  return {nFiles:entries.length,plants,skipped,src,mode};
}
async function wrpcExtract(idx,plant,progress){
  const info=idx.plants.get(plant);
  const issues=[],details=[],recs=[],excl=[],miss={},bad={},colMissing={};
  let seq=0,readRows=0;
  for(let i=0;i<info.entries.length;i++){
    const e=info.entries[i],text=await e.async("string"),rows=parseCSV(text),h=wrpcHeader(rows);
    if(!h)continue;
    const rp=resolvePlant(rows,h,e.name,idx.mode),c=h.cols;
    Object.keys(WR_SRC).forEach(k=>{if(c[k]==null)colMissing[k]=(colMissing[k]||0)+1});
    if(c.cons==null)colMissing.cons=(colMissing.cons||0)+1;
    for(let k=h.r+1;k<rows.length;k++){
      const r=rows[k];if(!r||r.every(x=>String(x).trim()===""))continue;
      if(rp.col>=0&&String(r[rp.col]).trim()!==plant)continue;
      readRows++;
      const d=parseDate(r[c.date]),bn=num(r[c.block]),b=(bn.s==="ok"&&Number.isInteger(bn.v)&&bn.v>=1&&bn.v<=96)?bn.v:null;
      if(!d||b==null){excl.push({date:String(r[c.date]),block:String(r[c.block]),column:"Date / Block",issue:"Invalid date or block number: row not included"});continue}
      const rec={date:d,block:b,cons:c.cons!=null?String(r[c.cons]).trim():"",seq:seq++};
      Object.keys(WR_SRC).forEach(key=>{
        if(c[key]==null){rec[key]=null;return}
        const x=num(r[c[key]]);
        if(x.s==="ok")rec[key]=WR_CONV[key](x.v);
        else{rec[key]=null;(x.s==="bad"?bad:miss)[key]=((x.s==="bad"?bad:miss)[key]||0)+1;details.push({date:d,block:b,column:WR_LABEL[key],issue:x.s==="bad"?`Invalid number: "${r[c[key]]}"`:"Missing value"})}
      });
      if(c.dpay!=null||c.drec!=null){const x=c.dpay!=null?num(r[c.dpay]):{s:"x"},y=c.drec!=null?num(r[c.drec]):{s:"x"};rec.pub=(x.s==="ok"||y.s==="ok")?(x.s==="ok"?x.v:0)-(y.s==="ok"?y.v:0):null}
      recs.push(rec);
    }
    if(progress){progress(i+1,info.entries.length);await tick()}
  }
  recs.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.block-b.block||a.seq-b.seq);
  Object.keys(colMissing).forEach(k=>issues.push({sev:"Error",type:"Missing column",detail:`Source column "${k==="cons"?"Constituents":WR_SRC[k]}" was not found in ${colMissing[k]} file(s). Its values are blank.`,count:colMissing[k]}));
  if(excl.length){issues.push({sev:"Warning",type:"Rows not included",detail:`${excl.length} row(s) with an invalid date or block number were not included in the table.`,count:excl.length});excl.forEach(x=>details.push(x))}
  Object.keys(miss).forEach(k=>issues.push({sev:"Warning",type:"Missing values",detail:`${WR_LABEL[k]}: ${miss[k]} blank value(s). Left blank, not replaced with zero.`,count:miss[k]}));
  Object.keys(bad).forEach(k=>issues.push({sev:"Warning",type:"Invalid numeric values",detail:`${WR_LABEL[k]}: ${bad[k]} non-numeric value(s). Left blank.`,count:bad[k]}));
  // duplicates (same date, block and constituent) and blocks that carry several constituents
  const seen=new Map();let dupN=0;
  recs.forEach(r=>{const k=r.date+"|"+r.block+"|"+r.cons;const n=(seen.get(k)||0)+1;seen.set(k,n);if(n===2){dupN++;details.push({date:r.date,block:r.block,column:"Date / Block / Constituents",issue:`Duplicate records for constituent "${r.cons}" (all kept)`})}});
  if(dupN)issues.push({sev:"Warning",type:"Duplicate records",detail:`${dupN} date/block/constituent combination(s) appear more than once. All rows were kept.`,count:dupN});
  const perBlock=new Map();recs.forEach(r=>{const k=r.date+"|"+r.block;perBlock.set(k,(perBlock.get(k)||0)+1)});
  let multi=0;perBlock.forEach(n=>{if(n>1)multi++});
  if(multi)issues.push({sev:"Info",type:"Several rows per block",detail:`${multi} date/block pair(s) have more than one row (different constituents).`,count:multi});
  // missing blocks / dates
  const byDate=new Map();recs.forEach(r=>{if(!byDate.has(r.date))byDate.set(r.date,new Set());byDate.get(r.date).add(r.block)});
  const dates=[...byDate.keys()].sort();let missBlocks=0;
  dates.forEach(d=>{const s=byDate.get(d);for(let b=1;b<=96;b++)if(!s.has(b)){missBlocks++;details.push({date:d,block:b,column:"Block",issue:"Missing block"})}});
  if(missBlocks){const dd=dates.filter(d=>byDate.get(d).size<96);issues.push({sev:"Warning",type:"Missing blocks",detail:`${missBlocks} block(s) are missing across ${dd.length} date(s) (for example ${dd.slice(0,3).join(", ")}). Not interpolated.`,count:missBlocks})}
  const g=gaps(dates);
  if(g.length)issues.push({sev:"Warning",type:"Missing dates",detail:`${g.length} calendar day(s) between the first and last date have no records (${g.slice(0,5).join(", ")}${g.length>5?", …":""}).`,count:g.length});
  if(!recs.length)issues.push({sev:"Error",type:"No data",detail:"No valid records were found for the selected plant.",count:1});
  return {region:"WRPC",plant,cols:WR_COLS,rows:recs,issues,details,
    meta:{region:"WRPC",plant,first:dates[0]||"",last:dates[dates.length-1]||"",dates:dates.length,records:recs.length,missing:missBlocks,
      mapping:[],factors:[["Schedule (MW)","Schedule (MWh) × 4"],["Actual (MW)","Actual (MWh) × 4"],["Wt. Avg. Rate (Rs/kWh)","Wt. Avg. Rate (p/kWh) ÷ 100"],["WS Seller Capacity (MW)","WS Seller Capacity (MWh) × 4"],["Deviation (MW)","Deviation (MWh) × 4"],["Deviation (%)","Original value (no conversion)"]],at:new Date().toISOString()}};
}

/* ---------- SRPC generator DSM ---------- */
const SR_FIELDS=[
  ["sched","sch_total","Schedule (MW)",4],
  ["actual","act_total","Actual (MW)",4],
  ["cap","available_capacity","Available capacity (MW)",4],
  ["rate","rate","DSM rate (Rs/kWh)",0.01],
  ["ppa","ppa_rate","PPA rate (Rs/kWh)",0.01],
  ["over","overinjection_charges","Over-injection (Rs)",1],
  ["under","underinjection_charges","Under-injection (Rs)",1],
  ["drawl","drawl_charges","Drawal (Rs)",1]
];
const SR_COLS=[{key:"date",h:"Date"},{key:"block",h:"Block"},
  ...SR_FIELDS.map(([key,,h])=>({key,h})),{key:"pub",h:"Published net payable (Rs)"}];

async function srpcIndex(entries){
  const plants=[];
  for(const entry of entries){
    const rows=parseCSV(await entry.async("string"));
    const header=(rows.shift()||[]).map(cell=>cell.trim().toLowerCase());
    const cols=Object.fromEntries(header.map((key,index)=>[key,index]));
    if(!["date","time",...SR_FIELDS.filter(([key])=>key!=="ppa").map(([,key])=>key)].every(key=>Object.prototype.hasOwnProperty.call(cols,key)))continue;
    const plant=fileStem(entry.name).replace(/^commercial_dev2022_/i,"");
    plants.push({plant,source:entry.name,cols,rows});
  }
  return plants.sort((a,b)=>a.plant.localeCompare(b.plant));
}

function srpcExtract({plant,source,cols,rows}){
  const issues=[],details=[],records=[],byDate=new Map();
  let missing=0,invalid=0,duplicates=0;
  for(const row of rows){
    if(row.every(cell=>!cell.trim()))continue;
    const date=parseDate(row[cols.date]);
    const time=/^([01]\d|2[0-3]):(00|15|30|45)(?::00)?$/.exec((row[cols.time]||"").trim());
    if(!date||!time){
      invalid++;
      details.push({date:row[cols.date],column:"Date / Time",issue:"Invalid date or 15-minute start time"});
      continue;
    }
    const block=Number(time[1])*4+Number(time[2])/15+1;
    if(!byDate.has(date))byDate.set(date,new Set());
    const blocks=byDate.get(date);
    if(blocks.has(block)){
      duplicates++;
      details.push({date,block,column:"Date / Block",issue:"Duplicate block (first row kept)"});
      continue;
    }
    blocks.add(block);
    const record={date,block};
    for(const [key,field,label,factor] of SR_FIELDS){
      const value=num(row[cols[field]]);
      record[key]=value.s==="ok"?mul(value.v,factor):null;
      if(value.s!=="ok"&&Object.prototype.hasOwnProperty.call(cols,field)){
        details.push({date,block,column:label,issue:value.s==="bad"?"Invalid number":"Missing value"});
      }
    }
    // SRPC credits are positive and debits negative. QCA compares net payable.
    const charges=[record.over,record.under,record.drawl];
    record.pub=charges.every(value=>value!=null)?-charges.reduce((sum,value)=>sum+value,0):null;
    records.push(record);
  }
  const dates=[...byDate.keys()].sort();
  const badValues=details.length-invalid-duplicates;
  for(const date of dates){
    for(let block=1;block<=96;block++){
      if(byDate.get(date).has(block))continue;
      missing++;
      details.push({date,block,column:"Block",issue:"Missing block"});
    }
  }
  const missingDates=gaps(dates);
  for(const [type,count] of [["Invalid date or time",invalid],["Duplicate blocks",duplicates],
    ["Missing or invalid numeric values",badValues],["Missing blocks",missing],["Missing dates",missingDates.length]]){
    if(count)issues.push({sev:"Warning",type,detail:`${count} found. See the validation report for row details.`,count});
  }
  for(const date of missingDates)details.push({date,column:"Date",issue:"Missing date"});
  records.sort((a,b)=>a.date.localeCompare(b.date)||a.block-b.block);
  return {region:"SRPC",plant,cols:SR_COLS,rows:records,issues,details,
    meta:{region:"SRPC",plant,first:dates[0]||"",last:dates[dates.length-1]||"",dates:dates.length,records:records.length,
      missing,mapping:[["CSV",source]],factors:SR_FIELDS.map(([,,label,factor])=>[label,`× ${factor}`]),
      at:new Date().toISOString()}};
}

/* ---------- export ---------- */
const csvCell=v=>{if(v==null)return "";const s=String(v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
function toCSV(res){
  const out=[res.cols.map(c=>csvCell(c.h)).join(",")];
  for(let i=0;i<res.rows.length;i++){const r=res.rows[i];out.push(res.cols.map(c=>csvCell(r[c.key])).join(","))}
  return "\uFEFF"+out.join("\r\n");
}
function validationAOA(res){
  const a=[["Severity","Issue type","Description","Count"]];
  if(!res.issues.length)a.push(["Info","No issues","No validation issues were found.",0]);
  res.issues.forEach(i=>a.push([i.sev,i.type,i.detail,i.count]));
  a.push([]);a.push(["Date","Block","Column","Issue"]);
  res.details.forEach(d=>a.push([d.date,d.block,d.column,d.issue]));
  return a;
}
function validationCSV(res){return "\uFEFF"+validationAOA(res).map(r=>r.map(csvCell).join(",")).join("\r\n")}
function summaryAOA(res){
  const m=res.meta,a=[["Item","Value"],["Region",m.region],["Selected plant",m.plant],["First date",m.first],["Last date",m.last],["Total dates",m.dates],["Total records",m.records],["Missing blocks / records",m.missing],["Extraction timestamp",m.at],[],["Output column","Conversion factor applied"]];
  m.factors.forEach(f=>a.push(f));
  if(m.mapping.length){a.push([]);a.push(["Worksheet","Plant / entity used"]);m.mapping.forEach(f=>a.push(f))}
  return a;
}
function workbook(res){
  const wb=XLSX.utils.book_new(),data=[res.cols.map(c=>c.h)];
  for(let i=0;i<res.rows.length;i++){const r=res.rows[i];data.push(res.cols.map(c=>r[c.key]==null?null:r[c.key]))}
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),"Processed Data");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summaryAOA(res)),"Summary");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(validationAOA(res)),"Data Validation");
  return wb;
}
return {norm,parseDate,num,mul,div,parseCSV,score,suggest,NR,NR_COLS,WR_COLS,analyzeSheet,nrpcIndex,nrpcExtract,wrpcHeader,fileStem,resolvePlant,wrpcEntries,wrpcIndex,wrpcExtract,srpcIndex,srpcExtract,toCSV,validationCSV,validationAOA,summaryAOA,workbook,gaps};
})();
