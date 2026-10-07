// Memory Gate — transcript fixture (embedded copy of examples/session.json
// + examples/policy.json so the browser needs no fetch). Tests assert the
// embedded copies match the files on disk.

import { MemorySystem } from './memory.mjs';

export const DEFAULT_POLICY = {
  semantic: { minObservations: 2 },
  procedural: { minSuccesses: 2 },
  retrieveTopK: 6,
};

export const FOLLOW_UP_REQUEST = 'Book my usual NYC flight again.';

export const EPISODES = [
  {
    id: 'ep-1',
    title: 'Episode 1 — "Plan my Austin → NYC trip like last time."',
    request: 'Plan my Austin → NYC trip like last time.',
    working: [
      'user is on mobile',
      'results page still loading',
    ],
    candidates: [
      {
        id: 'c-seat', store: 'semantic', key: 'seat',
        text: 'prefers aisle seat', stated: '"I might prefer aisle"',
        confirmed: false,
      },
      {
        id: 'c-morning', store: 'semantic', key: 'departure',
        text: 'flights before 10 AM', stated: '"yes — always morning flights"',
        confirmed: true,
      },
      {
        id: 'c-price', store: 'semantic', key: 'price',
        text: 'NYC flight price today: $312', stated: 'fare result: $312',
        transient: true,
      },
      {
        id: 'c-fragment', store: 'episodic',
        fragment: 'loading spinner shown 1.2s', stated: 'UI trace: spinner 1.2s',
      },
      {
        id: 'c-rule', store: 'procedural', key: 'check-14-day-window',
        rule: 'always check the 14-day advance-purchase window',
        stated: 'rule fired once, fare was valid', worked: true,
      },
    ],
    outcome: {
      complete: true,
      summary: 'Trip booked: AUS → JFK, 8:40 AM, aisle 14C',
      tags: ['nyc', 'jfk', 'morning', 'aisle'],
    },
  },
  {
    id: 'ep-2',
    title: 'Episode 2 — "Book my usual NYC flight again." (a month later)',
    request: FOLLOW_UP_REQUEST,
    working: [
      'user is on desktop',
    ],
    candidates: [
      {
        id: 'c-seat-2', store: 'semantic', key: 'seat',
        text: 'prefers aisle seat', stated: '"aisle again, please"',
        confirmed: false,
      },
      {
        id: 'c-price-2', store: 'semantic', key: 'price',
        text: 'NYC flight price today: $404', stated: 'fare result: $404',
        transient: true,
      },
      {
        id: 'c-rule-2', store: 'procedural', key: 'check-14-day-window',
        rule: 'always check the 14-day advance-purchase window',
        stated: 'rule fired again, fare was valid', worked: true,
      },
    ],
    outcome: {
      complete: true,
      summary: 'Trip booked: AUS → JFK, 9:10 AM, aisle 21A',
      tags: ['nyc', 'jfk', 'morning', 'aisle'],
    },
  },
];

/** Run the whole transcript through a fresh system; return it plus the log. */
export function runTranscript(mode, policy = DEFAULT_POLICY) {
  const mem = new MemorySystem({ mode, policy });
  for (const ep of EPISODES) {
    mem.beginEpisode(ep.id);
    for (const w of ep.working) mem.observe(w);
    for (const c of ep.candidates) mem.write(c);
    mem.endEpisode(ep.outcome);
  }
  return mem;
}
