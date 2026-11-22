(() => {
  const site = document.body.dataset.site;
  const lite = document.body.hasAttribute('data-mobile-lite');
  const tabs = [...document.querySelectorAll('.site-tools button[aria-controls]')];
  const anchor = document.querySelector('.site-tools') || document.querySelector('main .card');
  if (!anchor) return;
  const key = 'regrid.features.' + site + (lite ? '.lite' : '');
  let off = new Set();
  try { off = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch {}
  const panel = document.createElement('details');
  panel.className = 'feature-picker';
  panel.innerHTML = '<summary>Choose features</summary><p>Select what you want to see. Your choices are saved in this browser.</p><div class="feature-groups"></div><button type="button" class="alt">Select all features</button>';
  anchor.before(panel);
  const options = [];
  function group(title, entries) {
    const field = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = title;
    field.append(legend);
    for (const [id, label, nodes] of entries) {
      if (!nodes.length) continue;
      const item = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !off.has(id);
      item.append(input, label);
      field.append(item);
      options.push({id, input, nodes});
      input.onchange = () => {
        if (input.checked) off.delete(id); else off.add(id);
        save();
      };
    }
    if (field.children.length > 1) panel.querySelector('.feature-groups').append(field);
  }
  function apply() {
    for (const {id, input, nodes} of options) {
      input.checked = !off.has(id);
      for (const node of nodes) node.classList.toggle('feature-off', off.has(id));
    }
    const enabled = tabs.filter(tab => !off.has(tab.id));
    if (enabled.length && !enabled.some(tab => tab.classList.contains('on'))) enabled[0].click();
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify([...off])); } catch {}
    apply();
  }
  group('Sections', tabs.map(tab => [tab.id, tab.querySelector('strong').textContent,
    [tab, document.getElementById(tab.getAttribute('aria-controls')), ...document.querySelectorAll('[data-go="'+tab.id+'"],[data-go^="'+tab.id+'-"]')].filter(Boolean)]));
  const tools = site === 'dsm' ? [
    ['workflow','Workflow shortcuts','#steps'], ['sample','Sample data buttons','#dsamp,#qc_sample'],
    ['reports','Comparison report exports','#qc_xl,#qc_pdf']
  ] : [
    ['sample','Sample data buttons','#samp,#wsamp'], ['csv','CSV downloads','#csv,#sdl,#wdl'],
    ['weather-chart','Weather chart','#chart']
  ];
  group('Tools', tools.map(([id,label,selector]) => [id,label,[...document.querySelectorAll(selector)].map(n=>n.closest('.chartbox') || n)]));
  for (const tab of tabs) tab.addEventListener('click', e => {
    if (off.has(tab.id)) e.stopImmediatePropagation();
  }, true);
  panel.querySelector('button').onclick = () => { off.clear(); save(); };
  apply();
})();
