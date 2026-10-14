// Run from repository root: node artifacts/nature-sounds/tests/passive-playback-usage.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/lib/playbackUsage.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const storage = new Map();
function session() {
  const listeners = {};
  const window = { setInterval() {}, addEventListener(name, callback) { listeners[name] = callback; } };
  const context = { exports: {}, window, document: { addEventListener() {} }, sessionStorage: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)
  } };
  vm.runInNewContext(compiled, context);
  return { usage: context.exports.playbackUsage, listeners, context };
}
const { usage, listeners, context } = session();
let stateChange;
const clock = { currentTime: 0, state: 'running', addEventListener(name, handler) { stateChange = handler; } };
const high = {}, next = {};
usage.begin(high, 'ocean_high_tide_beach', clock, 0.04, 10);
clock.currentTime = 1;
assert.equal(usage.snapshot().secondsByTrack.ocean_high_tide_beach, 0.96);
usage.source(high, 0.5, 12); // internal loop overlap must count once
clock.currentTime = 2;
assert.equal(usage.snapshot().secondsByTrack.ocean_high_tide_beach, 1.96);
usage.begin(next, 'forest', clock, 2, 20);
usage.tail(high, 2.25);
clock.currentTime = 5;
let totals = usage.snapshot().secondsByTrack;
assert.equal(totals.ocean_high_tide_beach, 4.21);
assert.equal(totals.forest, 3);
usage.snapshot(); // suspended clock / repeated read: no added time
assert.equal(usage.snapshot().secondsByTrack.forest, 3);
vm.runInNewContext(compiled, { ...context, exports: {} }); // module remount preserves owner
assert.equal(context.window.__earphoriaPlaybackUsage, usage);
listeners.pagehide();
assert.equal(session().usage.snapshot().secondsByTrack.forest, 3); // reload preserves totals, not stale playback
clock.currentTime = 6;
assert.equal(usage.snapshot().secondsByTrack.forest, 4); // BFCache keeps existing observer
clock.state = 'suspended'; stateChange();
clock.currentTime = 7;
assert.equal(usage.snapshot().secondsByTrack.forest, 4); // known interruption even if clock advances
clock.state = 'running'; stateChange();
usage.tail(next, 0);
clock.currentTime = 100;
assert.equal(usage.snapshot().secondsByTrack.forest, 4);
const detached = usage.snapshot(); detached.secondsByTrack.forest = 0;
assert.equal(usage.snapshot().secondsByTrack.forest, 4);
console.log('PASS web: loading lookahead, loop union, outgoing tails, overlap, paused clock, remount/reload/BFCache, stop, detached snapshots');
