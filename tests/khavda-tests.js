// Run with:  node tests/khavda-tests.js        (needs only Node.js 16 or newer)
// The tests load the real processing code from ../../solar-wind-96-blocks.html
// (the <script id="kd-core"> block), so they test exactly what ships in the page.
// NOTE: the SheetJS (xlsx) library is replaced by a tiny stand-in that hands back
// the table data directly, so these tests check OUR logic, not SheetJS itself.
const fs=require("fs"),path=require("path"),assert=require("assert");
const JSZip=require("../vendor/jszip.min.js");
const htmlPath=[path.join(__dirname,"..","index.html"),path.join(__dirname,"..","..","solar-wind-96-blocks.html")].find(fs.existsSync);
const html=fs.readFileSync(htmlPath,"utf8");
const core=/<script id="kd-core">([\s\S]*?)<\/script>/.exec(html)[1];
const XLSX={utils:{
  sheet_to_json:ws=>ws.__aoa,
  book_new:()=>({SheetNames:[],Sheets:{}}),
  aoa_to_sheet:a=>({__aoa:a}),
  book_append_sheet:(wb,ws,n)=>{wb.SheetNames.push(n);wb.Sheets[n]=ws}}};
const KD=new Function("XLSX",core+";return KD")(XLSX);

let pass=0,fail=0;const results=[];
async function test(name,fn){try{await fn();pass++;results.push("  ok   "+name)}catch(e){fail++;results.push("  FAIL "+name+"\n       "+e.message)}}
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`expected ${b} but got ${a}`);

/* ---------------- fixtures ---------------- */
const serial=iso=>Math.round(Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))/864e5)+25569;
const DATES=Array.from({length:7},(_,i)=>`2026-09-${String(21+i).padStart(2,"0")}`);
const PLANT="ABC RENEWABLE ENERGY PRIVATE LIMITED",OTHER="XYZ SOLAR POWER PVT LTD";
function nrpcBook(opt={}){
  const mk=(prefix,nameHdr,ents,valFn)=>{
    const aoa=[["Date",nameHdr,...Array.from({length:96},(_,i)=>prefix+(i+1))]];
    DATES.forEach((d,di)=>ents.forEach((e,k)=>{aoa.push([serial(d),e,...Array.from({length:96},(_,i)=>valFn(di,i+1,k))])}));
    return {__aoa:aoa};
  };
  const wb={SheetNames:[],Sheets:{}};
  const add=(n,ws)=>{wb.SheetNames.push(n);wb.Sheets[n]=ws};
  const solar=mk("DC","Plant Name",[PLANT,OTHER],(di,b,k)=>(di===0&&b===1&&k===0)?0.75:(b>=25&&b<=72?0.5:0));
  add(opt.solarName||"Solar_availability",solar);
  add("Act_Inj_Gen_Stations",mk("D","Entity Name",["ABC Renewable Energy RJ02 INF",OTHER.replace("PVT LTD","RJ05")],(di,b,k)=>(di===0&&b===1&&k===0)?0.25:0.1));
  if(!opt.noGS)add("GS_Stations",mk("GS","Station",["ABC Renewable Energy RJ02","XYZ Solar Power RJ05"],(di,b,k)=>b===3?0:0.2));
  add("Contract_Rate",mk("D","Entity Name",["ABC Renewable Energy RJ02 INF","XYZ Solar Power RJ05"],()=>2.5));
  add("Deviation_Charges",mk("D","Entity Name",["ABC Renewable Energy RJ02 INF","XYZ Solar Power RJ05"],(di,b)=>b/100));
  return wb;
}
const SEL={solar:PLANT,act:"ABC Renewable Energy RJ02 INF",gs:"ABC Renewable Energy RJ02",rate:"ABC Renewable Energy RJ02 INF",dev:"ABC Renewable Energy RJ02 INF"};

const HEAD="Date,Block,Constituents,Schedule (MWh),Actual (MWh),Wt. Avg. Rate (p/kWh),WS Seller Capacity (MWh),Deviation (MWh),Deviation (%)";
const ddmm=iso=>`${iso.slice(8,10)}-${iso.slice(5,7)}-${iso.slice(0,4)}`;
function wrpcCsv(o={}){
  const days=o.days||DATES,lines=[HEAD];
  days.forEach(d=>{for(let b=1;b<=96;b++){
    if(o.dropBlocks&&d===days[0]&&o.dropBlocks.includes(b))continue;
    const first=d===days[0]&&b===1;
    lines.push([ddmm(d),b,"GUJARAT",first?75.7175:b/10,first?19.091:b/20,first?788.55:500,first?1683.75:1000,first?-56.6265:-b/20,first?-74.79:-12.5].join(","));
  }});
  return lines.join("\n");
}
async function zipOf(files){const z=new JSZip();Object.entries(files).forEach(([n,t])=>z.file(n,t));return JSZip.loadAsync(await z.generateAsync({type:"nodebuffer"}))}

(async()=>{
/* ================= calculations ================= */
await test("dates: ISO, day-first, month names, Excel serial, Date object",()=>{
  assert.strictEqual(KD.parseDate("2026-09-21"),"2026-09-21");
  assert.strictEqual(KD.parseDate("21-09-2026"),"2026-09-21");
  assert.strictEqual(KD.parseDate("21/09/2026"),"2026-09-21");
  assert.strictEqual(KD.parseDate("21-Sep-2026"),"2026-09-21");
  assert.strictEqual(KD.parseDate("21 September 2026"),"2026-09-21");
  assert.strictEqual(KD.parseDate(serial("2026-09-21")),"2026-09-21");
  assert.strictEqual(KD.parseDate("31-02-2026"),null);
  assert.strictEqual(KD.parseDate("abc"),null);
});
await test("numbers: zero kept, blank and text flagged",()=>{
  assert.deepStrictEqual(KD.num(0),{v:0,s:"ok"});assert.deepStrictEqual(KD.num("0"),{v:0,s:"ok"});
  assert.strictEqual(KD.num("").s,"blank");assert.strictEqual(KD.num(null).s,"blank");assert.strictEqual(KD.num("N/A").s,"blank");
  assert.strictEqual(KD.num("abc").s,"bad");assert.strictEqual(KD.num("1,234.5").v,1234.5);
});
await test("conversion factors without floating-point noise",()=>{
  near(KD.mul(0.75,400),300);near(KD.mul(75.7175,4),302.87);near(KD.mul(19.091,4),76.364);
  near(KD.div(788.55,100),7.8855);near(KD.mul(1683.75,4),6735);near(KD.mul(-56.6265,4),-226.506);near(KD.mul(0.1,3),0.3);
});
await test("CSV parser: quotes, semicolons, BOM, CRLF",()=>{
  assert.deepStrictEqual(KD.parseCSV('\uFEFFa;b;c\r\n1;"x;y";3\r\n'),[["a","b","c"],["1","x;y","3"]]);
  assert.deepStrictEqual(KD.parseCSV('a,b\n"he said ""hi""",2\n'),[["a","b"],['he said "hi"',"2"]]);
});

/* ================= NRPC ================= */
await test("NRPC: worksheets found with spaces, underscores and case differences",()=>{
  const idx=KD.nrpcIndex(nrpcBook({solarName:"solar availability"}));
  assert.ok(idx.specs.solar.found&&idx.specs.act.found&&idx.specs.gs.found&&idx.specs.rate.found&&idx.specs.dev.found);
  assert.strictEqual(idx.warnings.filter(w=>w.sev!=="Info").length,0);
});
await test("NRPC: plant dropdown lists the unique plants of Solar_availability",()=>{
  const idx=KD.nrpcIndex(nrpcBook());assert.deepStrictEqual(idx.plants,[PLANT,OTHER].sort((a,b)=>a.localeCompare(b)));
});
await test("NRPC: plant mapping suggests a match but never an unrelated plant",()=>{
  const idx=KD.nrpcIndex(nrpcBook());
  const g=KD.suggest(idx.specs.gs.entities,PLANT);assert.strictEqual(g.auto.n,"ABC Renewable Energy RJ02");
  const bad=KD.suggest(["Totally Different Wind Farm","Another Hydro"],PLANT);assert.strictEqual(bad.auto,null);
  assert.ok(KD.score("ABC RENEWABLE ENERGY PRIVATE LIMITED","ABC Renewable Energy RJ02 INF")>=0.5);
});
await test("NRPC: 7 dates x 96 blocks = 672 records, sorted by date then block",()=>{
  const r=KD.nrpcExtract(KD.nrpcIndex(nrpcBook()),SEL);
  assert.strictEqual(r.rows.length,672);assert.strictEqual(r.meta.dates,7);
  assert.strictEqual(r.meta.first,"2026-09-21");assert.strictEqual(r.meta.last,"2026-09-27");
  for(let i=1;i<r.rows.length;i++){const a=r.rows[i-1],b=r.rows[i];assert.ok(a.date<b.date||(a.date===b.date&&a.block<b.block))}
  assert.strictEqual(r.rows.filter(x=>x.date==="2026-09-21").length,96);
});
await test("NRPC: DC x 400, Actual x 400, GS x 400, rate and charges unscaled",()=>{
  const r=KD.nrpcExtract(KD.nrpcIndex(nrpcBook()),SEL),f=r.rows[0];
  assert.strictEqual(f.dcCol,"DC1");near(f.solar,300);near(f.act,100);near(f.gs,80);near(f.rate,2.5);near(f.dev,0.01);
  near(r.rows[1].solar,0);   // zero kept
  near(r.rows[95].dev,0.96);near(r.rows[95].rate,2.5);
});
await test("NRPC: zero values are preserved, not turned into blanks",()=>{
  const r=KD.nrpcExtract(KD.nrpcIndex(nrpcBook()),SEL),row=r.rows.find(x=>x.date==="2026-09-22"&&x.block===3);
  assert.strictEqual(row.gs,0);assert.strictEqual(row.solar,0);
});
await test("NRPC: matching uses plant + date + block, not row position (shuffled rows)",()=>{
  const wb=nrpcBook();const a=wb.Sheets["Act_Inj_Gen_Stations"].__aoa,h=a.shift();a.reverse();a.unshift(h);
  const r=KD.nrpcExtract(KD.nrpcIndex(wb),SEL);near(r.rows[0].act,100);near(r.rows[0].solar,300);assert.strictEqual(r.rows.length,672);
});
await test("NRPC: other plant in the same sheets is not mixed in",()=>{
  const r=KD.nrpcExtract(KD.nrpcIndex(nrpcBook()),{solar:OTHER,act:"XYZ SOLAR POWER RJ05",gs:"XYZ Solar Power RJ05",rate:"XYZ Solar Power RJ05",dev:"XYZ Solar Power RJ05"});
  near(r.rows[0].solar,0);near(r.rows[0].rate,2.5);assert.strictEqual(r.rows.length,672);
});
await test("NRPC: missing value stays blank and is flagged",()=>{
  const wb=nrpcBook(),ws=wb.Sheets["Act_Inj_Gen_Stations"].__aoa;ws[3][2+4]="";   // ABC plant, 2nd day (rows alternate ABC, XYZ per day), block 5
  const r=KD.nrpcExtract(KD.nrpcIndex(wb),SEL),row=r.rows.find(x=>x.date==="2026-09-22"&&x.block===5);
  assert.strictEqual(row.act,null);assert.ok(r.details.some(d=>d.date==="2026-09-22"&&d.block===5&&/Missing/.test(d.issue)));
  assert.ok(r.issues.some(i=>i.type==="Missing values"));assert.ok(r.meta.missing>=1);
});
await test("NRPC: text in a numeric cell is flagged invalid and not converted",()=>{
  const wb=nrpcBook();wb.Sheets["GS_Stations"].__aoa[1][2+9]="abc";
  const r=KD.nrpcExtract(KD.nrpcIndex(wb),SEL),row=r.rows.find(x=>x.date==="2026-09-21"&&x.block===10);
  assert.strictEqual(row.gs,null);assert.ok(r.issues.some(i=>i.type==="Invalid numeric values"));
});
await test("NRPC: a missing worksheet gives a clear warning and a blank column",()=>{
  const idx=KD.nrpcIndex(nrpcBook({noGS:true}));
  assert.ok(idx.warnings.some(w=>w.type==="Missing worksheet"&&/GS_Stations/.test(w.detail)));
  const r=KD.nrpcExtract(idx,{...SEL,gs:""});assert.strictEqual(r.rows.length,672);assert.strictEqual(r.rows[0].gs,null);
});
await test("NRPC: duplicate plant/date rows are reported, first row used",()=>{
  const wb=nrpcBook(),a=wb.Sheets["Contract_Rate"].__aoa;a.push([...a[1]].map((v,i)=>i<2?v:9));
  const r=KD.nrpcExtract(KD.nrpcIndex(wb),SEL);near(r.rows[0].rate,2.5);assert.ok(r.issues.some(i=>i.type==="Duplicate records"));
});
await test("NRPC: a date missing in one worksheet is flagged, values left blank",()=>{
  const wb=nrpcBook(),a=wb.Sheets["Deviation_Charges"].__aoa;wb.Sheets["Deviation_Charges"].__aoa=a.filter(r=>!(r[0]===serial("2026-09-23")&&r[1]==="ABC Renewable Energy RJ02 INF"));
  const r=KD.nrpcExtract(KD.nrpcIndex(wb),SEL);
  assert.strictEqual(r.rows.find(x=>x.date==="2026-09-23"&&x.block===1).dev,null);assert.ok(r.issues.some(i=>i.type==="Missing dates"));
});
await test("NRPC: unmapped sheet is reported (no silent matching)",()=>{
  const r=KD.nrpcExtract(KD.nrpcIndex(nrpcBook()),{...SEL,rate:""});
  assert.strictEqual(r.rows[0].rate,null);assert.ok(r.issues.some(i=>i.type==="Plant mapping"));
});
await test("NRPC: header rows above the table and renamed block columns are tolerated",()=>{
  const wb=nrpcBook();const ws=wb.Sheets["GS_Stations"];ws.__aoa.unshift(["Report title"],[]);
  const r=KD.nrpcExtract(KD.nrpcIndex(wb),SEL);near(r.rows[0].gs,80);
});

/* ================= WRPC ================= */
const files6={
  "data/AREH5L_KHAVDAPS1_QCA.csv":wrpcCsv(),
  "data/AREH5L_KHAVDAPS3_QCA.csv":wrpcCsv(),
  "data/AREH5L_KHAVDAPS3_QCA_Infirm.csv":wrpcCsv(),
  "other_a.csv":wrpcCsv(),"other_b.csv":wrpcCsv(),
  "__MACOSX/._junk.csv":"junk","readme.txt":"not a csv"};
await test("WRPC: ZIP read, only CSV files counted, full plant names kept",async()=>{
  const idx=await KD.wrpcIndex(await zipOf(files6),{plantFrom:"auto"});
  assert.strictEqual(idx.nFiles,5);assert.strictEqual(idx.plants.size,5);
  assert.ok(idx.plants.has("AREH5L_KHAVDAPS3_QCA_Infirm"));assert.ok(idx.plants.has("AREH5L_KHAVDAPS1_QCA"));
});
await test("WRPC: complete extraction, conversions and original deviation %",async()=>{
  const idx=await KD.wrpcIndex(await zipOf(files6),{plantFrom:"auto"});
  const r=await KD.wrpcExtract(idx,"AREH5L_KHAVDAPS3_QCA"),f=r.rows[0];
  assert.strictEqual(r.rows.length,672);assert.strictEqual(r.meta.dates,7);
  assert.strictEqual(f.date,"2026-09-21");assert.strictEqual(f.block,1);assert.strictEqual(f.cons,"GUJARAT");
  near(f.sched,302.87);near(f.actual,76.364);near(f.rate,7.8855);near(f.cap,6735);near(f.devmw,-226.506);near(f.devpct,-74.79);
  near(r.rows[1].sched,0.8);near(r.rows[1].rate,5);near(r.rows[1].devpct,-12.5);
});
await test("WRPC: unsorted source data comes out in date then block order",async()=>{
  const lines=wrpcCsv().split("\n"),h=lines.shift();lines.reverse();
  const idx=await KD.wrpcIndex(await zipOf({"P_QCA.csv":[h,...lines].join("\n")}),{});
  const r=await KD.wrpcExtract(idx,"P_QCA");
  for(let i=1;i<r.rows.length;i++){const a=r.rows[i-1],b=r.rows[i];assert.ok(a.date<b.date||(a.date===b.date&&a.block<b.block))}
  assert.strictEqual(r.rows.length,672);
});
await test("WRPC: duplicate date/block rows are warned about, nothing deleted",async()=>{
  const lines=wrpcCsv().split("\n");lines.push(lines[5]);
  const r=await KD.wrpcExtract(await KD.wrpcIndex(await zipOf({"P_QCA.csv":lines.join("\n")}),{}),"P_QCA");
  assert.strictEqual(r.rows.length,673);assert.ok(r.issues.some(i=>i.type==="Duplicate records"));
});
await test("WRPC: a date with 90 blocks flags exactly the six missing blocks",async()=>{
  const r=await KD.wrpcExtract(await KD.wrpcIndex(await zipOf({"P_QCA.csv":wrpcCsv({dropBlocks:[10,11,12,50,51,96]})}),{}),"P_QCA");
  assert.strictEqual(r.rows.length,666);assert.strictEqual(r.meta.missing,6);
  const m=r.details.filter(d=>d.issue==="Missing block").map(d=>d.block).sort((a,b)=>a-b);assert.deepStrictEqual(m,[10,11,12,50,51,96]);
});
await test("WRPC: blank and text values stay blank, zero is kept",async()=>{
  const lines=wrpcCsv().split("\n");
  lines[3]="21-09-2026,3,GUJARAT,0,,788.55,abc,-1,-2";
  const r=await KD.wrpcExtract(await KD.wrpcIndex(await zipOf({"P_QCA.csv":lines.join("\n")}),{}),"P_QCA"),x=r.rows.find(q=>q.date==="2026-09-21"&&q.block===3);
  assert.strictEqual(x.sched,0);assert.strictEqual(x.actual,null);assert.strictEqual(x.cap,null);
  assert.ok(r.issues.some(i=>i.type==="Missing values"));assert.ok(r.issues.some(i=>i.type==="Invalid numeric values"));
});
await test("WRPC: missing date gap between first and last date is reported",async()=>{
  const r=await KD.wrpcExtract(await KD.wrpcIndex(await zipOf({"P_QCA.csv":wrpcCsv({days:["2026-09-21","2026-09-24"]})}),{}),"P_QCA");
  assert.ok(r.issues.some(i=>i.type==="Missing dates"&&i.count===2));
});
await test("WRPC: plant names read from a column (several plants in one file)",async()=>{
  const body=(n)=>wrpcCsv({days:[DATES[0]]}).split("\n").slice(1).map(l=>n+","+l);
  const text="Entity,"+HEAD+"\n"+[...body("PLANT_A"),...body("PLANT_B")].join("\n");
  const idx=await KD.wrpcIndex(await zipOf({"all.csv":text}),{plantFrom:"auto"});
  assert.deepStrictEqual([...idx.plants.keys()].sort(),["PLANT_A","PLANT_B"]);
  const r=await KD.wrpcExtract(idx,"PLANT_B");assert.strictEqual(r.rows.length,96);
});
await test("WRPC: plant name read from text above the table and from quoted semicolon CSV",async()=>{
  const text='Report;\nEntity Name: MY_PLANT_QCA\n\n'+HEAD.split(",").join(";")+"\n"+wrpcCsv({days:[DATES[0]]}).split("\n").slice(1).map(l=>l.split(",").join(";")).join("\n");
  const idx=await KD.wrpcIndex(await zipOf({"x.csv":text}),{plantFrom:"auto"});
  assert.ok(idx.plants.has("MY_PLANT_QCA"));const r=await KD.wrpcExtract(idx,"MY_PLANT_QCA");assert.strictEqual(r.rows.length,96);near(r.rows[0].sched,302.87);
});
await test("WRPC: date-stamped file names collapse to one plant",async()=>{
  assert.strictEqual(KD.fileStem("a/b/AREH5L_KHAVDAPS1_QCA_2026-09-21.csv"),"AREH5L_KHAVDAPS1_QCA");
  assert.strictEqual(KD.fileStem("AREH5L_KHAVDAPS3_QCA_Infirm.csv"),"AREH5L_KHAVDAPS3_QCA_Infirm");
  const z=await zipOf({"P_QCA_2026-09-21.csv":wrpcCsv({days:[DATES[0]]}),"P_QCA_2026-09-22.csv":wrpcCsv({days:[DATES[1]]})});
  const idx=await KD.wrpcIndex(z,{});assert.strictEqual(idx.plants.size,1);
  assert.strictEqual((await KD.wrpcExtract(idx,"P_QCA")).rows.length,192);
});
await test("WRPC: empty and headerless files are skipped, corrupted ZIP is rejected",async()=>{
  const idx=await KD.wrpcIndex(await zipOf({"empty.csv":"","bad.csv":"a,b\n1,2","ok_QCA.csv":wrpcCsv({days:[DATES[0]]})}),{});
  assert.strictEqual(idx.skipped.length,2);assert.strictEqual(idx.plants.size,1);
  let rejected=false;try{await JSZip.loadAsync(Buffer.from("this is not a zip file"))}catch(e){rejected=true}assert.ok(rejected);
});

/* ================= export ================= */
/* ================= weekly files joined ("All plants at once") ================= */
await test("NRPC: two weekly workbooks with the same days are joined once",()=>{
  const idx=KD.nrpcIndexMany([{name:"week2.xlsx",wb:nrpcBook()},{name:"week1.xlsx",wb:nrpcBook()}]);
  assert.strictEqual(idx.nFiles,2);assert.ok(idx.plants.includes(PLANT));
  const r=KD.nrpcExtract(idx,SEL);
  assert.strictEqual(r.rows.length,672);
  assert.ok(r.issues.some(i=>i.type==="Overlapping workbooks"&&i.sev==="Info"));
});
await test("NRPC: one workbook through nrpcIndexMany gives the same rows as before",()=>{
  const a=KD.nrpcExtract(KD.nrpcIndex(nrpcBook()),SEL),b=KD.nrpcExtract(KD.nrpcIndexMany([{name:"x.xlsx",wb:nrpcBook()}]),SEL);
  assert.strictEqual(JSON.stringify(a.rows),JSON.stringify(b.rows));
});
await test("WRPC: two weekly ZIPs with an overlapping day: the second copy is not used",async()=>{
  const z1=await zipOf({"P_QCA.csv":wrpcCsv({days:DATES.slice(0,3)})}),z2=await zipOf({"P_QCA.csv":wrpcCsv({days:DATES.slice(2,5)})});
  const idx=await KD.wrpcIndex([...KD.wrpcEntries(z1),...KD.wrpcEntries(z2)],{});
  assert.strictEqual(idx.nFiles,2);assert.strictEqual(idx.plants.size,1);
  const r=await KD.wrpcExtract(idx,"P_QCA");
  assert.strictEqual(r.rows.length,96*5);
  assert.ok(r.issues.some(i=>i.type==="Overlapping files"&&i.count===96));
});
await test("SRPC: weekly files of one plant are joined; overlapping blocks kept once",async()=>{
  const H="record_id,date,time,available_capacity,sch_total,act_total,rate,ppa_rate,dev,dev_perc,nc_energy,beyond_nc_energy,Overinjection_charges,Underinjection_Charges,Drawl_Charges";
  const day=(d,cols)=>Array.from({length:96},(_,i)=>{const m=i*15,t=String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0")+":00";
    const v={record_id:d+"-"+t,date:d,time:t,available_capacity:62.5,sch_total:10,act_total:11,rate:273,ppa_rate:273,dev:1,dev_perc:1.6,nc_energy:1,beyond_nc_energy:0,Overinjection_charges:2730,Underinjection_Charges:0,Drawl_Charges:0};
    return cols.map(c=>v[c]).join(",")}).join("\n");
  const c1=H.split(","),c2=c1.slice().reverse();
  const f1=[H,day("2026-10-26",c1),day("2026-10-27",c1)].join("\n"),f2=[c2.join(","),day("2026-10-27",c2),day("2026-10-28",c2)].join("\n");
  const plants=KD.srpcMerge(await KD.srpcIndex([{name:"wk1/commercial_dev2022_abc.csv",async:async()=>f1},{name:"wk2/commercial_dev2022_abc (1).csv",async:async()=>f2}]));
  assert.strictEqual(plants.length,1);assert.strictEqual(plants[0].files.length,2);
  const r=KD.srpcExtract(plants[0]);assert.strictEqual(r.rows.length,288);
  assert.ok(r.issues.some(i=>i.type==="Overlapping files"&&i.sev==="Info"&&i.count===96));
  assert.ok(!r.issues.some(i=>i.sev==="Warning"));
});
await test("export: CSV holds every record with the exact column order, blanks stay blank",async()=>{
  const r=await KD.wrpcExtract(await KD.wrpcIndex(await zipOf({"P_QCA.csv":wrpcCsv()}),{}),"P_QCA");
  const lines=KD.toCSV(r).replace(/^\uFEFF/,"").split("\r\n");
  assert.strictEqual(lines.length,673);
  assert.strictEqual(lines[0],"Date,Block,Constituents,Schedule (MW),Actual (MW),Wt. Avg. Rate (Rs/kWh),WS Seller Capacity (MW),Deviation (MW),Deviation (%)");
  const n=KD.nrpcExtract(KD.nrpcIndex(nrpcBook()),{...SEL,rate:""});
  const nl=KD.toCSV(n).replace(/^\uFEFF/,"").split("\r\n");assert.strictEqual(nl.length,673);
  assert.strictEqual(nl[0],"Date,Block,DC Column,Solar Availability (MW),Actual Injection (MW),GS Station (MW),Contract Rate,Deviation Charges");
  assert.ok(/^2026-09-21,1,DC1,300,100,80,,0\.01$/.test(nl[1]),nl[1]);
});
await test("export: Excel workbook has Processed Data, Summary and Data Validation sheets with all rows",async()=>{
  const r=await KD.wrpcExtract(await KD.wrpcIndex(await zipOf({"P_QCA.csv":wrpcCsv({dropBlocks:[1]})}),{}),"P_QCA");
  const wb=KD.workbook(r);assert.deepStrictEqual(wb.SheetNames,["Processed Data","Summary","Data Validation"]);
  assert.strictEqual(wb.Sheets["Processed Data"].__aoa.length,r.rows.length+1);
  const sum=wb.Sheets["Summary"].__aoa.map(x=>x.join("|")).join("\n");
  ["Region|WRPC","Selected plant|P_QCA","First date|2026-09-21","Last date|2026-09-27","Total dates|7","Total records|671","Extraction timestamp","Schedule (MWh) × 4","÷ 100"].forEach(t=>assert.ok(sum.includes(t),t));
  assert.ok(wb.Sheets["Data Validation"].__aoa.some(x=>x[3]==="Missing block"));
});

/* ================= performance / completeness ================= */
for(const n of [672,10000,35040,100000]){
  await test(`performance: ${n.toLocaleString()} records are all extracted`,async()=>{
    const days=Math.ceil(n/96),lines=[HEAD];let c=0;const t0=Date.UTC(2024,0,1);
    for(let d=0;d<days&&c<n;d++){const dt=new Date(t0+d*864e5).toISOString().slice(0,10);for(let b=1;b<=96&&c<n;b++,c++)lines.push(`${ddmm(dt)},${b},GUJARAT,${b/7},${b/9},788.55,1683.75,${-b/11},${-b/3}`)}
    const z=await zipOf({"BIG_QCA.csv":lines.join("\n")});
    const a=Date.now(),idx=await KD.wrpcIndex(z,{}),r=await KD.wrpcExtract(idx,"BIG_QCA"),csv=KD.toCSV(r),ms=Date.now()-a;
    assert.strictEqual(r.rows.length,n);assert.strictEqual(csv.split("\r\n").length,n+1);
    results.push(`         (${ms} ms for read + convert + sort + CSV build)`);
    assert.ok(ms<60000);
  });
}

/* ---------------- RPC rule library file ---------------- */
await test("rules: data/rpc-rules.json is valid and matches the X-factor trajectory",()=>{
  const j=JSON.parse(fs.readFileSync(path.join(__dirname,"..","data","rpc-rules.json"),"utf8"));
  const ids=j.rules.map(r=>r.id);
  ["cerc2024","legacy15","cerc2024x"].forEach(id=>assert.ok(ids.includes(id),"missing rule "+id));
  for(const r of j.rules){
    const n=r.rates.pay.length;
    ["dsm","over","loss"].forEach(k=>assert.strictEqual(r.rates[k].length,n,r.id+" "+k));
    for(const p of r.periods)for(const t of ["solar","wind"]){
      assert.strictEqual(p[t].length,n-1,`${r.id} ${p.from} ${t} limits`);
      p[t].forEach((v,i)=>assert.ok(v>0&&(!i||v>p[t][i-1]),`${r.id} limits must rise`));
      assert.ok(p.x[t]>=0&&p.x[t]<=100);
    }
  }
  const xr=j.rules.find(r=>r.id==="cerc2024x"),xAt=d=>xr.periods.find(p=>(!p.from||d>=p.from)&&(!p.to||d<=p.to)).x.solar;
  assert.deepStrictEqual(["2026-06-01","2027-06-01","2028-06-01","2029-06-01","2030-06-01","2031-06-01"].map(xAt),[100,80,60,40,20,0]);
  const html2=fs.readFileSync(htmlPath,"utf8");
  assert.ok(/B0=X>=100\?A:X\/100\*A\+\(100-X\)\/100\*Math\.max\(r\.s,0\)/.test(html2),"engine uses the X-factor base");
});

console.log("\nKhavda NRPC / WRPC tests\n"+results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
