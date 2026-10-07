import { MemorySystem } from '/memory.mjs';
import { EPISODES, FOLLOW_UP_REQUEST, DEFAULT_POLICY } from '/scenario.mjs';

const $ = id => document.getElementById(id);
let mode = 'gated';

const GATE_TEXT = {
  working: 'writes freely — evicts at episode end; never searched',
  episodic: 'writes on a completed episode only',
  semantic: 'writes on confirmed facts, or claims repeated across episodes',
  procedural: 'writes when a rule proves out across episodes',
};

function setMode(m) {
  mode = m;
  $('mode-naive').setAttribute('aria-pressed', m === 'naive');
  $('mode-gated').setAttribute('aria-pressed', m === 'gated');
  $('mode-badge').textContent = m === 'naive' ? 'write-naive' : 'gated';
  $('mode-badge').className = `badge ${m === 'naive' ? 'danger' : 'success'}`;
}
$('mode-naive').addEventListener('click', () => { setMode('naive'); run(); });
$('mode-gated').addEventListener('click', () => { setMode('gated'); run(); });
$('run').addEventListener('click', run);

function paintEpisodes(mem) {
  $('episodes').replaceChildren(...EPISODES.map(ep => {
    const div = document.createElement('div');
    div.className = 'episode';
    const h = document.createElement('h3');
    h.textContent = ep.title;
    const ul = document.createElement('ul');
    ul.className = 'candidates';
    const entries = [...ep.candidates, { id: `outcome:${ep.id}`, stated: `outcome: ${ep.outcome.summary}` }];
    for (const c of entries) {
      const v = mem.log.find(l => l.id === c.id);
      const li = document.createElement('li');
      li.className = `candidate ${v.verdict}`;
      const head = document.createElement('div');
      const b = document.createElement('span');
      b.className = `badge ${v.verdict}`;
      b.textContent = v.verdict.toUpperCase();
      const s = document.createElement('span');
      s.className = 'stated';
      s.textContent = ` ${c.stated || c.text}`;
      head.append(b, s);
      const p = document.createElement('p');
      p.textContent = `${v.store || '—'}: ${v.reason}`;
      li.append(head, p);
      ul.append(li);
    }
    div.append(h, ul);
    return div;
  }));
}

function paintStores(mem) {
  const s = mem.snapshot();
  const groups = [
    ['working', 'Working', s.working, []],
    ['episodic', 'Episodic', s.episodic, []],
    ['semantic', 'Semantic', s.semantic, s.semanticPending],
    ['procedural', 'Procedural', s.procedural, s.proceduralPending],
  ];
  $('stores').replaceChildren(...groups.map(([key, name, items, pending]) => {
    const div = document.createElement('div');
    div.className = `store${items.length || pending.length ? '' : ' empty'}`;
    const h = document.createElement('h3');
    h.textContent = name;
    const g = document.createElement('p');
    g.className = 'gate';
    g.textContent = GATE_TEXT[key];
    const ul = document.createElement('ul');
    for (const t of items) {
      const li = document.createElement('li');
      li.textContent = t;
      ul.append(li);
    }
    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = key === 'working' ? '(evicted at episode end)' : '(nothing admitted)';
      ul.append(li);
    }
    div.append(h, g, ul);
    if (pending.length) {
      const pl = document.createElement('ul');
      pl.className = 'pending-list';
      for (const t of pending) {
        const li = document.createElement('li');
        li.textContent = `pending: ${t}`;
        pl.append(li);
      }
      div.append(pl);
    }
    return div;
  }));
  const durable = s.episodic.length + s.semantic.length + s.procedural.length;
  $('fact-count').textContent = `${durable} durable entr${durable === 1 ? 'y' : 'ies'} · ${s.semanticPending.length + s.proceduralPending.length} pending`;
  $('fact-count').className = `badge ${mode === 'naive' ? 'danger' : 'success'}`;
}

function paintRecall(mem) {
  const cards = mem.retrieve(FOLLOW_UP_REQUEST);
  $('recall-count').textContent = `${cards.length} card${cards.length === 1 ? '' : 's'} retrieved`;
  $('recall-count').className = 'badge info';
  $('recall').replaceChildren(...cards.map(c => {
    const div = document.createElement('div');
    div.className = `card ${c.store}`;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = c.store;
    const p = document.createElement('p');
    p.style.margin = '4px 0 0';
    p.textContent = c.text;
    div.append(tag, p);
    return div;
  }));
}

function run() {
  const mem = new MemorySystem({ mode, policy: DEFAULT_POLICY });
  for (const ep of EPISODES) {
    mem.beginEpisode(ep.id);
    for (const w of ep.working) mem.observe(w);
    for (const c of ep.candidates) mem.write(c);
    mem.endEpisode(ep.outcome);
  }
  paintEpisodes(mem);
  paintStores(mem);
  paintRecall(mem);
}

setMode('gated');
run();
