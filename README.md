# Solar, wind and DSM tools (Khavda)

One web page (`index.html`) with eight tabs:
1. Weather data (Open-Meteo, 96 blocks, compare models, date ranges)
2. Solar forecast correction
3. Wind forecast correction
4. DSM calculator (uploaded earlier calculator)
5. QCA DSM engine (96 blocks): bands, payable and receivable, SPVs, price per block, day/week/month/quarter
6. NRPC & WRPC data (Khavda): extract and convert NRPC Excel and WRPC ZIP/CSV data
7. ISTS pooling stations map: CTUIL pooling stations of 400 kV and above (status as on 31-Oct-2026), with existing and planned lines and spare capacity
8. India RE plants map: 341 wind and solar plants (70,287 MW) in the NR, WR and SR regions, by state, district and type, with the average 96-block generation of each region
9. QCA performance comparison: compare 2 to 6 QCA schedules for one plant against the same actual generation and band rule — DSM cost in paise per unit, net DSM, payable and receivable, bias, under- and over-injection blocks by band, scheduling tendency, conclusion, Excel and PDF

## The workflow (one connected app)
1. **Plant region**: tab 6 suggests NRPC or WRPC from the plant location (by state).
2. **NRPC / WRPC data**: extract the plant's data, then **Send to QCA DSM engine** (choose which columns are schedule, actual, AvC and price).
3. **QCA DSM engine**: set plant type (solar / wind / hybrid), location, capacity, bands and PPA; calculate payable and receivable.
4. **Deviation analysis & RCA** (sub-tab): where and when limits were crossed (heat map), plant performance, areas of improvement, likely root causes with suggested actions, and what a simple bias correction would have saved.
5. **Model comparison** (sub-tab): Open-Meteo models are fetched for the plant location and ranked against actual output and against your schedule, with the DSM effect of scheduling from each.

Everything is calculated in your own browser. Uploaded files are never sent to a server.
Saved runs and SPV settings stay in that browser only.

## QCA performance comparison (tab 9)
- **Actual generation**: the data loaded in the QCA DSM engine (for example from the NRPC / WRPC / SRPC import), or an uploaded file with date, block or time and actual MW (AvC and price optional).
- **QCA schedules**: one CSV or Excel file per QCA with date, block or time and schedule MW (pick the column if the guess is wrong), or the schedule already loaded in the engine.
- Only the dates and blocks that the actual data and every QCA cover are compared. Each QCA runs through the same DSM engine (`dCompute`) with the plant's own bands or the RPC published bands.
- DSM cost per unit = (payable incl. DSM penalty − receivable) ÷ actual generation. Negative = net gain.
- Each block is counted once, in the highest band its deviation reached. Night or no-generation blocks (no schedule, no output) are counted separately and left out of the scheduling tendency: over-schedules when 55% or more of deviating blocks are under-injection, under-schedules when 45% or fewer.

## Open it
* Online: the GitHub Pages address of this repository (see below).
* On a computer: download this folder and double-click `index.html` (Chrome or Edge).

## Publish with GitHub Pages
1. Repository -> Settings -> Pages.
2. Source: "Deploy from a branch". Branch: `main`, folder: `/ (root)`. Save.
3. After a minute the address appears: `https://<your-username>.github.io/<repository-name>/`

Note: GitHub Pages on a free account needs a public repository. Your own uploads are never stored in the page,
but tabs 7 and 8 carry built-in reference data (plant names, developers, capacities, pooling stations),
so anyone with the link can see that data.

## Tests
`node tests/khavda-tests.js` (needs only Node.js). See the comments at the top of that file.

## Data files (`data/`)
The data built into tabs 7 and 8, as separate files:
* `india_plants.csv`: every plant with state, district, site, developer, type, own capacity and reporting group
* `india_capacity.csv`: capacity per reporting unit (QCA pools counted once)
* `india_regions.csv`: which RLDC file and week each region comes from
* `india_profile.csv`: average generation per 15-minute block, per region
* `re_map.json`: India state outlines (svg-maps/india, CC BY 4.0, simplified)
* `ists-pooling-stations.html`: the pooling stations map on its own

## Mobile and laptop views

The site opens Mobile Lite on narrow touch screens. Mobile Lite includes
weather lookup, model comparison, charts and CSV export. Open the full
dashboard for NRPC/WRPC imports, DSM, forecast correction and maps.

- Mobile Lite: `mobile.html`
- Full dashboard: `index.html?view=full`

Both pages use the same static hosting setup and share the weather code.

## Deploy three separate Render websites

Run `node scripts/build-sites.cjs` from the repository root to generate:

| Website | Publish directory | Tools |
| --- | --- | --- |
| Weather & Forecasting | `dist/forecast` | Weather, solar and wind correction, Mobile Lite |
| Grid Maps | `dist/maps` | ISTS pooling stations and India renewable plants |
| DSM & Data Processing | `dist/dsm` | DSM calculator, QCA analysis, NRPC/WRPC imports |

On Render, choose **New → Blueprint** and select this repository once the
changes are on your deploy branch. Render reads `render.yaml` and creates
the three Static Sites. You can also create them individually with the same
build command and the corresponding publish directory above.

Navigation defaults to `https://re-grid-forecast.onrender.com`,
`https://re-grid-maps.onrender.com` and `https://re-grid-dsm.onrender.com`.
If Render assigns different URLs, set `RE_GRID_FORECAST_URL`,
`RE_GRID_MAPS_URL` and `RE_GRID_DSM_URL` to the actual addresses on each
service and redeploy.

The existing combined dashboard still works when published from the
repository root. Export any saved DSM runs you need from that dashboard
before switching to the new DSM URL. Browser storage is tied to each URL's
origin.
