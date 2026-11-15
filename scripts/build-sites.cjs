const {readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync} = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = name => readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const weather = read("weather.js");

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error("Missing source section: " + start);
  return source.slice(from, to);
}

const sites = [
  {id:"forecast", title:"Weather & Forecasting", tabs:[1,2,3], url:"https://re-grid-forecast.onrender.com"},
  {id:"maps", title:"Grid Maps", tabs:[7,8], url:"https://re-grid-maps.onrender.com"},
  {id:"dsm", title:"DSM & Data Processing", tabs:[4,5,6], url:"https://re-grid-dsm.onrender.com"},
];
const tabMarkup = between(html, '<div class="tabs"><button id="t1"', '<div id="steps"');
const workflow = between(html, '<div id="steps"', '<div id="p1">');
const forecast = between(html, '<div id="p1">', '<div id="p7"');
const maps = between(html, '<div id="p7"', '<div id="p4"');
const dsm = between(html, '<div id="p4"', '\n</div>\n<div id="tipbox"');
const shared = between(html, '// ===== Shared helpers:', '// ===== Weather data -> forecast tabs');
const sharedDsm = shared.slice(0, shared.indexOf("function diffChart"));
const chartAndExcel = between(html, '<script src="vendor/chart', '<style>');
const chart = chartAndExcel.slice(0, chartAndExcel.indexOf('<script src="vendor/xlsx'));
const head = between(html, '<style>', '<link rel="stylesheet" href="task-home.css">');
const prelude = between(html, 'const dl=', '["1","2","3","4","5","6","7","8"].forEach');
const baseWeather = between(weather, '// name, Open-Meteo', 'let results=') +
  between(weather, 'async function geocode', 'function llOK');
const dsmTime = between(html, 'const hhmm=', '\n\nfunction sample');
const inline = code => '<script>\n' + code + '\n</script>\n';
const escape = text => text.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

function siteUrl(site) {
  const url = new URL(process.env["RE_GRID_" + site.id.toUpperCase() + "_URL"] || site.url);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid site URL: " + url);
  return escape(url.href);
}

for (const site of sites) {
  const out = path.join(root, "dist", site.id);
  rmSync(out, {recursive:true, force:true});
  mkdirSync(out, {recursive:true});
  const tabs = tabMarkup.replace(/<button id="t([1-8])"[^>]*>.*?<\/button>/g,
    (button, id) => site.tabs.includes(Number(id)) ? button : "");
  const nav = sites.map(other => other === site
    ? '<strong aria-current="page">' + escape(other.title) + '</strong>'
    : '<a href="' + siteUrl(other) + '">' + escape(other.title) + '</a>').join("");
  const tabCode = inline(`
const siteTabs = ${JSON.stringify(site.tabs)};
for (const id of siteTabs) {
  document.getElementById("t" + id).addEventListener("click", () => {
    for (const other of siteTabs) {
      document.getElementById("p" + other).classList.toggle("hide", other !== id);
      const tab = document.getElementById("t" + other);
      tab.classList.toggle("on", other === id);
      tab.setAttribute("aria-pressed", String(other === id));
    }
  });
}
`);
  let panels, scripts, libraries, assets;
  if (site.id === "forecast") {
    panels = forecast;
    libraries = chart;
    assets = ["vendor/chart.umd.min.js","weather.js","mobile.html","task-home.css"];
    scripts = '<script src="weather.js"></script>\n' + inline(prelude +
      between(html, '// ===== Forecast correction', '// ===== DSM calculator'));
  } else if (site.id === "maps") {
    panels = maps;
    libraries = "";
    assets = [];
    scripts = between(html, '<script type="text/plain" id="re_d_plants">', '<script src="task-picker.js" defer>');
  } else {
    panels = workflow + dsm;
    libraries = chartAndExcel;
    assets = ["vendor/chart.umd.min.js","vendor/xlsx.full.min.js","samples/nrpc-sample.xlsx","samples/wrpc-sample.zip"];
    scripts = inline(baseWeather + prelude + dsmTime + "\n" + sharedDsm +
      between(html, '// ===== DSM calculator', '</script>\n<script>/* JSZip')) +
      between(html, '<script>/* JSZip', '<script type="text/plain" id="re_d_plants">');
  }
  for (const asset of assets) {
    const dest = path.join(out, asset);
    mkdirSync(path.dirname(dest), {recursive:true});
    copyFileSync(path.join(root, asset), dest);
  }
  if (site.id === "forecast") {
    const mobile = read("mobile.html")
      .replace('<script src="task-picker.js" defer></script>', '')
      .replace('href="mobile.html"', 'href="index.html"')
      .replace('← All tools', '← All forecasting tools');
    writeFileSync(path.join(out, "mobile.html"), mobile);
  }
  const query = {weather:1,solar:2,wind:3,dsm:4,qca:5,imports:6,ists:7,plants:8};
  const start = inline(`
const requestedTab = ${JSON.stringify(query)}[new URLSearchParams(location.search).get("task")];
document.getElementById("t" + (siteTabs.includes(requestedTab) ? requestedTab : siteTabs[0])).click();
`);
  const mobileLink = site.id === "forecast" ? '<a href="mobile.html">Mobile Lite</a>' : "";
  const siteTabsMarkup = tabs.replace(/<button id="t([1-8])"[^>]*>/g, (_, id) =>
    '<button id="t' + id + '" aria-pressed="' + (Number(id) === site.tabs[0]) + '"' +
    (Number(id) === site.tabs[0] ? ' class="on"' : '') + '>');
  writeFileSync(path.join(out, "index.html"), `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(site.title)} · RE Grid Insight</title>
${libraries}${head}
<style>
.site-nav{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 24px;padding:12px;background:var(--card);border:1px solid var(--line);border-radius:8px}
.site-nav a{color:var(--accent)} .site-title{margin-bottom:14px}
</style></head>
<body><main class="wrap">
<nav class="site-nav" aria-label="RE Grid Insight sites">${nav}${mobileLink}</nav>
<h1 class="site-title">${escape(site.title)}</h1>
${siteTabsMarkup}${panels}</main>
<div id="tipbox"></div>
${tabCode}${scripts}${start}
</body></html>`);
  console.log("Built dist/" + site.id);
}
