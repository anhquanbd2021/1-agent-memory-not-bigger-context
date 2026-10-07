import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { MemorySystem, DEFAULT_POLICY, LONG_TERM_STORES } from '../public/memory.mjs';
import { EPISODES, FOLLOW_UP_REQUEST, runTranscript } from '../public/scenario.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('embedded transcript matches examples/session.json', async () => {
  const disk = JSON.parse(await readFile(`${root}examples/session.json`, 'utf8'));
  assert.deepEqual(EPISODES, disk);
});

test('embedded policy matches examples/policy.json', async () => {
  const disk = JSON.parse(await readFile(`${root}examples/policy.json`, 'utf8'));
  assert.deepEqual(DEFAULT_POLICY, disk);
});

test('write-naive stores a stated-once preference as durable fact', () => {
  const mem = runTranscript('naive');
  assert.ok(mem.semantic.durable.some(f => f.text === 'prefers aisle seat'),
    'the hedged "might prefer aisle" is durable after one episode — that is the pollution');
});

test('gated parks a stated-once preference as pending, promotes on repeat', () => {
  // Episode 1 only: pending, not durable.
  const mem = new MemorySystem({ mode: 'gated' });
  const ep = EPISODES[0];
  mem.beginEpisode(ep.id);
  for (const c of ep.candidates) mem.write(c);
  mem.endEpisode(ep.outcome);
  assert.ok(mem.semantic.pending.some(f => f.key === 'seat'));
  assert.ok(!mem.semantic.durable.some(f => f.key === 'seat'));

  // Episode 2 repeats the claim → promoted.
  const full = runTranscript('gated');
  assert.ok(full.semantic.durable.some(f => f.text === 'prefers aisle seat'));
  assert.ok(!full.semantic.pending.some(f => f.key === 'seat'));
});

test('transient facts are dropped by the gate, stored by naive', () => {
  const gated = runTranscript('gated');
  const naive = runTranscript('naive');
  assert.ok(!gated.semantic.durable.some(f => f.text.includes('$')));
  assert.ok(naive.semantic.durable.some(f => f.text.includes('$312')));
  assert.ok(naive.semantic.durable.some(f => f.text.includes('$404')),
    'naive holds two contradictory prices as durable facts');
});

test('episodic store accepts completed episodes only', () => {
  const mem = new MemorySystem({ mode: 'gated' });
  mem.beginEpisode('e1');
  const frag = mem.write({ id: 'f', store: 'episodic', fragment: 'spinner 1.2s' });
  assert.equal(frag.verdict, 'dropped');
  const aborted = mem.endEpisode({ complete: false, summary: 'crashed' });
  assert.equal(aborted.verdict, 'dropped');
  assert.equal(mem.episodic.length, 0);
  mem.beginEpisode('e2');
  const done = mem.endEpisode({ complete: true, summary: 'done', tags: [] });
  assert.equal(done.verdict, 'saved');
  assert.equal(mem.episodic.length, 1);
});

test('procedural rule needs proofs across distinct episodes', () => {
  const mem = new MemorySystem({ mode: 'gated' });
  mem.beginEpisode('e1');
  const first = mem.write({ id: 'r1', store: 'procedural', key: 'k', rule: 'do X', worked: true });
  assert.equal(first.verdict, 'pending');
  const again = mem.write({ id: 'r2', store: 'procedural', key: 'k', rule: 'do X', worked: true });
  assert.equal(again.verdict, 'pending', 'same episode does not count twice');
  mem.endEpisode({ complete: true, summary: 'ok', tags: [] });
  mem.beginEpisode('e2');
  const second = mem.write({ id: 'r3', store: 'procedural', key: 'k', rule: 'do X', worked: true });
  assert.equal(second.verdict, 'saved');
  assert.equal(mem.procedural.durable.length, 1);
});

test('a rule that did not work does not accrue proofs', () => {
  const mem = new MemorySystem({ mode: 'gated' });
  for (const ep of ['e1', 'e2', 'e3']) {
    mem.beginEpisode(ep);
    mem.write({ id: `r-${ep}`, store: 'procedural', key: 'k', rule: 'do X', worked: ep !== 'e2' });
    mem.endEpisode({ complete: true, summary: 'ok', tags: [] });
  }
  assert.equal(mem.procedural.durable.length, 1, 'worked in e1+e3 = 2 proofs');
});

test('working memory is evicted at episode end and never searched', () => {
  const mem = new MemorySystem({ mode: 'gated' });
  mem.beginEpisode('e1');
  mem.observe('canary-working-note NYC');
  // Mid-episode: retrieval still never touches working.
  assert.ok(!mem.retrieve('NYC flight').some(c => c.text.includes('canary')));
  const { evicted } = mem.endEpisode({ complete: true, summary: 'ok', tags: [] });
  assert.equal(evicted, 1);
  assert.equal(mem.working.length, 0);
  assert.ok(!mem.retrieve('NYC flight').some(c => c.store === 'working'));
});

test('retrieve only draws from the three long-term stores', () => {
  const mem = runTranscript('gated');
  for (const c of mem.retrieve(FOLLOW_UP_REQUEST)) {
    assert.ok(LONG_TERM_STORES.includes(c.store), c.store);
  }
});

test('naive retrieval surfaces pollution; gated retrieval is clean', () => {
  const naive = runTranscript('naive');
  const gated = runTranscript('gated');
  const nCards = naive.retrieve(FOLLOW_UP_REQUEST);
  assert.ok(nCards.some(c => c.text.includes('$312')), 'stale price is retrievable in naive mode');
  assert.ok(nCards.some(c => c.text.includes('$404')), 'two contradictory prices, both durable');
  const gCards = gated.retrieve(FOLLOW_UP_REQUEST);
  assert.ok(!gCards.some(c => c.text.includes('$')), 'no stale prices in gated recall');
  assert.ok(gCards.some(c => c.store === 'episodic'), 'gated recalls last trip');
});

test('gated transcript end-state: 2 episodes, 2 facts, 1 rule, 0 pending', () => {
  const s = runTranscript('gated').snapshot();
  assert.equal(s.episodic.length, 2);
  assert.deepEqual(s.semantic.sort(), ['flights before 10 AM', 'prefers aisle seat']);
  assert.deepEqual(s.procedural, ['always check the 14-day advance-purchase window']);
  assert.equal(s.semanticPending.length, 0);
  assert.equal(s.proceduralPending.length, 0);
});

test('confirmed fact in episode 1 is durable immediately', () => {
  const mem = new MemorySystem({ mode: 'gated' });
  const ep = EPISODES[0];
  mem.beginEpisode(ep.id);
  const v = mem.write(ep.candidates.find(c => c.id === 'c-morning'));
  assert.equal(v.verdict, 'saved');
  assert.equal(v.store, 'semantic');
});

test('write outside an episode throws', () => {
  const mem = new MemorySystem({ mode: 'gated' });
  assert.throws(() => mem.write({ id: 'x', store: 'semantic', key: 'k', text: 't' }));
});
