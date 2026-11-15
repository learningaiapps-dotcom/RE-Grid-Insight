// Creates samples/wrpc-sample.zip (run with: node samples/make-wrpc-sample.js)
const fs=require("fs"),path=require("path"),JSZip=require("../vendor/jszip.min.js");
const HEAD="Date,Block,Constituents,Schedule (MWh),Actual (MWh),Wt. Avg. Rate (p/kWh),WS Seller Capacity (MWh),Deviation (MWh),Deviation (%)";
function csv(seed){
  const rows=[HEAD];
  for(let d=0;d<7;d++){const dt=`${String(21+d).padStart(2,"0")}-09-2026`;
    for(let b=1;b<=96;b++){const h=(b-.5)/4,x=h>6&&h<18?Math.sin(Math.PI*(h-6)/12):0;
      let sch=+(80*x*seed).toFixed(4),act=+(sch*0.93).toFixed(4),rate=788.55,cap=1683.75,dev=+((act-sch)).toFixed(4),pct=sch?+((act-sch)/sch*100).toFixed(2):0;
      if(d===0&&b===1&&seed===1){sch=75.7175;act=19.091;dev=-56.6265;pct=-74.79}
      rows.push([dt,b,"GUJARAT",sch,act,rate,cap,dev,pct].join(","));}}
  return rows.join("\n");
}
(async()=>{
  const z=new JSZip();
  const names=[["AREH5L_KHAVDAPS1_QCA",1],["AREH5L_KHAVDAPS3_QCA",1],["AREH5L_KHAVDAPS3_QCA_Infirm",0.2],["OTHER_PLANT_A_QCA",0.5],["OTHER_PLANT_B_QCA",0.7],["OTHER_PLANT_C_QCA",0.9]];
  names.forEach(([n,s])=>z.file(n+".csv",csv(s)));
  fs.writeFileSync(path.join(__dirname,"wrpc-sample.zip"),await z.generateAsync({type:"nodebuffer",compression:"DEFLATE"}));
  console.log("wrpc-sample.zip written");
})();
