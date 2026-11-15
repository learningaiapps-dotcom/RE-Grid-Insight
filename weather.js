// name, Open-Meteo model id, region note
const MODELS=[
["ICON","icon_seamless","DWD, Germany · 2-11 km"],
["GFS & HRRR","gfs_seamless","NOAA, USA · 3-25 km"],
["ARPEGE & AROME","meteofrance_seamless","Météo-France · 1-25 km"],
["IFS","ecmwf_ifs025","ECMWF · 25 km"],
["AIFS","ecmwf_aifs025_single","ECMWF · 25 km"],
["UKMO","ukmo_seamless","UK Met Office · 2-10 km"],
["KMA","kma_seamless","KMA, Korea · 1.5-13 km"],
["MSM & GSM","jma_seamless","JMA, Japan · 5-55 km"],
["ICON CH","meteoswiss_icon_seamless","MeteoSwiss · 1-2 km"],
["MET Nordic","metno_seamless","MET Norway · 1 km"],
["GEM","gem_seamless","Canada · 2.5 km"],
["ACCESS-G","bom_access_global","BOM, Australia · 15 km"],
["GFS GRAPES","cma_grapes_global","CMA, China · 15 km"],
["HARMONIE (KNMI)","knmi_seamless","Netherlands · 2 km"],
["HARMONIE (DMI)","dmi_seamless","Denmark · 2 km"],
["ARPAE","italia_meteo_arpae_icon_2i","ItaliaMeteo · 2 km"],
["AROME Austria","geosphere_seamless","GeoSphere Austria · 2.5 km"],
["ALADIN","chmi_aladin","CHMI, Czech Rep. · 1-2.3 km"]
];
const INFO={icon_seamless:["3 hours","7.5 days","dwd_icon"],gfs_seamless:["hour","16 days","ncep_gfs025"],meteofrance_seamless:["hour","4 days","meteofrance_arpege_world025"],
ecmwf_ifs025:["6 hours","15 days","ecmwf_ifs025"],ecmwf_aifs025_single:["6 hours","15 days","ecmwf_aifs025_single"],ukmo_seamless:["hour","7 days","ukmo_global_deterministic_10km"],
kma_seamless:["6 hours","12 days","kma_gdps"],jma_seamless:["3 hours","11 days","jma_gsm"],meteoswiss_icon_seamless:["3 hours","5 days","meteoswiss_icon_ch1"],
metno_seamless:["hour","2.5 days","metno_nordic_pp"],gem_seamless:["6 hours","10 days","cmc_gem_gdps"],bom_access_global:["6 hours","10 days","bom_access_global"],
cma_grapes_global:["6 hours","10 days","cma_grapes_global"],knmi_seamless:["hour","2.5 days","knmi_harmonie_arome_europe"],dmi_seamless:["3 hours","2.5 days","dmi_harmonie_arome_europe"],
italia_meteo_arpae_icon_2i:["12 hours","3 days","italia_meteo_arpae_icon_2i"],geosphere_seamless:["3 hours","2.5 days","geosphere_arome_austria"],chmi_aladin:["6 hours","3 days",null]};
const COLORS=["#2563eb","#ea580c","#16a34a"];
const $=id=>document.getElementById(id);
let results=[],chart=null,label="",weatherLocation=null;

$("dt").value=new Date().toISOString().slice(0,10);
$("models").innerHTML=MODELS.map((m,i)=>`<label><input type="checkbox" value="${i}" ${i<2?"checked":""}><span>${m[0]}<small>${m[2]} · updates every ${INFO[m[1]][0]}</small></span></label>`).join("");
function picked(){return [...document.querySelectorAll("#models input:checked")].map(c=>+c.value)}
document.getElementById("models").addEventListener("change",e=>{
  if(picked().length>3){e.target.checked=false;msg("You can compare up to 3 models.",true)}
  $("cnt").textContent=picked().length;
});
$("cnt").textContent=picked().length;
function msg(t,err){$("msg").textContent=t;$("msg").className=err?"err":""}

async function geocode(name,country,state=""){
  let hint=(country||"").trim().toLowerCase();
  if(name.includes(",")){const pr=name.split(",");name=pr[0].trim();if(!hint)hint=pr.slice(1).join(" ").trim().toLowerCase()}
  const query=new URLSearchParams({name,count:state?"100":"20",language:"en"});
  if(/^[a-z]{2}$/.test(hint))query.set("countryCode",hint.toUpperCase());
  if(hint==="india")query.set("countryCode","IN");
  const j=await (await fetch("https://geocoding-api.open-meteo.com/v1/search?"+query)).json();
  const list=j.results||[];
  if(!list.length)return null;
  const m=x=>(x||"").trim().toLowerCase();
  if(state){
    const region=m(state);
    return list.find(p=>(!hint||[p.country,p.country_code].some(v=>m(v)===hint))&&m(p.admin1)===region)||null;
  }
  if(!hint)return list[0];
  return list.find(p=>m(p.country)===hint||m(p.country_code)===hint)||list.find(p=>m(p.country).includes(hint)||m(p.admin1).includes(hint))||null;
}
const addDays=(d,n)=>{const t=new Date(d+"T00:00:00Z");t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
async function getModel(m,p,d1,d2){
  const today=new Date().toISOString().slice(0,10),chunks=[];
  for(let s=d1;s<=d2;s=addDays(s,31)){const e=addDays(s,30);chunks.push([s,e<d2?e:d2])}
  const parts=await Promise.all(chunks.map(async([a,b])=>{
    const host=a<addDays(today,-90)?"https://historical-forecast-api.open-meteo.com/v1/forecast":"https://api.open-meteo.com/v1/forecast";
    const u=`${host}?latitude=${p.latitude}&longitude=${p.longitude}&minutely_15=shortwave_radiation,wind_speed_10m,wind_speed_80m&wind_speed_unit=ms&timezone=auto&start_date=${a}&end_date=${b}&models=${m[1]}`;
    const j=await (await fetch(u)).json();
    if(j.error||!j.minutely_15)throw new Error(j.reason||"No data");
    return j.minutely_15;
  }));
  const cat=k=>parts.flatMap(x=>x[k]);
  return {name:m[0],id:m[1],time:cat("time"),ghi:cat("shortwave_radiation"),w10:cat("wind_speed_10m"),w80:cat("wind_speed_80m")};
}

async function reverse(lat,lon){
  try{
    const j=await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=${lat}&lon=${lon}`)).json(),a=j.address||{};
    const name=a.city||a.town||a.village||a.municipality||a.suburb||a.county||a.state_district||a.state||"";
    if(name||a.country)return {name,country:a.country||"",area:a.state||""};
  }catch(e){}
  const j=await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)).json();
  return {name:j.city||j.locality||j.principalSubdivision||"",country:j.countryName||"",area:j.principalSubdivision||""};
}
function llOK(){const la=parseFloat($("lat").value),lo=parseFloat($("lon").value);return (!isNaN(la)&&!isNaN(lo)&&Math.abs(la)<=90&&Math.abs(lo)<=180)?[la,lo]:null}
const gs=(t,e)=>{$("geost").textContent=t;$("geost").className="note"+(e?" err":"")};
$("cty").parentElement.insertAdjacentHTML("afterend", '<label class="f">State / province<input id="geo-state" placeholder="optional, e.g. Gujarat"></label>');
$("geost").setAttribute("role","status");
const stateField=$("geo-state");
let geoTok=0;
async function fillCoords(){
  const loc=$("loc").value.trim(),cty=$("cty").value.trim();
  if(!loc)return null;
  const tok=++geoTok;gs("Finding coordinates…");
  try{
    const state=stateField.value.trim(),p=await geocode(loc,cty,state);
    if(tok!==geoTok)return null;
    if(!p){gs(state?`Could not find "${loc}" in "${state}". Check the state and country, or enter coordinates.`:cty?`Could not find "${loc}" in "${cty}". Check the spelling or the country, or type latitude and longitude.`:`Could not find "${loc}". Check the spelling or add the country.`,true);return null}
    $("lat").value=p.latitude.toFixed(4);$("lon").value=p.longitude.toFixed(4);
    if(!cty)$("cty").value=p.country||"";
    stateField.value=p.admin1||"";
    if(loc.includes(","))$("loc").value=p.name;
    gs(`Found: ${p.name}${p.admin1?", "+p.admin1:""}, ${p.country} → ${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}${cty?"":" (first match; add the country to choose another place)"}`);
    return p;
  }catch(e){if(tok===geoTok)gs("Could not look up the coordinates. Check your internet connection.",true);return null}
}
async function fillName(){
  const c=llOK();if(!c)return;
  const tok=++geoTok;gs("Finding place name…");
  try{
    const n=await reverse(c[0],c[1]);if(tok!==geoTok)return;
    $("loc").value=n.name;$("cty").value=n.country;stateField.value=n.area;
    gs(n.name||n.country?`Found: ${[n.name,n.area&&n.area!==n.name?n.area:"",n.country].filter(Boolean).join(", ")} (${c[0].toFixed(4)}, ${c[1].toFixed(4)})`:"No place name found for these coordinates (maybe open sea). They will still be used.");
  }catch(e){if(tok===geoTok)gs("Could not look up the place name. The coordinates will still be used.",true)}
}
const deb=(f,ms)=>{let t;return()=>{clearTimeout(t);t=setTimeout(f,ms)}};
const byName=deb(()=>{if($("loc").value.trim())fillCoords()},700);
const byCoord=deb(()=>{if(llOK())fillName()},700);
["loc","cty","geo-state"].forEach(i=>$(i).addEventListener("input",()=>{geoTok++;$("lat").value="";$("lon").value="";if(!$("loc").value.trim())gs("");byName()}));
["lat","lon"].forEach(i=>$(i).addEventListener("input",()=>{
  geoTok++;
  const m=$(i).value.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if(m){$("lat").value=m[1];$("lon").value=m[2]}
  $("loc").value="";$("cty").value="";stateField.value="";
  if(!llOK())gs("");
  byCoord();
}));

/* show only the weather models that cover the chosen country */
const REGIONAL={ // models that cover only some countries; every other model is global
 meteoswiss_icon_seamless:["switzerland","liechtenstein"],
 metno_seamless:["norway","sweden","finland","denmark","estonia","latvia","lithuania"],
 knmi_seamless:["netherlands","belgium","luxembourg","germany","france","united kingdom","ireland","denmark"],
 dmi_seamless:["denmark","sweden","norway","germany","iceland","greenland"],
 italia_meteo_arpae_icon_2i:["italy","san marino","vatican city","malta","switzerland","slovenia"],
 geosphere_seamless:["austria","germany","czechia","czech republic","slovakia","hungary","slovenia"],
 chmi_aladin:["czechia","czech republic","slovakia","austria","poland","germany","hungary"]
};
const CALIAS={uk:"united kingdom","great britain":"united kingdom",england:"united kingdom",scotland:"united kingdom",wales:"united kingdom",nl:"netherlands",holland:"netherlands",usa:"united states",us:"united states",ch:"switzerland",at:"austria",de:"germany",dk:"denmark",no:"norway",se:"sweden",fi:"finland",it:"italy",cz:"czechia","czech republic":"czechia",in:"india"};
function applyModelFilter(){
  const raw=$("cty").value.trim().toLowerCase(),c=CALIAS[raw]||raw,on=$("mfilter").checked&&c;
  let shown=0,hidden=0;
  document.querySelectorAll("#models label").forEach(l=>{
    const inp=l.querySelector("input"),id=MODELS[+inp.value][1],reg=REGIONAL[id];
    const ok=!on||!reg||reg.includes(c==="czech republic"?"czechia":c)||reg.includes(c);
    l.style.display=ok?"":"none";
    if(!ok){hidden++;if(inp.checked){inp.checked=false}}else shown++;
  });
  $("cnt").textContent=picked().length;
  $("mfnote").textContent=on?`Showing ${shown} models for ${$("cty").value.trim()}. ${hidden} regional models for other areas are hidden (the global models work everywhere).`:"";
}
$("mfilter").addEventListener("change",applyModelFilter);
$("cty").addEventListener("input",deb(applyModelFilter,300));
new MutationObserver(applyModelFilter).observe($("cty"),{attributes:true});
const _cd=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");
Object.defineProperty($("cty"),"value",{get(){return _cd.get.call(this)},set(v){_cd.set.call(this,v);applyModelFilter()}});
applyModelFilter();

/* how accurate was each model on the last 3 days (day-ahead forecast vs. actual) */
(function(){
  const css=document.createElement("style");css.textContent=".acc{display:block;margin-top:3px;font-size:11px;color:var(--mute);line-height:1.5}.acc b{font-weight:600}.acc .g{color:#16a34a}.acc .m{color:#ca8a04}.acc .r{color:#dc2626}";document.head.appendChild(css);
  const cls=v=>v==null?"":v>=85?"g":v>=70?"m":"r",fm=v=>v==null?"n/a":`<b class="${cls(v)}">${v}%</b>`;
  const score=(f,a,min)=>{let e=0,t=0;for(let i=0;i<a.length;i++){if(a[i]==null||f[i]==null||a[i]<min)continue;e+=Math.abs(f[i]-a[i]);t+=a[i]}return t>0?Math.max(0,Math.round(100*(1-e/t))):null};
  let last="",tok=0;
  async function run(){
    const c=llOK();if(!c)return;const key=c.join(",");if(key===last)return;last=key;const t=++tok;
    const labs=[...document.querySelectorAll("#models label")].filter(l=>l.style.display!=="none");
    document.querySelectorAll("#models .acc").forEach(x=>x.remove());
    $("accnote").textContent="Checking how accurate each model was over the last 3 days…";
    const q=`latitude=${c[0]}&longitude=${c[1]}&timezone=auto&wind_speed_unit=ms&past_days=3&forecast_days=1`;
    try{
      const act=await (await fetch(`https://api.open-meteo.com/v1/forecast?${q}&hourly=shortwave_radiation,wind_speed_80m&models=ecmwf_ifs`)).json();
      if(t!==tok)return;if(act.error||!act.hourly)throw new Error("no actual");
      const A=act.hourly,res=await Promise.allSettled(labs.map(async l=>{
        const id=MODELS[+l.querySelector("input").value][1];
        const j=await (await fetch(`https://previous-runs-api.open-meteo.com/v1/forecast?${q}&hourly=shortwave_radiation_previous_day1,wind_speed_80m_previous_day1&models=${id}`)).json();
        const H=j.hourly||{},fs=H.shortwave_radiation_previous_day1,fw=H.wind_speed_80m_previous_day1;
        const out=[];
        for(let d=2;d>=0;d--){const r=[d*24+24-24,d*24+24];const lo=(2-d)*24+24-24;// day index: yesterday is the third block
          const a=(2-d)*24,b=a+24; // block 0 = 3 days ago ... block 2 = yesterday
          out.push({so:fs?score(fs.slice(a,b),A.shortwave_radiation.slice(a,b),20):null,wi:fw?score(fw.slice(a,b),A.wind_speed_80m.slice(a,b),0.01):null});}
        return {l,out:out.reverse()}; // yesterday, 2 days ago, 3 days ago
      }));
      if(t!==tok)return;
      res.forEach(r=>{if(r.status!=="fulfilled")return;const {l,out}=r.value,sp=document.createElement("span");sp.className="acc";
        sp.innerHTML=`Solar ${out.map(o=>fm(o.so)).join(" · ")}<br>Wind ${out.map(o=>fm(o.wi)).join(" · ")}`;l.querySelector("span").appendChild(sp)});
      $("accnote").innerHTML="<b>Accuracy</b> of the day-ahead forecast, in this order: <b>yesterday · 2 days ago · 3 days ago</b>. Solar = radiation (daylight hours), Wind = speed at 80 m. 100% = perfect. The \"actual\" is the ECMWF IFS 9 km analysis from Open-Meteo, not a station reading, so ECMWF models score a little high. n/a = that model has no past-forecast record here.";
    }catch(e){if(t===tok){$("accnote").textContent="Could not load the last-3-day accuracy (internet or Open-Meteo problem).";last=""}}
  }
  setInterval(run,1500);
  $("mfilter").addEventListener("change",()=>{last=""});$("cty").addEventListener("input",()=>{last=""});
})();

const updateMeteogramResults=(()=>{
  $("p1").insertAdjacentHTML("beforeend", `
    <details class="card" style="margin-top:12px">
      <summary><strong>IMD meteogram analysis</strong></summary>
      <p><a href="https://nwp.imd.gov.in/gfs_meteograms_mausam.php" target="_blank" rel="noopener noreferrer">Open IMD GFS meteograms ↗</a></p>
      <div class="row">
        <label class="f">Upload meteogram image<input id="imd-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
        <label class="f">Paste screenshot<textarea id="imd-paste" rows="2" placeholder="Click here and press Ctrl+V or Cmd+V"></textarea></label>
      </div>
      <label class="f" style="margin-top:10px">IMD numerical forecast CSV (optional)
        <input id="imd-forecast-csv" type="file" accept=".csv,text/csv">
      </label>
      <p class="note">Set the weather location first. Use plant-local timestamps and headers <code>time,ghi,wind_10m,wind_80m</code>. Include only the measurement columns available. For the solar generation chart, add <code>gti</code> (W/m² on the selected panel orientation) or <code>solar_mw</code> (plant generation forecast in MW).</p>
      <p id="imd-csv-status" class="note" role="status"></p>
      <p id="imd-status" class="note" role="status"></p>
      <div id="imd-review" hidden>
        <img id="imd-preview" alt="Uploaded IMD meteogram" style="display:block;max-width:100%;max-height:540px">
        <p class="note">Select only cues visible in the forecast window you’re investigating. Check the issue time, time zone and location.</p>
        <fieldset>
          <legend>Visible forecast cues</legend>
          <label><input type="checkbox" id="imd-cloud"> Cloud cover increases</label>
          <label><input type="checkbox" id="imd-moisture"> Higher humidity aloft</label>
          <label><input type="checkbox" id="imd-cape"> Elevated CAPE</label>
          <label><input type="checkbox" id="imd-rain"> Rain signal</label>
        </fieldset>
        <p id="imd-interpretation" role="status"></p>
        <button id="imd-remove" class="alt" type="button">Remove image</button>
      </div>
    </details>`);
  const imdCues=["cloud","moisture","cape","rain"].map(key=>$("imd-"+key));
  const imdPreview=$("imd-preview");
  let imdImage;
  function meteogramSummary(){
    const [cloud,moisture,cape,rain]=imdCues.map(input=>input.checked);
    const hints=[];
    if(cloud)hints.push("Increasing forecast cloud cover suggests a risk of lower solar irradiance.");
    if(moisture&&cape)hints.push("Moisture aloft and elevated CAPE suggest conditions that could support cloud development.");
    else if(moisture)hints.push("Higher humidity aloft suggests moisture is present.");
    else if(cape)hints.push("Elevated CAPE suggests potential for convection if forecast conditions support it.");
    if(rain)hints.push("The rain signal adds context for possible cloud cover.");
    if(!hints.length)return "Image attached. Select the cues you can read to generate a short interpretation.";
    return hints.join(" ");
  }
  function renderMeteogram(){
    const summary=imdImage?meteogramSummary():"";
    $("imd-interpretation").textContent=summary;
    for(const result of document.querySelectorAll("[data-imd-result]")){
      result.hidden=!imdImage;
      result.textContent=summary?" · IMD meteogram: "+summary:"";
    }
  }
  function clearMeteogram(){
    if(imdImage)URL.revokeObjectURL(imdImage);
    imdImage=undefined;
    imdPreview.removeAttribute("src");
    $("imd-review").hidden=true;
    imdCues.forEach(input=>{input.checked=false});
    renderMeteogram();
  }
  function attachMeteogram(file){
    if(!file)return;
    if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>10*1024*1024){
      $("imd-status").textContent="Choose a PNG, JPEG, WebP or GIF image up to 10 MB.";
      return;
    }
    clearMeteogram();
    imdImage=URL.createObjectURL(file);
    imdPreview.src=imdImage;
    $("imd-review").hidden=false;
    $("imd-status").textContent="Image attached in this browser. Select the cues it shows.";
    renderMeteogram();
  }
  imdPreview.onerror=()=>{
    clearMeteogram();
    $("imd-status").textContent="This image could not be opened. Try another screenshot.";
  };
  $("imd-file").onchange=event=>{
    attachMeteogram(event.target.files[0]);
    event.target.value="";
  };
  $("imd-paste").addEventListener("paste",event=>{
    event.preventDefault();
    const image=[...event.clipboardData.items].find(item=>item.type.startsWith("image/"));
    if(image)attachMeteogram(image.getAsFile());
    else $("imd-status").textContent="Copy an image or screenshot, then paste it here.";
  });
  $("imd-remove").onclick=()=>{
    clearMeteogram();
    $("imd-status").textContent="Image removed.";
  };
  imdCues.forEach(input=>input.addEventListener("change",renderMeteogram));
  return renderMeteogram;
})();

let imdSeries,imdImportId=0;
const imdColumns={ghi:"ghi",w10:"wind_10m",w80:"wind_80m",gti:"gti",solarMw:"solar_mw"};
function parseImdForecast(csv){
  const [header,...lines]=csv.replace(/^\uFEFF/,"").trim().split(/\r?\n/);
  const fields=line=>line.split(",").map(cell=>cell.trim().replace(/^"|"$/g,""));
  const names=fields(header).map(name=>name.toLowerCase());
  const time=names.indexOf("time");
  const measurements=Object.entries(imdColumns).map(([key,name])=>[key,names.indexOf(name)]).filter(([,index])=>index>=0);
  if(time<0||!measurements.length)throw new Error("Use a time column and at least one GHI or wind measurement column.");
  const data=new Map();
  for(const line of lines){
    const row=fields(line);
    const stamp=row[time]?.replace(" ","T").replace(/(T\d{2}:\d{2}):00$/,"$1");
    if(!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(stamp))continue;
    const values={};
    for(const [key,index] of measurements){
      const raw=row[index],value=Number(raw);
      if(raw&&Number.isFinite(value)&&value>=0)values[key]=value;
    }
    if(Object.keys(values).length)data.set(stamp,values);
  }
  if(!data.size)throw new Error("No usable IMD rows. Use timestamps such as 2026-11-15 16:00.");
  return data;
}
$("imd-forecast-csv").onchange=async event=>{
  const id=++imdImportId,file=event.target.files[0],coords=llOK(),status=$("imd-csv-status");
  imdSeries=undefined;
  if(results.length)show();
  document.dispatchEvent(new Event("imd-forecast-change"));
  status.textContent="";
  if(!file)return;
  try{
    if(!coords)throw new Error("Set the Weather Data coordinates before uploading this forecast.");
    const csv=await file.text();
    if(id!==imdImportId)return;
    const data=parseImdForecast(csv);
    imdSeries={coords,data};
    status.textContent=`Loaded ${data.size} IMD timestamps for ${coords.join(", ")}. The chart plots only matching timestamps.`;
    if(results.length)show();
    document.dispatchEvent(new Event("imd-forecast-change"));
  }catch(error){
    if(id!==imdImportId)return;
    status.textContent=error.message;
    event.target.value="";
  }
};
function imdValues(key,times,coords=weatherLocation?.coords){
  if(!imdSeries||!coords||imdSeries.coords.some((value,i)=>Math.abs(value-coords[i])>0.00005))return null;
  const values=times.map(time=>imdSeries.data.get(time.slice(0,16))?.[key]??null);
  return values.some(value=>value!==null)?values:null;
}

/* ===== quick estimate: capacity + location -> tentative 96-block generation ===== */
(function(){
  if (!$("qg2") || !$("qg3")) return;
  const esc=x=>String(x).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const hh=i=>String(Math.floor(i/4)).padStart(2,"0")+":"+String(i%4*15).padStart(2,"0");
  const tom=new Date(Date.now()+864e5).toISOString().slice(0,10);
  ["2","3"].forEach(k=>$("qd"+k).value=tom);
  const interp=(arr,n)=>{ // hourly (24) -> 96 blocks, linear
    const out=[];for(let i=0;i<96;i++){const x=i/4,a=Math.floor(x),b=Math.min(a+1,arr.length-1),f=x-a;const va=arr[a],vb=arr[b];out.push(va==null||vb==null?0:va+(vb-va)*f)}return out};
  const svg=(v,cap,unit,actual=new Map())=>{const W=760,H=200,pl=40,pb=22,max=Math.max(cap,...v,...actual.values(),1),bw=(W-pl)/96;
    let b="";v.forEach((x,i)=>{const h=(H-pb)*x/max;b+=`<rect x="${(pl+i*bw).toFixed(1)}" y="${(H-pb-h).toFixed(1)}" width="${(bw-0.6).toFixed(1)}" height="${h.toFixed(1)}" fill="#2563eb"><title>${hh(i)}  ${x.toFixed(2)} ${unit}</title></rect>`});
    let ax="";for(let i=0;i<=96;i+=16)ax+=`<text x="${pl+i*bw}" y="${H-6}" font-size="10" fill="#888" text-anchor="middle">${hh(Math.min(i,95))}</text>`;
    for(let k=0;k<=4;k++){const y=(H-pb)*(1-k/4);ax+=`<text x="${pl-4}" y="${y+3}" font-size="10" fill="#888" text-anchor="end">${(max*k/4).toFixed(0)}</text><line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="#8884" stroke-width="0.5"/>`}
    const points=[...actual].map(([i,mw])=>`<circle cx="${pl+(i+0.5)*bw}" cy="${(H-pb)*(1-mw/max)}" r="3" fill="#c2410c"><title>${hh(i)} Actual: ${mw.toFixed(2)} MW</title></circle>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;display:block;margin:10px 0">${ax}${b}${points}</svg>`};

  function windOutput(speed,kw,rotor,cutIn,cutOut){
    if(speed<cutIn||speed>=cutOut)return 0;
    const area=Math.PI*(rotor/2)**2;
    return Math.min(kw,0.5*1.225*area*0.33*speed**3/1000)*0.9;
  }
  const solarOutput=(irradiance,capacity,ratio)=>Math.min(capacity,capacity*irradiance/1000*ratio);
  const turbineParameters=()=>[+$("qkw3").value,+$("qrd3").value||100,+$("qci3").value||3,+$("qco3").value||25];
  $("qg2").parentElement.insertAdjacentHTML("beforebegin", `
    <div class="row" style="margin-top:10px">
      <label class="f">Solar mounting<select id="solar-mount">
        <option value="fixed">Fixed tilt</option><option value="seasonal">Seasonal tilt</option><option value="tracker">Tracker system</option>
      </select></label>
      <label class="f" id="fixed-tilt-label">Panel tilt (°)<input id="fixed-tilt" type="number" min="0" max="90" step="any" value="20"></label>
      <label class="f hide" id="summer-tilt-label">Apr–Sep tilt (°)<input id="summer-tilt" type="number" min="0" max="90" step="any" value="10"></label>
      <label class="f hide" id="winter-tilt-label">Oct–Mar tilt (°)<input id="winter-tilt" type="number" min="0" max="90" step="any" value="30"></label>
      <label class="f" id="solar-azimuth-label">Panel azimuth (°)<input id="solar-azimuth" type="number" min="-180" max="180" step="any" value="0"></label>
    </div>
    <p class="note" id="solar-mount-note">Azimuth is 0° south, −90° east, 90° west, and ±180° north.</p>`);
  $("qo2").insertAdjacentHTML("beforebegin", `
    <details class="card" style="margin-top:12px">
      <summary><strong>Compare SCADA actual generation</strong></summary>
      <p class="note">Open your plant’s SCADA portal, download actual generation as CSV, then upload it here.</p>
      <div class="row">
        <label class="f">SCADA website address<input id="scada-url" type="url" placeholder="https://your-scada-portal"></label>
        <label class="f">Upload SCADA CSV<input id="scada-file" type="file" accept=".csv,text/csv"></label>
      </div>
      <div class="tools" style="margin-top:8px"><button class="alt" type="button" id="scada-open">Open SCADA website ↗</button></div>
      <p class="note">CSV columns: date (YYYY-MM-DD), block (1–96) or time (HH:MM), and actual_mw. Use plant local time.</p>
      <p class="note" id="scada-status" role="status"></p>
    </details>`);
  const scadaUrl=$("scada-url"),scadaStatus=$("scada-status");
  const storageKey="re-grid-scada-portal";
  try{scadaUrl.value=localStorage.getItem(storageKey)||""}catch{}
  $("scada-open").onclick=()=>{
    let url;
    try{url=new URL(scadaUrl.value.trim())}catch{}
    if(!url||!["https:","http:"].includes(url.protocol)||url.username||url.password){
      scadaStatus.textContent="Enter your SCADA portal’s full web address.";
      scadaUrl.focus();
      return;
    }
    try{localStorage.setItem(storageKey,url.href)}catch{}
    scadaStatus.textContent="Download the CSV from the portal, then select it here.";
    window.open(url.href,"_blank","noopener,noreferrer");
  };
  function readScada(csv){
    const [header,...lines]=csv.replace(/^\uFEFF/,"").trim().split(/\r?\n/);
    const cells=line=>line.split(",").map(cell=>cell.trim().replace(/^"|"$/g,""));
    const names=cells(header).map(name=>name.toLowerCase().replace(/\s+/g,"_"));
    const dateCol=names.indexOf("date"),blockCol=names.indexOf("block"),timeCol=names.indexOf("time");
    const mwCol=names.indexOf("actual_mw");
    if(dateCol<0||mwCol<0||(blockCol<0&&timeCol<0))throw new Error("Use date, block or time, and actual_mw as CSV headers.");
    const days=new Map();
    let skipped=0;
    for(const line of lines){
      if(!line.trim())continue;
      const row=cells(line),date=row[dateCol],raw=row[mwCol],mw=Number(raw);
      const time=/^([01]\d|2[0-3]):(00|15|30|45)(?::00)?$/.exec(row[timeCol]||"");
      const block=blockCol>=0?Number(row[blockCol]):time?Number(time[1])*4+Number(time[2])/15+1:0;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!raw||!Number.isFinite(mw)||mw<0||!Number.isInteger(block)||block<1||block>96){
        skipped++;
        continue;
      }
      if(!days.has(date))days.set(date,new Map());
      days.get(date).set(block-1,mw);
    }
    if(!days.size)throw new Error("The CSV has no valid generation rows.");
    return {days,skipped};
  }
  let scada,solarEstimate,solarChart,uploadId=0;
  function renderScada(){
    const canvas=$("solar-generation-plot");
    if(canvas&&solarEstimate){
      const {day,cap,pr,mounting,coords,models}=solarEstimate;
      const labels=Array.from({length:96},(_,i)=>hh(i));
      const timestamps=labels.map(time=>day+"T"+time);
      const imdMw=imdValues("solarMw",timestamps,coords);
      const imdGti=imdValues("gti",timestamps,coords)||
        (Number(mounting.tilt)===0?imdValues("ghi",timestamps,coords):null);
      const imd=imdMw||imdGti?.map(value=>value==null?null:solarOutput(value,cap,pr));
      const datasets=models.map(({name,mw},i)=>({label:name,data:mw,borderColor:COLORS[i],
        borderWidth:2,pointRadius:0}));
      if(imd)datasets.push({label:"IMD forecast",data:imd,borderColor:"#7c3aed",borderDash:[6,4],pointRadius:2,spanGaps:true});
      const actual=scada?.days.get(day);
      if(actual)datasets.push({label:"SCADA actual",data:labels.map((_,i)=>actual.get(i)??null),
        borderColor:"#c2410c",backgroundColor:"#c2410c",pointRadius:3,showLine:false});
      $("solar-imd-series-status").textContent=imd?"":"For an IMD line, upload matching solar_mw or panel-plane gti values in Weather Data. A screenshot provides the interpretation above.";
      if(typeof Chart!=="undefined"){
        solarChart?.destroy();
        solarChart=new Chart(canvas,{type:"line",data:{labels,datasets},options:{
          maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
          scales:{x:{ticks:{maxTicksLimit:9},title:{display:true,text:"Plant local time"}},
            y:{beginAtZero:true,title:{display:true,text:"Generation (MW)"}}}
        }});
      }
    }
    if(!scada)return;
    const day=solarEstimate?.day||$("qd2").value;
    const count=scada.days.get(day)?.size||0;
    scadaStatus.textContent=(count?`${count} actual blocks loaded for ${day}.`:`No actual readings in this CSV for ${day}.`)+
      (scada.skipped?` Skipped ${scada.skipped} invalid rows.`:"");
  }
  document.addEventListener("imd-forecast-change",renderScada);
  $("qd2").addEventListener("change",()=>{
    solarChart?.destroy();
    solarChart=undefined;
    solarEstimate=null;
    $("qo2").innerHTML="";
    renderScada();
  });
  $("scada-file").onchange=async ()=>{
    const request=++uploadId;
    const file=$("scada-file").files[0];
    scada=null;
    scadaStatus.textContent="";
    renderScada();
    if(!file)return;
    try{
      const csv=await file.text();
      if(request!==uploadId)return;
      scada=readScada(csv);
      renderScada();
    }catch(error){if(request===uploadId)scadaStatus.textContent=error.message}
  };
  $("solar-mount").onchange=()=>{
    const mode=$("solar-mount").value;
    $("fixed-tilt-label").classList.toggle("hide",mode!=="fixed");
    for(const season of ["summer","winter"])$(season+"-tilt-label").classList.toggle("hide",mode!=="seasonal");
    $("solar-azimuth-label").classList.toggle("hide",mode==="tracker");
    $("solar-mount-note").textContent=mode==="tracker"
      ?"The estimate uses ideal dual-axis tracking."
      :"Azimuth is 0° south, −90° east, 90° west, and ±180° north.";
  };
  function solarMount(day){
    const mode=$("solar-mount").value;
    if(mode==="tracker")return {tilt:"nan",azimuth:"nan",label:"Ideal dual-axis tracker"};
    const month=Number(day.slice(5,7));
    const tiltField=mode==="fixed"?"fixed-tilt":month>=4&&month<=9?"summer-tilt":"winter-tilt";
    const tilt=$(tiltField),azimuth=$("solar-azimuth");
    if(!tilt.value||!tilt.validity.valid||!azimuth.value||!azimuth.validity.valid){
      throw new Error("Enter a tilt from 0° to 90° and azimuth from −180° to 180°.");
    }
    return {tilt:tilt.value,azimuth:azimuth.value,
      label:`${mode==="fixed"?"Fixed tilt":"Seasonal tilt"} ${tilt.value}°, azimuth ${azimuth.value}°`};
  }
  $("qg3").parentElement.insertAdjacentHTML("beforebegin",
    '<details id="wind-curve-details" class="card" style="margin-top:10px;padding:8px 12px"><summary style="font-weight:600">Turbine power curve</summary><p id="curve-note3" class="note"></p><div style="height:150px;max-width:520px" id="curve-box3" class="hide"><canvas id="curve3" role="img" aria-label="Estimated power versus wind speed"></canvas></div></details>');
  const windCurveDetails=$("wind-curve-details");
  let windCurve;
  function drawWindCurve(){
    if(!windCurveDetails.open)return;
    const params=turbineParameters();
    const valid=params[0]>0&&params[3]>params[2];
    $("curve-box3").classList.toggle("hide",!valid||typeof Chart==="undefined");
    $("curve-note3").textContent=valid
      ?"Estimated output per turbine, including the estimator’s 10% loss assumption."
      :"Enter a positive turbine rating and a cut-out speed above cut-in.";
    windCurve?.destroy();
    windCurve=undefined;
    if(!valid||typeof Chart==="undefined")return;
    const limit=Math.max(30,params[3]+2);
    const xs=Array.from({length:61},(_,i)=>i*limit/60);
    xs.push(params[2],Math.max(0,params[3]-0.001),params[3]);
    xs.sort((a,b)=>a-b);
    const data=xs.map(x=>({x,y:windOutput(x,...params)/1000}));
    windCurve=new Chart($("curve3"),{type:"line",data:{datasets:[{data,borderColor:COLORS[0],pointRadius:0}]},
      options:{maintainAspectRatio:false,animation:false,interaction:{mode:"nearest",axis:"x",intersect:false},
        plugins:{legend:{display:false},tooltip:{callbacks:{
          title:([item])=>`${item.parsed.x.toFixed(2)} m/s`,
          label:item=>`${item.parsed.y.toFixed(3)} MW per turbine`
        }}},scales:{
        x:{type:"linear",title:{display:true,text:"Wind speed (m/s)"}},
        y:{beginAtZero:true,title:{display:true,text:"Power (MW)"}}
      }}});
  }
  const TURB=[ // name, rated kW, rotor m, cut-in, cut-out, optional hub m (editable defaults)
   ["Suzlon S97 - 2.1 MW",2100,97,3,25],["Suzlon S120 - 2.1 MW",2100,120,3,25],["Suzlon S144 - 3.15 MW",3150,144,3,25],
   ["Vestas V120 - 2.2 MW",2200,120,3,22],["Vestas V150 - 4.2 MW",4200,150,3,22.5],
   ["Siemens Gamesa SG 2.1-114",2100,114,3,25],["Siemens Gamesa SG 3.4-132",3400,132,3,25],
   ["GE 1.5 sle - 1.5 MW",1500,77,3.5,25],["GE 2.5-120 - 2.5 MW",2500,120,3,25],
   ["Envision EN-131 - 2.3 MW",2300,131,3,25],["Inox 2 MW (113 m rotor)",2000,113,3,25],
   // Adani model ratings, rotor diameters and hub heights are from MNRE ALMM Wind.
   // Cut-in and cut-out use the estimator's generic defaults.
   ["Adani MWL-160 – 5.2 MW",5200,160,3,25,120],
   ["Adani WD164-3300 – 3.3 MW",3300,163.95,3,25,139.73],
   ["Generic 2 MW",2000,100,3,25],["Generic 3 MW",3000,130,3,25],["Generic 4 MW",4000,150,3,25],["Custom (type the details below)",2500,120,3,25]];
  $("qm_t3").innerHTML=TURB.map((t,i)=>`<option value="${i}">${t[0]}</option>`).join("");
  const hubInput=$("qh3");
  const defaultHubHeight=hubInput.value;
  const machineDetails=$("qkw3").closest("details");
  const hubLabel=hubInput.closest("label");
  hubLabel.style.flex="";
  hubInput.step="any";
  const machineRow=$("qco3").closest(".row");
  machineRow.appendChild(hubLabel);
  Object.assign(machineRow.style,{display:"grid",gridTemplateColumns:"repeat(5, minmax(94px, 1fr))",
    gap:"8px",overflowX:"auto",padding:"2px 2px 5px",maxWidth:"680px"});
  const labels=["Rated power (kW)","Rotor dia. (m)","Cut-in (m/s)","Cut-out (m/s)","Hub height (m)"];
  Array.from(machineRow.querySelectorAll("label")).forEach((label,i)=>{
    label.firstChild.textContent=labels[i];
    label.querySelector("input").style.width="100%";
  });
  const hubNote=document.createElement("p");
  hubNote.className="note";
  machineRow.after(hubNote);
  function fillT(){
    const [,rated,rotor,cutIn,cutOut,hubHeight]=TURB[+$("qm_t3").value];
    $("qkw3").value=rated;
    $("qrd3").value=rotor;
    $("qci3").value=cutIn;
    $("qco3").value=cutOut;
    hubInput.value=hubHeight??defaultHubHeight;
    hubNote.textContent=hubHeight
      ? "Hub height is the preset tower height. Edit it for your installation."
      : "Hub height uses the app’s 90 m default. Edit it to match your installation.";
    capNote();
    drawWindCurve();
  }
  const capNote=()=>{const mw=(+$("qn3").value||0)*(+$("qkw3").value||0)/1000;$("qcap3").textContent=mw>0?`Plant capacity: ${mw.toLocaleString("en-IN",{maximumFractionDigits:1})} MW`:""};
  $("qm_t3").onchange=()=>{fillT();machineDetails.open=true};["qn3","qkw3"].forEach(i=>$(i).addEventListener("input",capNote));fillT();
  for(const id of ["qkw3","qrd3","qci3","qco3"])$(id).addEventListener("input",()=>drawWindCurve());
  windCurveDetails.addEventListener("toggle",()=>drawWindCurve());
  $("qy3").value=$("cty").value;$("cty").addEventListener("input",()=>{if(!$("qy3").dataset.t)$("qy3").value=$("cty").value});$("qy3").addEventListener("input",()=>{$("qy3").dataset.t=1});
  const transferredLocations={};
  for(const [k,button] of [["2","wxs"],["3","wxw"]]){
    const locationInput=$("ql"+k);
    const fields=[locationInput.closest("label"),...(k==="3"?[$("qy3").closest("label")]:[])];
    locationInput.closest(".row").insertAdjacentHTML("afterend", `<p id="weather-location-${k}" class="note" hidden><span></span> <button type="button" class="alt">Change location</button></p>`);
    const note=$("weather-location-"+k);
    $(button)?.addEventListener("click",()=>{
      if(!results.length||!weatherLocation)return;
      transferredLocations[k]=weatherLocation;
      for(const field of fields)field.classList.add("hide");
      note.querySelector("span").textContent="Using Weather Data location · "+weatherLocation.name;
      note.hidden=false;
    });
    note.querySelector("button").onclick=()=>{
      delete transferredLocations[k];
      for(const field of fields)field.classList.remove("hide");
      note.hidden=true;
      locationInput.focus();
    };
  }
  async function place(k){
    const transfer=transferredLocations[k];
    if(transfer)return {lat:transfer.coords[0],lon:transfer.coords[1],name:transfer.name};
    const t=$("ql"+k).value.trim();
    if(t){const q=await geocode(t,k==="3"?$("qy3").value.trim():"");if(!q)throw new Error(`Could not find "${t}". Check the spelling or add the country, e.g. "Khavda, India".`);return {lat:q.latitude,lon:q.longitude,name:`${q.name}${q.admin1?", "+q.admin1:""}, ${q.country}`}}
    const c=llOK();if(!c)throw new Error("Enter a location here, or set one in the Weather data tab.");
    return {lat:c[0],lon:c[1],name:`${c[0].toFixed(3)}, ${c[1].toFixed(3)}`};
  }
  async function go(k){
    const m=$("qm"+k),o=$("qo"+k),day=$("qd"+k).value;
    const kw=+$("qkw3").value,cap=k==="3"?(+$("qn3").value||0)*kw/1000:+$("qc"+k).value;
    if(k==="2"){solarChart?.destroy();solarChart=undefined;solarEstimate=null}
    m.className="note";o.innerHTML="";
    if(!(cap>0)){m.className="note err";return m.textContent=k==="3"?"Enter the number of turbines.":"Enter the plant capacity in MW."}
    if(!day){m.className="note err";return m.textContent="Pick a day."}
    m.textContent="Getting the weather forecast…";
    try{
      const pl=await place(k),wind=k==="3",hub=wind?(+$("qh3").value||90):0,pr=wind?0:(+$("qp2").value||0.8);
      const mounting=wind?null:solarMount(day);
      const url=wind
       ?`https://api.open-meteo.com/v1/forecast?latitude=${pl.lat}&longitude=${pl.lon}&hourly=wind_speed_80m,wind_speed_120m&wind_speed_unit=ms&timezone=auto&start_date=${day}&end_date=${day}`
       :`https://api.open-meteo.com/v1/forecast?latitude=${pl.lat}&longitude=${pl.lon}&minutely_15=global_tilted_irradiance&tilt=${mounting.tilt}&azimuth=${mounting.azimuth}&timezone=auto&start_date=${day}&end_date=${day}`;
      let mw,ws=null,solarModels=[],failedModels=[];
      if(wind){
        const j=await (await fetch(url)).json();
        if(j.error)throw new Error(j.reason||"The weather service refused this date.");
        const h=j.hourly;if(!h||!h.wind_speed_80m)throw new Error("No wind data for this place and day.");
        const v80=interp(h.wind_speed_80m),v120=interp(h.wind_speed_120m||h.wind_speed_80m);
        ws=v80.map((a,i)=>{let al=a>0.3&&v120[i]>0?Math.log(v120[i]/a)/Math.log(120/80):0.14;al=Math.min(0.6,Math.max(0,al));return a*Math.pow(hub/80,al)});
        const params=turbineParameters();
        mw=ws.map(v=>Math.min(cap,windOutput(v,...params)*(+$("qn3").value||0)/1000));
      }else{
        const indices=picked();
        if(!indices.length)throw new Error("Select at least one model in Weather Data.");
        const selections=indices.map(i=>MODELS[i]);
        const forecasts=await Promise.allSettled(selections.map(async ([name,id])=>{
          const response=await fetch(url+"&models="+encodeURIComponent(id));
          const j=await response.json(),irradiance=j.minutely_15?.global_tilted_irradiance;
          if(j.error||irradiance?.length!==96||!irradiance.every(Number.isFinite)){
            throw new Error("Incomplete tilted irradiance data");
          }
          return {name,mw:irradiance.map(value=>solarOutput(Math.max(0,value),cap,pr))};
        }));
        forecasts.forEach((result,i)=>{
          if(result.status==="fulfilled")solarModels.push(result.value);
          else failedModels.push(selections[i][0]);
        });
        if(!solarModels.length)throw new Error("No selected model returned 96 tilted irradiance blocks. Try another model or date.");
        mw=solarModels[0].mw;
      }
      const mwh=mw.map(x=>x*0.25),tot=mwh.reduce((a,b)=>a+b,0),pk=Math.max(...mw),cuf=100*tot/(cap*24);
      m.textContent=failedModels.length?"No complete tilted irradiance forecast from: "+failedModels.join(", "):"";
      const rows=mw.map((x,i)=>`<tr><td>${i+1}</td><td>${hh(i)}</td>${wind?`<td>${ws[i].toFixed(1)}</td>`:""}<td>${x.toFixed(2)}</td><td>${(x*0.25).toFixed(3)}</td></tr>`).join("");
      o.innerHTML=`<div class="sum" style="margin-top:12px"><div><b>${tot.toLocaleString("en-IN",{maximumFractionDigits:0})} MWh</b><br><span class="note">tentative generation for ${day}</span></div><div><b>${pk.toFixed(1)} MW</b><br><span class="note">peak</span></div><div><b>${cuf.toFixed(1)} %</b><br><span class="note">capacity factor</span></div></div>
       <p class="note" style="margin:6px 0 0">${esc(pl.name)} · ${wind?`${esc(TURB[+$("qm_t3").value][0])} × ${+$("qn3").value} = ${cap.toFixed(1)} MW, wind at ${hub} m hub height`:`${mounting.label}, performance ratio ${pr}`} · MW per 15-minute block<span data-imd-result hidden></span></p>${wind?"":'<h2 style="font-size:16px;margin:12px 0 0">Solar generation by 15-minute block (MW)</h2>'}${wind?svg(mw,cap,"MW"):`<div style="position:relative;height:260px"><canvas id="solar-generation-plot" role="img" aria-label="Solar generation by forecast model"></canvas></div><p class="note">Summary, table and CSV use ${esc(solarModels[0].name)}.</p><p class="note" id="solar-imd-series-status"></p>`}
       <div class="tools"><button class="alt" id="qcsv${k}">Download CSV</button></div>
       <details><summary>Show all 96 blocks</summary><div class="scroll"><table><thead><tr><th>Block</th><th>Time</th>${wind?`<th>Wind at ${hub} m (m/s)</th>`:""}<th>MW</th><th>MWh</th></tr></thead><tbody>${rows}</tbody></table></div></details>
       <p class="note" style="margin-top:8px">${wind?"Estimated from the forecast wind speed with the power curve of the chosen turbine (calculated from its rated power and rotor size) and 10% losses. The wind speed is adjusted from the model heights (80 m and 120 m) to your hub height.":"Estimated using irradiance on the panels, plant capacity and performance ratio, capped at plant capacity."} It is a tentative figure from the weather forecast only. For a better result use the advanced section with your own past data.</p>`;
      if(!wind){
        solarEstimate={day,cap,pr,mounting,coords:[pl.lat,pl.lon],models:solarModels};
        renderScada();
      }
      updateMeteogramResults();
      $("qcsv"+k).onclick=()=>{const csv="block,time,"+(wind?"wind_ms,":"")+"mw,mwh\n"+mw.map((x,i)=>`${i+1},${hh(i)},${wind?ws[i].toFixed(2)+",":""}${x.toFixed(3)},${(x*0.25).toFixed(4)}`).join("\n");
        const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=(wind?"wind":"solar")+"-tentative-"+day+".csv";a.click()};
    }catch(e){m.className="note err";m.textContent=e.message&&!/fetch/i.test(e.message)?e.message:"Could not reach the weather service. Check your internet connection."}
  }
  $("qg2").onclick=()=>go("2");$("qg3").onclick=()=>go("3");
})();
const fmtUTC=t=>new Date(t*1000).toISOString().slice(0,16).replace("T"," ")+" UTC";
async function showUpdates(ids){
  $("upd").innerHTML="<b>Model update information</b> (a model run is one fresh forecast from the weather service)…";
  const rows=await Promise.all(ids.map(async id=>{
    const m=MODELS.find(x=>x[1]===id),i=INFO[id];let run="";
    if(i[2]){try{
      const j=await (await fetch(`https://api.open-meteo.com/data/${i[2]}/static/meta.json`)).json();
      const a=j.last_run_initialisation_time,v=j.last_run_availability_time;
      if(a)run=`latest run started ${fmtUTC(a)}`+(v?`, available at ${new Date(v*1000).toLocaleString([],{dateStyle:"medium",timeStyle:"short"})} your time`:"");
    }catch(e){}}
    return `<div>• <b>${m[0]}</b>: ${run||"latest run time not available"} · refreshes every ${i[0]} · forecasts ${i[1]} ahead</div>`;
  }));
  $("upd").innerHTML="<b>Model update information</b> (a model run is one fresh forecast from the weather service)"+rows.join("");
}
$("go").onclick=async()=>{
  const d=$("dt").value,d2=$("dt2").value||d,sel=picked();
  if(sel.length<1)return msg("Select at least one model.",true);
  if(!d)return msg("Choose a start date.",true);
  if(d2<d)return msg("The end date is before the start date.",true);
  if((new Date(d2)-new Date(d))/864e5>92)return msg("Please choose a range of 93 days or less.",true);
  $("go").disabled=true;
  try{
    let c=llOK();
    if(!c){
      const p=await fillCoords();
      if(!p){msg($("loc").value.trim()?$("geost").textContent:"Enter a location, or latitude and longitude.",true);return}
      c=llOK();
    }else if(!$("loc").value.trim())await fillName();
    const p={latitude:c[0],longitude:c[1]};
    const fetchedLabel=`${$("loc").value.trim()||"Custom point"}${$("cty").value.trim()?", "+$("cty").value.trim():""} (${c[0].toFixed(2)}, ${c[1].toFixed(2)})`;
    msg("Fetching model data…");
    const settled=await Promise.allSettled(sel.map(i=>getModel(MODELS[i],p,d,d2)));
    results=[];const fails=[];
    settled.forEach((s,k)=>s.status==="fulfilled"?results.push(s.value):fails.push(MODELS[sel[k]][0]));
    if(!results.length){msg("No model returned data for this place and date. Try other models (each covers certain regions) or a nearer date.",true);return}
    msg(fails.length?`No data from: ${fails.join(", ")}. These models may not cover this place or date.`:"",!!fails.length);
    label=fetchedLabel;
    weatherLocation={coords:c,name:label};
    const transferModel = $("wxm");
    if (transferModel) transferModel.innerHTML = results.map(r => `<option>${r.name}</option>`).join("");
    show();showUpdates(results.map(r=>r.id));
  }catch(e){msg("Something went wrong: "+e.message+". Check your internet connection.",true)}
  finally{$("go").disabled=false}
};

function unit(){return $("metric").value==="ghi"?"W/m²":"m/s"}
function show(){
  const key=$("metric").value,base=results[0].time,multi=base.length>96;
  $("out").classList.remove("hide");$("tbl").classList.remove("hide");
  $("place").textContent=label+" · "+base[0].slice(0,10)+(multi?" to "+base[base.length-1].slice(0,10):"");
  if(!$("weather-imd-summary")){
    $("place").insertAdjacentHTML("afterend", '<span id="weather-imd-summary" data-imd-result class="note" hidden></span>');
  }
  updateMeteogramResults();
  const imd=imdValues(key,base);
  const datasets=results.map((r,i)=>({label:r.name,data:r[key],borderColor:COLORS[i],backgroundColor:COLORS[i],borderWidth:2,pointRadius:0,tension:.2,spanGaps:true}));
  if(imd)datasets.push({label:"IMD forecast",data:imd,borderColor:"#7c3aed",borderDash:[6,4],pointRadius:2,spanGaps:true});
  if(chart)chart.destroy();
  chart=new Chart($("chart"),{type:"line",
    data:{labels:base.map(t=>multi?t.slice(5,16).replace("T"," "):t.slice(11,16)),datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
      scales:{y:{title:{display:true,text:unit()},beginAtZero:true},x:{title:{display:true,text:"Time (local) · 96 blocks of 15 min"},ticks:{maxTicksLimit:13}}}}});
  $("th").innerHTML="<tr><th>Block</th><th>Time</th>"+results.map(r=>`<th>${r.name} (${unit()})</th>`).join("")+(imd?`<th>IMD forecast (${unit()})</th>`:"")+"</tr>";
  $("tb").innerHTML=base.map((t,i)=>{
    const end=new Date(new Date(t).getTime()+15*60000);
    const e=String(end.getHours()).padStart(2,"0")+":"+String(end.getMinutes()).padStart(2,"0");
    return `<tr><td>${blk(t)}</td><td>${multi?t.slice(0,10)+" ":""}${t.slice(11,16)}–${e}</td>`+results.map(r=>`<td>${r[key][i]==null?"–":r[key][i]}</td>`).join("")+(imd?`<td>${imd[i]??"–"}</td>`:"")+"</tr>";
  }).join("");
}
$("metric").onchange=()=>results.length&&show();

$("csv").onclick=()=>{
  const heads=["Block","Time"];
  const cols=[["ghi","Solar W/m2"],["w10","Wind10m m/s"],["w80","Wind80m m/s"]];
  results.forEach(r=>cols.forEach(c=>heads.push(`${r.name} ${c[1]}`)));
  const rows=results[0].time.map((t,i)=>[blk(t),t.replace("T"," "),...results.flatMap(r=>cols.map(c=>r[c[0]][i]??""))]);
  const csv=[heads,...rows].map(r=>r.join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download="solar_wind_96_blocks.csv";a.click();
};

function blk(t){return +t.slice(11,13)*4+(+t.slice(14,16))/15+1}
