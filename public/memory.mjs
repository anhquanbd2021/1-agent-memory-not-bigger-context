// Memory Gate — four stores, each with its own write-admission rule.
//
// Stores:
//   working    — scratch for the current episode; evicted at episode end;
//                NEVER searched by retrieve() (it already holds the turn).
//   episodic   — what happened; writes only on a *completed* episode.
//   semantic   — durable facts; writes on confirmed facts, or on a claim
//                repeated across distinct episodes (pending → durable).
//   procedural — rules that worked; writes once a rule has proved out in
//                `minSuccesses` distinct episodes.
//
// mode 'gated' applies the rules above; mode 'naive' writes every
// candidate straight into semantic as a durable fact — the classic
// "dump the transcript in the vector store" design, and the source of
// memory pollution.

export const LONG_TERM_STORES = ['episodic', 'semantic', 'procedural'];

export const DEFAULT_POLICY = {
  semantic: { minObservations: 2 },   // distinct episodes before a stated-once claim promotes
  procedural: { minSuccesses: 2 },    // distinct episodes where the rule worked
  retrieveTopK: 6,
};

const verdict = (v, store, reason) => ({ verdict: v, store, reason });

export class MemorySystem {
  constructor({ mode = 'gated', policy = DEFAULT_POLICY } = {}) {
    if (!['gated', 'naive'].includes(mode)) throw new Error(`unknown mode: ${mode}`);
    this.mode = mode;
    this.policy = policy;
    this.working = [];                          // [{text, episode}]
    this.episodic = [];                         // [{summary, tags, episode}]
    this.semantic = { durable: [], pending: [] };
    this.procedural = { durable: [], pending: [] };
    this.episodeId = null;
    this.log = [];                              // [{id, stated, verdict, store, reason}]
  }

  beginEpisode(episodeId) {
    if (this.episodeId !== null) throw new Error('episode already open');
    this.episodeId = episodeId;
  }

  /** Scratch observation for the current turn. Never gated — it dies with the episode. */
  observe(text) {
    this.#requireEpisode();
    this.working.push({ text, episode: this.episodeId });
    return { verdict: 'saved', store: 'working', reason: 'per-turn scratch — evicted at episode end' };
  }

  /** Route a write candidate through its store's gate. */
  write(candidate) {
    this.#requireEpisode();
    const v = this.mode === 'naive'
      ? this.#naiveWrite(candidate)
      : this.#gatedWrite(candidate);
    this.log.push({ id: candidate.id, store: v.store, verdict: v.verdict, reason: v.reason });
    return v;
  }

  /** A completed episode is the only thing episodic memory accepts. */
  endEpisode(outcome) {
    this.#requireEpisode();
    let v;
    if (this.mode === 'naive') {
      this.semantic.durable.push({ key: `episode:${this.episodeId}`, text: outcome.summary, tags: outcome.tags || [], episode: this.episodeId });
      v = verdict('saved', 'semantic', 'write-naive: episode stored as a flat fact');
    } else if (outcome && outcome.complete === true) {
      this.episodic.push({ summary: outcome.summary, tags: outcome.tags || [], episode: this.episodeId });
      v = verdict('saved', 'episodic', 'completed episode — episodic store accepts');
    } else {
      v = verdict('dropped', 'episodic', 'incomplete episode — nothing is recorded');
    }
    this.log.push({ id: `outcome:${this.episodeId}`, store: v.store, verdict: v.verdict, reason: v.reason });
    const evicted = this.working.length;
    this.working = [];
    this.episodeId = null;
    return { ...v, evicted };
  }

  /** Search the three long-term stores. Working memory is never searched. */
  retrieve(request) {
    const tokens = new Set(request.toLowerCase().split(/[^a-z0-9$]+/).filter(t => t.length > 2));
    const cards = [];
    const score = text => {
      let s = 0;
      for (const t of tokens) if (text.toLowerCase().includes(t)) s++;
      return s;
    };
    for (const e of this.episodic) {
      cards.push({ store: 'episodic', text: e.summary, score: score(`${e.summary} ${e.tags.join(' ')}`) });
    }
    for (const f of this.semantic.durable) {
      cards.push({ store: 'semantic', text: f.text, score: score(`${f.text} ${(f.tags || []).join(' ')}`) });
    }
    for (const r of this.procedural.durable) {
      cards.push({ store: 'procedural', text: r.rule, score: score(r.rule) });
    }
    return cards
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score || a.store.localeCompare(b.store))
      .slice(0, this.policy.retrieveTopK);
  }

  /** What's durable per store — used by the UI and the report. */
  snapshot() {
    return {
      working: this.working.map(w => w.text),
      episodic: this.episodic.map(e => e.summary),
      semantic: this.semantic.durable.map(f => f.text),
      semanticPending: this.semantic.pending.map(f => f.text),
      procedural: this.procedural.durable.map(r => r.rule),
      proceduralPending: this.procedural.pending.map(r => `${r.rule} (${r.episodes.size}/${this.policy.procedural.minSuccesses} proofs)`),
    };
  }

  // ---- internals ----

  #requireEpisode() {
    if (this.episodeId === null) throw new Error('no open episode — call beginEpisode()');
  }

  #naiveWrite(c) {
    // No gate, no routing: every observation becomes a durable "fact".
    this.semantic.durable.push({ key: c.key || c.id, text: c.text || c.rule || c.fragment, episode: this.episodeId });
    return verdict('saved', 'semantic', 'write-naive: stored as a durable fact, no admission check');
  }

  #gatedWrite(c) {
    switch (c.store) {
      case 'working':
        return this.observe(c.text || c.fragment);
      case 'episodic':
        return verdict('dropped', 'episodic', 'episodic writes on completed episodes only — mid-episode fragments are dropped');
      case 'semantic':
        return this.#semanticGate(c);
      case 'procedural':
        return this.#proceduralGate(c);
      default:
        return verdict('dropped', null, `no store claims this candidate — dropped`);
    }
  }

  #semanticGate(c) {
    if (c.transient) {
      return verdict('dropped', 'semantic', 'transient — its truth lifetime is shorter than the session');
    }
    if (c.confirmed) {
      this.#promoteSemantic(c);
      return verdict('saved', 'semantic', 'confirmed in this episode — durable');
    }
    const existing = this.semantic.pending.find(p => p.key === c.key);
    if (existing && existing.episode !== this.episodeId) {
      // Stated again in a different episode: survives the repeat filter.
      this.semantic.pending = this.semantic.pending.filter(p => p !== existing);
      this.#promoteSemantic({ ...c, text: existing.text });
      return verdict('saved', 'semantic', `repeated in a second episode (≥${this.policy.semantic.minObservations} observations) — promoted`);
    }
    if (existing) {
      return verdict('pending', 'semantic', 'restated within the same episode — still one observation');
    }
    this.semantic.pending.push({ key: c.key, text: c.text, episode: this.episodeId });
    return verdict('pending', 'semantic', 'stated once, unconfirmed — parked pending a repeat or explicit confirmation');
  }

  #proceduralGate(c) {
    const need = this.policy.procedural.minSuccesses;
    let entry = this.procedural.pending.find(r => r.key === c.key)
      || this.procedural.durable.find(r => r.key === c.key);
    if (entry && entry.episodes.has(this.episodeId)) {
      return verdict(this.procedural.durable.includes(entry) ? 'saved' : 'pending', 'procedural',
        'rule already counted this episode — one proof per episode');
    }
    if (!entry) {
      entry = { key: c.key, rule: c.rule, episodes: new Set() };
      this.procedural.pending.push(entry);
    }
    if (c.worked) entry.episodes.add(this.episodeId);
    if (entry.episodes.size >= need && !this.procedural.durable.includes(entry)) {
      this.procedural.pending = this.procedural.pending.filter(r => r !== entry);
      this.procedural.durable.push(entry);
      return verdict('saved', 'procedural', `proved out in ${entry.episodes.size} episodes — durable rule`);
    }
    return verdict('pending', 'procedural',
      `worked in ${entry.episodes.size}/${need} episodes — a rule earns storage by surviving reuse`);
  }

  #promoteSemantic(c) {
    const i = this.semantic.durable.findIndex(f => f.key === c.key);
    const fact = { key: c.key, text: c.text, episode: this.episodeId };
    if (i >= 0) this.semantic.durable[i] = fact; else this.semantic.durable.push(fact);
  }
}
