// Side-by-side report: the same transcript through write-naive vs gated memory.
import { runTranscript, EPISODES, FOLLOW_UP_REQUEST, DEFAULT_POLICY } from '../public/scenario.mjs';

const naive = runTranscript('naive');
const gated = runTranscript('gated');

const mark = { saved: 'SAVED  ', pending: 'PENDING', dropped: 'DROPPED' };

console.log('Memory Gate — transcript report');
console.log(`policy: semantic needs ${DEFAULT_POLICY.semantic.minObservations} observations, procedural needs ${DEFAULT_POLICY.procedural.minSuccesses} proofs, retrieveTopK=${DEFAULT_POLICY.retrieveTopK}\n`);

// Gate verdicts per candidate (episode 1 has the interesting mix).
console.log('Write gate — every candidate, both policies');
console.log(`${'candidate'.padEnd(46)}${'naive'.padEnd(9)}gated`);
for (const ep of EPISODES) {
  console.log(`  ${ep.title}`);
  for (const c of ep.candidates) {
    const nv = naive.log.find(l => l.id === c.id);
    const gv = gated.log.find(l => l.id === c.id);
    console.log(`  ${(c.stated || c.text || c.rule || c.fragment).padEnd(44)}${mark[nv.verdict].padEnd(9)}${mark[gv.verdict]}`);
    console.log(`      gated: ${gv.reason}`);
  }
}

function dumpStores(label, mem) {
  const s = mem.snapshot();
  console.log(`\n${label}`);
  console.log(`  episodic   (${s.episodic.length}): ${s.episodic.join(' | ') || '—'}`);
  console.log(`  semantic   (${s.semantic.length}): ${s.semantic.join(' | ') || '—'}`);
  if (s.semanticPending.length) console.log(`    pending      : ${s.semanticPending.join(' | ')}`);
  console.log(`  procedural (${s.procedural.length}): ${s.procedural.join(' | ') || '—'}`);
  if (s.proceduralPending.length) console.log(`    pending      : ${s.proceduralPending.join(' | ')}`);
  console.log(`  working    (${s.working.length}): ${s.working.join(' | ') || '(evicted at episode end)'}`);
}

dumpStores('Write-naive store after the transcript', naive);
dumpStores('Gated store after the transcript', gated);

console.log(`\nRetrieval — "${FOLLOW_UP_REQUEST}"`);
for (const [label, mem] of [['naive', naive], ['gated', gated]]) {
  const cards = mem.retrieve(FOLLOW_UP_REQUEST);
  console.log(`  ${label}: ${cards.map(c => `[${c.store}] ${c.text}`).join(' | ') || '(nothing)'}`);
}

// Invariants — the demo's claims, checked.
const problems = [];
const nSem = naive.snapshot().semantic;
const gSem = gated.snapshot().semantic;
if (!nSem.includes('prefers aisle seat')) problems.push('naive: tentative preference should be durable (pollution demo)');
if (!nSem.some(t => t.includes('$312')) || !nSem.some(t => t.includes('$404'))) {
  problems.push('naive: both stale prices should be durable (contradiction demo)');
}
if (nSem.length >= gSem.length) { /* expected */ } else problems.push('naive store should hold more "facts" than gated');
if (gSem.some(t => t.includes('$312')) || gSem.some(t => t.includes('$404'))) problems.push('gated: transient prices must never persist');
if (!gSem.includes('prefers aisle seat')) problems.push('gated: repeated preference should promote by ep-2');
if (gated.snapshot().procedural.length !== 1) problems.push('gated: the rule should promote after two proofs');
if (naive.episodic.length !== 0) problems.push('naive: no routing — episodes land in the blob');
if (gated.episodic.length !== 2) problems.push('gated: two completed episodes expected');
if (naive.retrieve(FOLLOW_UP_REQUEST).some(c => c.text.includes('$312'))) {
  // intended: stale price is retrievable in naive mode
} else problems.push('naive: stale price should surface on retrieval (the bug we demo)');

if (problems.length) {
  console.error('\nINVARIANT FAILURES:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nAll invariants hold: naive polluted, gated clean.');
