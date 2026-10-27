const { stages, lensLabels } = window.DECK;
const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const ph = (value, hint) => value || `<span class="ph">${hint}</span>`;

const state = { cover: false, stage: -1, role: 0, lens: 'people', modal: false };

/* ---------- motion ---------- */

const EASE = 'cubic-bezier(.22, 1, .36, 1)';
const still = matchMedia('(prefers-reduced-motion: reduce)');

function enter(els, { x = 0, y = 16, scale = 1, step = 50, delay = 0, duration = 700 } = {}) {
  if (still.matches) return;
  els.forEach((el, i) => el.getAnimations().forEach((a) => a.cancel()) || el.animate(
    [{ opacity: 0, transform: `translate(${x}px, ${y}px) scale(${scale})` }, { opacity: 1, transform: 'none' }],
    { duration, delay: delay + i * step, easing: EASE, fill: 'backwards' },
  ));
}

function leave(els, { x = 0, y = -8 } = {}) {
  if (still.matches) return Promise.resolve();
  return Promise.all(els.map((el) => el.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate(${x}px, ${y}px)` }],
    { id: 'leave', duration: 180, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' },
  ).finished.catch(() => {})));
}

// A transition cut short by a newer one leaves its fade-outs behind; drop them once the newer one has rendered
const clearStale = () => document.getAnimations().forEach((a) => a.id === 'leave' && a.playState === 'finished' && a.cancel());

// Every number in the text counts up from 0: "-92%", "38 → 45", "6,4 часа → 1 час"; works per text node so word wrappers survive
const finals = new WeakMap();
function countUp(els, delay = 0) {
  if (still.matches) return;
  els.forEach((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!finals.has(n)) finals.set(n, n.textContent);
      if (/\d/.test(finals.get(n))) nodes.push(n);
    }
    if (!nodes.length) return;
    const start = performance.now() + delay;
    const tick = (now) => {
      const t = Math.min(Math.max((now - start) / 1100, 0), 1);
      const k = 1 - (1 - t) ** 3;
      nodes.forEach((n) => {
        n.textContent = finals.get(n).replace(/\d+(?:,\d+)?/g, (d) => {
          const decimals = (d.split(',')[1] || '').length;
          return (parseFloat(d.replace(',', '.')) * k).toFixed(decimals).replace('.', ',');
        });
      });
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// Words inside a number ("недели", "часа", "из") are set smaller so the digits lead
const units = (s) => s.replace(/[А-Яа-яЁё][А-Яа-яЁё.-]*/g, (w) => `<span class="u">${w}</span>`);

/* ---------- state <-> URL hash: #cover | #stage/role/lens ---------- */

// Lenses of a role: Люди / Процессы / Технологии, plus «Артефакты» when the role has links
const LINKS_LABEL = 'Артефакты';
// Links live on the role, in the stage's byRole entry, or once for the whole stage (shared)
const linksOf = (st, r) => r.links || st.byRole?.[r.id]?.links || st.shared?.links;
// A table set for the lens: the role's own (byRole) or the stage's (shared)
const rowsOf = (st, r, key) => st.byRole?.[r.id]?.[key] || st.shared?.[key];
const lensKeys = (st, r) => [...Object.keys(lensLabels), ...(linksOf(st, r) ? ['links'] : [])];

function readHash() {
  const [s, r, l] = location.hash.slice(1).split('/');
  const stage = stages.findIndex((x) => x.id === s);
  if (stage < 0) return { cover: true };
  const ri = Math.max(stages[stage].roles.findIndex((x) => x.id === (r || stages[stage].defaultRole)), 0);
  return { stage, role: ri, lens: lensKeys(stages[stage], stages[stage].roles[ri]).includes(l) ? l : 'people' };
}

function writeHash() {
  if (state.cover) return history.replaceState(null, '', '#cover');
  const stage = stages[state.stage];
  history.replaceState(null, '', `#${stage.id}/${stage.roles[state.role].id}/${state.lens}`);
}

/* ---------- render ---------- */

function renderStatic() {
  // Cycle stages sit inside a thin return loop; stages marked apart (Результаты) follow a divider
  // Cycle pills keep one fixed icon slot: grey hex (ahead / current) or green check (passed), so nothing shifts between slides
  const mark = '<span class="st" aria-hidden="true"><svg class="st-hex" viewBox="0 0 87.47 96.83"><use href="#hex"/></svg><svg class="st-done" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12"/><path d="m7.5 12.5 3 3 6-6.5"/></svg></span>';
  const pill = (s) => `<button class="pill${s.apart ? ' apart' : ''}" data-stage="${stages.indexOf(s)}">${s.apart ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/></svg>' : mark}${s.label}</button>`;
  $('stepper').innerHTML = `<span class="loop">${stages.filter((s) => !s.apart).map(pill).join('<img src="assets/arrow-nav.svg" alt="">')}</span>` +
    stages.filter((s) => s.apart).map((s) => `<span class="stepper-sep" aria-hidden="true"></span>${pill(s)}`).join('');
  drawLoop();
  document.fonts.ready.then(() => drawLoop()); // pill widths settle once Manrope loads
}

// Return line under a cycle (stepper or cover scheme): from the last step's centre back to the first, arrowhead up; unscaled slide px
function drawLoop(loop = $('stepper').querySelector('.loop')) {
  const pills = loop.querySelectorAll('.pill, .chip');
  if (!pills[0].offsetWidth) return; // deck hidden (cover): drawn when the deck shows
  const mid = (el) => el.offsetLeft + el.offsetWidth / 2;
  const x1 = mid(pills[0]), x2 = mid(pills[pills.length - 1]), y = pills[0].offsetTop + pills[0].offsetHeight + 5, r = 8, low = y + 14;
  loop.querySelector('.loop-line')?.remove();
  loop.insertAdjacentHTML('beforeend', `<svg class="loop-line" width="1" height="1" aria-hidden="true"><path d="M${x2} ${y}V${low - r}a${r} ${r} 0 0 1 -${r} ${r}H${x1 + r}a${r} ${r} 0 0 1 -${r} -${r}V${y}M${x1 - 5} ${y + 5}L${x1} ${y}L${x1 + 5} ${y + 5}"/></svg>`);
}

// «Было: …» archive line, optionally «→ то, что стало»
const problemLine = (stage) => `<p class="insight problem"><svg class="problem-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg><span>Было: ${stage.insight.then ? `${stage.insight.problem}</span><span class="then-arrow" aria-hidden="true">→</span><span class="then">${stage.insight.then}` : `<b>${stage.insight.problem}</b>`}</span></p>`;

const FINAL_ICONS = {
  team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  client: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
};

// Square image slot: shows assets/<name>.png, or a dashed placeholder with the file name until it exists
const pic = (name, cls) => `<span class="${cls}"><img src="assets/${name}.png" alt="" onerror="this.parentNode.classList.add('ph-slot');this.replaceWith('${name}.png')"></span>`;

// Final slide: two blocks, no tabs and no detail panel
function renderFinal(stage) {
  $('overview').innerHTML = `
    <div class="final-grid">${stage.final.map((b) => `
      <article class="final-card">
        <div class="final-head"><span class="area-icon"><svg viewBox="0 0 24 24">${FINAL_ICONS[b.icon]}</svg></span><h2>${b.title}</h2></div>
        <ul>${b.items.map((x, n) => `<li><p>${x.replace(/^(.+?):\s*(.)/, (_, h, c) => `<b>${h}</b>${c.toUpperCase()}`)}</p>${pic(b.images[n], 'final-pic')}</li>`).join('')}</ul>
      </article>`).join('')}
    </div>`;
}

function renderOverview() {
  const stage = stages[state.stage];
  $('deck').classList.toggle('is-final', Boolean(stage.final));
  if (stage.final) return renderFinal(stage);
  $('overview').innerHTML = `
    <div class="overview-head">
      <h1>${stage.title}</h1>
      ${stage.insight.problem
        ? problemLine(stage)
        : `<p class="insight"><svg viewBox="0 0 87.47 96.83" aria-hidden="true"><use href="#hex"/></svg><span>${ph(stage.insight.text, 'главный вывод слайда')}</span></p>`}
    </div>
    <div class="grid${stage.roles.length === 4 ? ' wide' : ''}${stage.roles.length > 6 ? ' cols4' : ''}${stage.cycle ? ' cycle' : ''}" ${stage.table || stage.matrix ? '' : 'role="tablist" aria-label="Роли"'}>
      ${stage.roles.map((r, i) => {
        // Stage with a table: cards are process steps, not clickable roles
        const tag = stage.table || stage.matrix ? 'div class="role static"' : `button class="role" role="tab" data-role="${i}"`;
        return `
        <${tag}>
          <span class="role-text">
            <span class="role-title">${ph(r.title, `Роль ${i + 1}`)} <span class="metric">${r.metric}</span></span>
            ${stage.table && !r.caption ? '' : `<span class="role-caption">${ph(r.caption, 'подпись')}</span>`}
          </span>
          ${r.image ? `<img src="${r.image}" alt="">` : ''}
        </${tag.split(' ')[0]}>`;
      }).join('')}
      ${stage.cycle ? [1, 2, 3, 4].map((n) => `<span class="cyc cyc-${n}" aria-hidden="true"><img src="assets/arrow-thesis.svg" alt=""></span>`).join('') : ''}
    </div>`;
}

function renderTable(t) {
  const d = t.lenses[state.lens];
  $('role-title').textContent = t.title;
  $('shifts').innerHTML = `
    <h3 class="t-item">Было</h3><h3 class="t-item">Стало · что изменили</h3><h3 class="t-item">В цифрах</h3>
    <article class="tbl-card before t-item">
      <img src="assets/icon-before.svg" width="24" height="24" alt="">
      <p class="shift-label">Раньше</p>
      <p class="shift-title">${d.before[0]}</p>
      <p class="shift-text">${d.before[1]}</p>
    </article>
    <article class="tbl-card t-item">
      <img src="assets/icon-ai.svg" width="24" height="24" alt="">
      ${logos(d.after.logos || [])}
      ${d.after.title ? `<p class="shift-title">${d.after.title}</p>` : ''}
      <ul>${d.after.items.map((x) => `<li>${x}</li>`).join('')}</ul>
    </article>
    <div class="tbl-nums t-item">
      ${d.numbers.map((n) => `<div class="num${n.todo ? ' todo' : ''}"><span>${n.label}</span><b>${units(n.value)}</b><small>${n.note}</small></div>`).join('')}
    </div>`;
}

// Brand logos for products named in a card's text (files in assets/logos); shown in order of mention. [match, file, name?]
const LOGOS = [['Figma', 'figma'], ['Cursor', 'cursor'], ['Claude Code', 'claude'], ['Claude', 'claude'], ['ChatGPT', 'chatgpt'], ['DeepSeek', 'deepseek'], ['NotebookLM', 'notebooklm'], ['ElevenLabs', 'elevenlabs'],
  ['Descript', 'descript'], ['IntelliJ IDEA', 'intellij-idea'], ['VS Code', 'vscode'], ['Jenkins', 'jenkins'], ['React', 'react'],
  ['Python', 'python'], ['Pandas', 'pandas'], ['PlantUML', 'plantuml'], ['Mermaid', 'mermaid'], ['Postman', 'postman'],
  ['Zabbix', 'zabbix'], ['Grafana', 'grafana'], ['Prometheus', 'prometheus'], ['Loki', 'loki'], ['OpenTelemetry', 'opentelemetry'],
  ['Jaeger', 'jaeger'], ['ClickHouse', 'clickhouse'], ['Telegram', 'telegram'],
  // Implied by the text: the team's LLMs (as in the Discovery agent card) and Jira, which Xray runs in
  ['LLM', 'claude', 'Claude'], ['LLM', 'chatgpt', 'ChatGPT'], ['с помощью AI', 'claude', 'Claude'], ['с помощью AI', 'chatgpt', 'ChatGPT'], ['Xray', 'jira', 'Jira'],
  ['Jira', 'jira'], ['Confluence', 'confluence'], ['GitLab', 'gitlab']];
const logos = (text) => {
  const t = [].concat(text).flat().join(' ');
  const found = LOGOS.map(([match, file, name = match]) => [t.indexOf(match), name, file]).filter(([i]) => i >= 0).sort((x, y) => x[0] - y[0]);
  found.splice(0, found.length, ...found.filter(([, , file], i) => found.findIndex((f) => f[2] === file) === i)); // «Claude Code» also matches «Claude»
  return found.length ? `<span class="logos">${found.map(([, name, file]) => `<img src="assets/logos/${file}.svg" alt="${name}" title="${name}">`).join('')}</span>` : '';
};

// Facts: a plain list — 'point' or ['what', 'value'] shown as «what: value»
const facts = (items) => `<ul class="facts">${items.map((x) => `<li>${Array.isArray(x) ? `${x[0]}: <b>${x[1]}</b>` : x}</li>`).join('')}</ul>`;

// Rows: every step on its own line — step · Было · metric · Стало (for many short steps, like Результаты)
function renderRows(stage) {
  $('shifts').innerHTML = `
    <div class="mxr">
      <div class="mxr-row mxr-head t-item"><span></span><span>Было</span><span>Стало</span></div>
      ${stage.roles.map((r) => {
        const d = r.lenses[state.lens];
        const now = d.human.text || d.ai.text;
        return `<div class="mxr-row t-item"><b>${r.title}</b><span>${d.before.text}</span><span class="mxr-now">${now}</span></div>`;
      }).join('')}
    </div>`;
}

// Shared «Люди»: rows Было → Стало, «title — text» with the title in bold
// Lens tables: people [[было, стало]], process [[процесс, было, стало, ценность]], tech {was, added}
function renderRowsTable(stage, rows) {
  $('role-title').innerHTML = stage.matrix || stage.table?.title || stage.roles[state.role].title;
  const head = (...cols) => `<div class="mxr-row mxr-head t-item">${cols.map((c) => `<span>${c}</span>`).join('')}</div>`;
  const row = (cells) => `<div class="mxr-row t-item">${cells}</div>`;
  let html;
  if (state.lens === 'process') {
    const brief = rowsOf(stage, stage.roles[state.role], 'brief');
    if (brief) rows = brief; // key points on the slide, full texts in the modal
    const more = rowsOf(stage, stage.roles[state.role], 'more') ? '<button class="more-btn" data-more>Показать все</button>' : '';
    html = `<div class="mxr four${brief ? ' brief' : ''}">${head(more, 'Было', 'Стало', 'Ценность')}${rows.map(([name, was, now, value]) =>
      row(`<b>${name}</b><span>${was}</span><span class="mxr-now">${now}</span><span class="mxr-value">${value}</span>`)).join('')}</div>`;
  } else if (state.lens === 'tech') {
    // text → paragraph, ['пункт'] → bullet list, [[группа, текст]] → label/text grid
    const block = (x) => !Array.isArray(x) ? `<p>${x}</p>` : Array.isArray(x[0]) ? `<dl>${x.map(([g, t]) => `<dt>${g}</dt><dd>${t}</dd>`).join('')}</dl>`
      : `<ul>${x.map((i) => `<li>${i}</li>`).join('')}</ul>`;
    const grouped = Array.isArray(rows.added[0]);
    html = `<div class="mxr two tech${grouped ? '' : ' short'}">${head('Было', 'Добавили')}${row(`<span>${logos(rows.was)}${block(rows.was)}</span><span class="mxr-now">${logos([].concat(rows.added).flat())}${block(rows.added)}</span>`)}</div>`;
  } else {
    const fmt = (s) => s.replace(/^(.+?) — /, '<b>$1</b> — ');
    html = `<div class="mxr two">${head('Было', 'Стало')}${rows.map(([was, now]) => row(`<span>${fmt(was)}</span><span class="mxr-now">${fmt(now)}</span>`)).join('')}</div>`;
  }
  $('shifts').innerHTML = html;
}

// «Показать все»: modal with the showcase processes and the other changes; a step of its own in the presenter order
// One grid for both lists: процесс · Было · Стало · Ценность (other changes have no value, so Стало takes both columns)
const moreTable = (rows) => `<div class="all">${rows.map(([name, was, now, value]) =>
  `<div class="all-row"><b>${name}</b><span class="was">${was}</span><span class="now${value ? '' : ' wide'}">${now}</span>${value ? `<span class="value">${value}</span>` : ''}</div>`).join('')}</div>`;
function setModal(open) {
  const st = stages[state.stage], r = st?.roles[state.role];
  open = Boolean(open && r && rowsOf(st, r, 'more'));
  if (open === state.modal) return;
  state.modal = open;
  const m = $('more');
  if (open) {
    $('more-title').textContent = st.table?.title || (st.byRole ? r.title : st.title);
    $('more-body').innerHTML = `<div class="all-row all-head"><span></span><span>Было</span><span>Стало</span><span>Ценность</span></div>
      <h3>Три показательных процесса</h3>${moreTable(rowsOf(st, r, 'process'))}<h3>Другие изменения</h3>${moreTable(rowsOf(st, r, 'more'))}`;
    m.hidden = false;
    enter([m], { y: 0, duration: 300 });
    enter([m.firstElementChild], { y: 24, delay: 60 });
  } else {
    leave([m], { y: 0 }).then(() => { if (!state.modal) { m.hidden = true; clearStale(); } });
  }
}

// Matrix: every step of the stage side by side — a column per step: Было (muted) → Стало (blue)
function renderMatrix(stage) {
  $('role-title').textContent = stage.matrix;
  if (stage.rows) return renderRows(stage);
  $('shifts').innerHTML = `
    <div class="mx${stage.roles.length > 5 ? ' dense' : ''}" style="grid-template-columns: 28px repeat(${stage.roles.length}, 1fr)">
      <span class="mx-label mx-label-was t-item">Было</span><span class="mx-label mx-label-now t-item">Стало</span>
      ${stage.roles.map((r) => {
        const d = r.lenses[state.lens];
        return `<article class="mx-col t-item">
          <h4>${r.title}</h4>
          <p class="mx-was">${d.before.text}</p>
          <p class="mx-now">${d.human.text || d.ai.text}${logos(d.human.text || d.ai.text)}</p>
        </article>`;
      }).join('')}
    </div>`;
}

// Artifacts: a column per group, each link a row «name · host ↗», opens in a new tab
function renderLinks(title, groups) {
  $('role-title').innerHTML = title;
  $('lead').innerHTML = '';
  // Column width follows the group size; a single group spreads its links across the panel
  $('shifts').style.gridTemplateColumns = groups.map((g) => (g.items.length > 4 ? '2fr' : '1fr')).join(' ');
  $('shifts').innerHTML = groups.map((g) => `
    <div class="links-group t-item${groups.length === 1 ? ' wide' : g.items.length > 4 ? ' two' : ''}">
      <h4>${g.title}</h4>
      <div>${g.items.map(([name, url, host]) => `<a class="link" href="${url}" target="_blank" rel="noopener"><span>${name}<small>${host}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg></a>`).join('')}</div>
    </div>`).join('');
}

function renderDetail() {
  if (stages[state.stage].final) return;
  const { table, insight } = stages[state.stage];
  const { kpi, effect } = stages[state.stage].roles[state.role];
  // Stage value («стало») leads; a role's effect shows only where the stage has none; the role's number sits beside it
  const lead = insight.value ? `<span>${insight.value}</span>`
    : effect ? `<span class="effect">${effect}</span>` : '';
  $('detail-value').innerHTML = lead + (kpi ? `<b class="kpi" title="${kpi.label}">${units(kpi.value)}</b>` : '');
  const { matrix } = stages[state.stage];
  const st = stages[state.stage];
  $('shifts').style.gridTemplateColumns = '';
  const links = state.lens === 'links' && linksOf(st, st.roles[state.role]);
  $('detail').classList.toggle('is-links', Boolean(links));
  if (links) {
    $('detail').classList.remove('is-table', 'is-matrix', 'is-pairs', 'no-lead');
    return renderLinks(matrix || table?.title || st.roles[state.role].title, links);
  }
  $('detail').classList.toggle('is-table', Boolean(table));
  $('detail').classList.toggle('is-matrix', Boolean(matrix));
  // A lens given as a table: per role (byRole) or one for the whole stage (shared) — replaces the cards
  const rows = st.byRole?.[st.roles[state.role].id]?.[state.lens] || st.shared?.[state.lens];
  if (rows) { $('detail').classList.add('is-matrix'); $('detail').classList.remove('is-table'); }
  if (table || matrix || rows) $('detail').classList.remove('is-pairs', 'no-lead');
  if (rows) return renderRowsTable(st, rows);
  if (table) return renderTable(table);
  if (matrix) return renderMatrix(stages[state.stage]);
  const { pairs } = stages[state.stage];
  const r = stages[state.stage].roles[state.role];
  const d = r.lenses[state.lens];
  const shift = (cls, icon, label, item) => `
    <article class="shift ${cls}">
      <img src="assets/${icon}" width="24" height="24" alt="">
      <p class="shift-label">${label}</p>
      ${logos(item.text)}
      ${pairs && !item.title ? '' : `<p class="shift-title">${ph(item.title, 'заголовок')}</p>`}
      ${Array.isArray(item.text) ? facts(item.text) : `<p class="shift-text">${ph(item.text, 'описание')}</p>`}
    </article>`;
  // Per lens: both «Стало» cards filled → full three-card layout, otherwise one «Было → Стало» pair
  const pair = Boolean(pairs) && !(d.ai.text && d.human.text);
  $('detail').classList.toggle('is-pairs', pair);
  $('detail').classList.toggle('no-lead', Boolean(pairs) && !d.lead); // cards take the lead's place
  $('role-title').innerHTML = ph(r.title, 'Роль');
  $('lead').innerHTML = pairs ? d.lead : ph(d.lead, 'Вводный абзац: главный сдвиг для роли');
  const before = shift('before', 'icon-before.svg', 'Раньше', d.before);
  const ai = shift('', 'icon-ai.svg', pairs ? (pair ? 'Стало' : 'Что усилили') : 'С AI', d.ai);
  const human = shift('', 'icon-human.svg', ph(r.person, 'Кто решает'), d.human);
  const arrow = '<span class="pair-arrow t-item"><img src="assets/arrow-thesis.svg" width="28" alt="→"></span>';
  $('shifts').innerHTML = pair ? before + arrow + (d.human.text ? human : ai) : before + ai + human;
}

function syncSelection() {
  const r = stages[state.stage]?.roles[state.role];
  const keys = r ? lensKeys(stages[state.stage], r) : [];
  if ($('tabs').dataset.keys !== keys.join()) { // the role's own tab set
    $('tabs').dataset.keys = keys.join();
    $('tabs').innerHTML = keys.map((k) => `<button class="pill" role="tab" data-lens="${k}">${lensLabels[k] || LINKS_LABEL}</button>`).join('');
  }
  $$('[data-stage]').forEach((el) => {
    el.setAttribute('aria-current', +el.dataset.stage === state.stage);
    el.toggleAttribute('data-done', +el.dataset.stage < state.stage && !stages[+el.dataset.stage].apart);
  });
  $$('[data-role]').forEach((el) => el.setAttribute('aria-selected', +el.dataset.role === state.role));
  $$('[data-lens]').forEach((el) => el.setAttribute('aria-selected', el.dataset.lens === state.lens));
  // Last step: «Заново» instead of «вперёд»
  const last = steps.at(-1), atEnd = last.stage === state.stage && last.role === state.role && last.lens === state.lens;
  $('deck').querySelector('[data-step="1"]').hidden = atEnd;
  $('deck').querySelector('.step-restart').hidden = !atEnd;
  writeHash();
}

/* ---------- transitions ---------- */

let seq = 0; // drops a transition if a newer one started while it was fading out

// Cross-fade between cover and deck; false if a newer transition took over
async function swap(hide, show, my) {
  if (!hide.hidden) {
    await leave([hide], { y: 0 });
    if (my !== seq) { hide.getAnimations().forEach((a) => a.cancel()); return false; } // newer step keeps this screen
    hide.hidden = true;
    hide.getAnimations().forEach((a) => a.cancel());
  }
  show.hidden = false;
  return true;
}

async function showCover() {
  const my = ++seq;
  if (!(await swap($('deck'), $('cover'), my))) return;
  state.cover = true;
  writeHash();
  document.fonts.ready.then(() => drawLoop(document.querySelector('.flow-steps.cycle')));
  enter($$('.cover-logo'), { y: -10 });
  enter([...$$('.cover-main > *'), ...$$('.flow'), ...$$('.cover-areas-label, .area, .cover-hint')], { y: 24, step: 70, delay: 200 });
}

async function showStage(next, intro = false) {
  const my = ++seq;
  if (state.cover) {
    if (!(await swap($('cover'), $('deck'), my))) return;
    state.cover = false;
    intro = true;
  }
  const dir = Math.sign(next.stage - state.stage);
  const shift = { x: dir * 40, y: 0 };

  if (!intro) {
    await leave([...$('overview').children, $('role-title'), $('detail-value'), $('lead'), ...$$('.shift, .t-item')], { x: -dir * 24, y: 0 });
    if (my !== seq) return;
  }
  Object.assign(state, next);
  renderOverview();
  renderDetail();
  syncSelection();
  clearStale();

  const base = intro ? 250 : 0;
  if (intro) {
    drawLoop();
    enter([$$('.logo')[0], ...$$('#stepper > *')], { y: -10, step: 35 });
    enter([$('overview'), $('detail')], { y: 32, step: 120, duration: 900 });
  }
  enter($$('.overview-head > *'), { ...(intro ? {} : shift), delay: base, step: 80 });
  enter($$('.role'), { ...(intro ? {} : shift), delay: base + 100, step: 45 });
  enter($$('.final-card'), { ...(intro ? {} : shift), delay: base + 100, step: 90 });
  countUp($$('.metric'), base + 250);
  countUp($$('.num b'), base + 450);
  countUp($$('.kpi'), base + 350);
  enter([$('role-title'), ...$$('#tabs > *'), $('detail-value'), $('lead')], { ...(intro ? {} : shift), delay: base + 200, step: 40 });
  enter($$('.labels > *, .shift, .t-item'), { y: 20, delay: base + 320, step: 70 });
}

async function showDetail(roleChanged) {
  const my = ++seq;
  syncSelection();
  await leave([...(roleChanged ? [$('role-title'), $('detail-value')] : []), $('lead'), ...$$('.shift, .t-item')], { y: -6 });
  if (my !== seq) return;
  renderDetail();
  clearStale();
  enter([...(roleChanged ? [$('role-title'), $('detail-value')] : []), $('lead')], { y: 10, step: 60 });
  if (roleChanged) countUp($$('.kpi'), 150);
  enter($$('.shift, .t-item'), { y: 18, delay: 80, step: 70 });
  countUp($$('.num b'), 250);
}

/* ---------- input ---------- */

function goStage(i) {
  if (i >= 0 && i < stages.length && i !== state.stage) location.hash = stages[i].id; // stage defaults for role/lens
}

document.addEventListener('click', (e) => {
  if (state.modal && e.target === $('more')) return setModal(false); // click on the backdrop
  const el = e.target.closest('[data-step],[data-cover],[data-stage],[data-role],[data-lens],[data-more],[data-close]');
  if (!el) return;
  el.blur(); // keep focus off buttons so clicker Space/Enter steps the deck instead of re-clicking
  if ('more' in el.dataset) return setModal(true);
  if ('close' in el.dataset) return setModal(false);
  if (el.dataset.step) return step(+el.dataset.step);
  setModal(false);
  if ('cover' in el.dataset) return (location.hash = 'cover');
  if (el.dataset.stage) return goStage(+el.dataset.stage);
  if (el.dataset.role) {
    if (+el.dataset.role === state.role) return;
    Object.assign(state, { role: +el.dataset.role, lens: 'people' });
    return showDetail(true);
  }
  if (el.dataset.lens === state.lens) return;
  state.lens = el.dataset.lens;
  showDetail(false);
});

// Presenter order: cover → stage → each role → each lens (Люди → Процессы → Технологии)
// A stage with a table has no role detail: only its lenses are steps
const steps = [{ cover: true }, ...stages.flatMap((s, stage) => s.final ? [{ stage, role: 0, lens: 'people' }] : (s.table || s.matrix ? s.roles.slice(0, 1) : s.roles).flatMap((r, role) =>
  lensKeys(s, r).flatMap((lens) => [{ stage, role, lens }, ...(lens === 'process' && rowsOf(s, r, 'more') ? [{ stage, role, lens, modal: true }] : [])])))];

function step(delta) {
  const same = (x) => x.stage === state.stage && x.role === state.role;
  let i = state.cover ? 0 : steps.findIndex((x) => same(x) && x.lens === state.lens && Boolean(x.modal) === state.modal);
  const next = steps[i + delta];
  if (!next) return;
  const { modal = false, ...to } = next;
  if (to.cover) { setModal(false); return showCover(); }
  if (state.cover || to.stage !== state.stage) { setModal(false); return showStage(to); }
  if (to.role === state.role && to.lens === state.lens) return setModal(modal); // only the modal opens or closes
  setModal(false);
  const roleChanged = to.role !== state.role;
  Object.assign(state, to);
  showDetail(roleChanged);
  if (modal) setModal(true); // stepping back onto the modal step reopens it
}

// Clickers send PageDown/PageUp or arrows; some send Space / Enter / Backspace
const NEXT = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'];
const PREV = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && state.modal) return setModal(false);
  if (e.target.closest?.('a') && e.key === 'Enter') return; // Enter on a focused link opens it
  const delta = NEXT.includes(e.key) ? 1 : PREV.includes(e.key) ? -1 : 0;
  if (!delta) return;
  e.preventDefault();
  if (!e.repeat) step(delta);
});

// Swipe: left → next, right → back (horizontal moves only, so taps and scrolls are untouched)
let touch = null;
addEventListener('touchstart', (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY }; }, { passive: true });
addEventListener('touchend', (e) => {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  touch = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
}, { passive: true });

addEventListener('hashchange', () => {
  const next = readHash();
  setModal(false);
  if (next.cover) { if (!state.cover) showCover(); } else if (state.cover || next.stage !== state.stage) showStage(next);
});

function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  Object.assign($('slide').style, {
    transform: `scale(${s})`,
    left: `${(innerWidth - 1920 * s) / 2}px`,
    top: `${(innerHeight - 1080 * s) / 2}px`,
  });
}

// Typesetting for every text on the slide: short words (в, к, и, от, до…) stick to the next word,
// a dash sticks to the word before it; applied to whatever gets rendered, so content.js stays plain text
const SHORT = /(^|[\s«(„"])([А-Яа-яЁё]{1,2})[ \t\n]+/g;
const nbText = (s) => s.replace(SHORT, '$1$2\u00a0').replace(SHORT, '$1$2\u00a0').replace(/[ \t\n]+—/g, '\u00a0—').replace(/(\d)–(?=\d)/g, '$1–\u2060'); // «45–60» never splits
function typeset(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const v = nbText(node.nodeValue);
    if (v !== node.nodeValue) node.nodeValue = v;
    return;
  }
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) typeset(n);
}
typeset($('slide'));
new MutationObserver((list) => list.forEach((m) => (m.type === 'characterData' ? typeset(m.target) : m.addedNodes.forEach(typeset))))
  .observe($('slide'), { childList: true, subtree: true, characterData: true });

addEventListener('resize', fit);
fit();
renderStatic();
const first = readHash();
if (first.cover) showCover();
else {
  $('deck').hidden = false;
  state.stage = first.stage; // intro has no direction
  showStage(first, true);
}
