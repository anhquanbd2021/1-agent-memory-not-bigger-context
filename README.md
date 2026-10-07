# Memory Gate — companion demo

Interactive lab for the article *Agent Memory Is a Read-and-Write System —
and Most Teams Only Build the Read Half*. One two-episode transcript runs
through four memory stores under two write policies: **write-naive** stores
every observation as a durable fact; **gated** routes each candidate through
its store's admission rule.

Zero dependencies — Node 20+ only. The gate engine and transcript are plain
ES modules shared by the browser UI, the CLI, and the test suite.

## What it proves

| Policy | Result |
|---|---|
| **Write-naive** | "I might prefer aisle" is a durable fact after episode one; two contradictory prices ($312, $404) coexist forever; a UI spinner trace lands in knowledge. Retrieval still works — it faithfully serves the pollution. |
| **Gated** | Transient prices are dropped on arrival. The unconfirmed preference sits in `pending` until it repeats in a second episode. The rule promotes only after proving out twice. Only *completed* episodes reach episodic memory. |

## The four stores, four gates

- **Working** — scratch for the current turn; evicted at episode end and
  *never searched* by retrieval.
- **Episodic** — accepts a completed episode record only; mid-episode
  fragments are dropped.
- **Semantic** — confirmed facts write immediately; stated-once claims park
  in `pending` and promote only on a repeat in a different episode;
  transient truths are dropped.
- **Procedural** — a rule must prove out in `minSuccesses` distinct
  episodes before it becomes recallable procedure.

## Run it

```text
npm start        # serve the lab on :3000
npm test         # gate semantics + CLI + server contract
npm run report   # side-by-side naive vs gated transcript report
npm run check    # both
```

## Examples

- `examples/session.json` — the canonical two-episode transcript.
- `examples/policy.json` — gate thresholds (`minObservations`,
  `minSuccesses`, `retrieveTopK`).

## Honest limits

- Simulated stores — no vector DB and no embeddings; retrieval is keyword
  overlap standing in for semantic search.
- `confirmed`, `transient`, and `worked` arrive as transcript metadata; a
  real agent must infer them, and that inference is the hard part this lab
  abstracts away.
- The gates are minimal admission rules — no decay, compaction, conflict
  resolution, or human review queue.
- Thresholds (2 observations, 2 proofs) are illustrative; real values
  depend on blast radius.

This is an educational demo, not production infrastructure.
