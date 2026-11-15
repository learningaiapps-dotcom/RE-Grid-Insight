(() => {
  const tabs = new Map([
    ["weather", "t1"],
    ["solar", "t2"],
    ["wind", "t3"],
    ["dsm", "t4"],
    ["qca", "t5"],
    ["imports", "t6"],
    ["ists", "t7"],
    ["plants", "t8"],
  ]);
  const picker = document.getElementById("task-picker");
  const select = document.getElementById("dashboard-task");
  const mobile = !document.getElementById("t1");

  function openTask(task) {
    const tabId = tabs.get(task);
    if (!tabId) return;
    const tab = document.getElementById(tabId);
    tab?.click();
    select.value = task;
    const panel = document.getElementById(mobile ? "p1" : "p" + tabId.slice(1));
    const heading = panel.querySelector("h1, h2") || panel;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "start" });
  }

  picker.addEventListener("submit", (event) => {
    event.preventDefault();
    const task = select.value;
    if (!tabs.has(task)) return;
    if (mobile && task !== "weather") {
      location.assign("index.html?view=full&task=" + encodeURIComponent(task));
      return;
    }
    openTask(task);
  });

  for (const [task, tabId] of tabs) {
    document.getElementById(tabId)?.addEventListener("click", () => {
      select.value = task;
    });
  }

  const initialTask = new URLSearchParams(location.search).get("task");
  if (!mobile && initialTask) openTask(initialTask);
})();
