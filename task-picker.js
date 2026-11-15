(() => {
  const groups = [
    ["Forecasting", [
      ["weather", "t1", "Weather forecasts", "Compare 15-minute solar and wind data"],
      ["solar", "t2", "Solar forecast correction", "Adjust forecasts using plant data"],
      ["wind", "t3", "Wind forecast correction", "Adjust forecasts using plant data"],
    ]],
    ["DSM & data imports", [
      ["dsm", "t4", "DSM calculator", "Check settlement for a time block"],
      ["qca", "t5", "QCA DSM & analysis", "Calculate and review deviations"],
      ["imports", "t6", "NRPC & WRPC imports", "Extract and prepare regional data"],
    ]],
    ["Maps", [
      ["ists", "t7", "ISTS pooling stations", "Explore grid connection points"],
      ["plants", "t8", "India renewable plants", "Browse solar and wind capacity"],
    ]],
  ];
  const mobile = document.body.hasAttribute("data-mobile-lite");
  const task = new URLSearchParams(location.search).get("task");
  const tool = groups.flatMap(([, tools]) => tools).find(([key]) => key === task);
  if (tool) {
    if (!mobile) document.getElementById(tool[1]).click();
    if (!mobile || task === "weather") return;
    location.replace("index.html?view=full&task=" + encodeURIComponent(task));
    return;
  }

  const home = document.getElementById("task-home");
  const profile = [28, 39, 53, 68, 76, 63, 46, 29]
    .map(height => `<span style="--bar-height:${height}px"></span>`).join("");
  const sections = groups.map(([title, tools]) => `
    <section class="task-group">
      <h2>${title}</h2>
      <div class="task-grid">
        ${tools.map(([key, , name, description]) => {
          const local = mobile && key === "weather";
          const href = (local ? "mobile.html?task=" : "index.html?view=full&task=") + key;
          return `<a class="task-card" href="${href}">
            <strong>${name}</strong>
            <span>${description}</span>
            <span class="task-arrow" aria-hidden="true">${mobile && !local ? "↗" : "→"}</span>
          </a>`;
        }).join("")}
      </div>
    </section>`).join("");

  home.innerHTML = `
    <header class="task-header">
      <div class="task-shell">
        <strong>RE Grid Insight</strong>
        <a href="${mobile ? "index.html?view=full" : "mobile.html"}">${mobile ? "Full dashboard" : "Mobile Lite"} <span aria-hidden="true">↗</span></a>
      </div>
    </header>
    <main class="task-shell task-content">
      <section class="task-hero">
        <h1>What would you like to do?</h1>
        <p>${mobile ? "Check the weather or open a tool in the full dashboard." : "Open a forecasting, settlement, or grid research tool."}</p>
        ${mobile ? "" : `<div class="task-profile" aria-hidden="true">${profile}</div>`}
      </section>
      ${sections}
    </main>`;
  document.getElementById("task-workspace").hidden = true;
  document.body.classList.add("task-home-active");
  home.hidden = false;
})();
