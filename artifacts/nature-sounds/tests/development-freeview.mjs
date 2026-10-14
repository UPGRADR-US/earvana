// Deterministic browser policy/envelope tests; no real audio devices or UI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
function environment(dev = true) {
  const cache = new Map(), timeouts = new Map(); let sequence = 0;
  const store = new Map();
  const window = {
    setInterval: () => ++sequence, clearInterval() {},
    setTimeout: callback => { const id = ++sequence; timeouts.set(id, callback); return id; },
    clearTimeout: id => timeouts.delete(id), addEventListener() {},
  };
  const globals = { window, document: { addEventListener() {} }, sessionStorage: {
    getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value),
  } };
  function load(name) {
    if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => false } };
    name = name.split('/').at(-1);
    if (cache.has(name)) return cache.get(name);
    const exports = {}; cache.set(name, exports);
    const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8').replaceAll('import.meta.env.DEV', String(dev));
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(code, { ...globals, exports, require: load });
    return exports;
  }
  const { playbackUsage: usage } = load('playbackUsage');
  const policyModule = load('developmentFreeview'), policy = policyModule.developmentFreeview;
  const { FreeviewInstance } = load('freeviewInstance');
  const handlers = new Set();
  class Gain {
    events = []; disconnected = false;
    gain = { value: 1, setValueAtTime: (level, time) => this.events.push(['set', level, time]),
      linearRampToValueAtTime: (level, time) => this.events.push(['ramp', level, time]),
      cancelScheduledValues: time => this.events.push(['cancel', time]) };
    connect(output) { this.output = output; } disconnect() { this.disconnected = true; }
  }
  const context = { currentTime: 0, state: 'running', createGain: () => new Gain(),
    addEventListener: (name, handler) => handlers.add(handler), removeEventListener: (name, handler) => handlers.delete(handler) };
  function state(value) { context.state = value; for (const handler of [...handlers]) handler(); }
  function instance(track = 'ocean_high_tide_beach', start = context.currentTime, duration = 500) {
    const token = {}, legacy = new Gain(), stops = []; let finished = 0;
    const source = { stop: time => stops.push(time), disconnect() {}, buffer: { duration } };
    const instance = new FreeviewInstance(track, context, legacy, token, () => finished++);
    usage.begin(token, track, context, start, start + duration);
    instance.source(source, start, start + duration);
    return { instance, token, source, stops, legacy, finished: () => finished };
  }
  function timers() { for (const [id, callback] of [...timeouts]) { timeouts.delete(id); callback(); } }
  return { policy, policyModule, usage, context, instance, state, timers, window };
}
{
  const env = environment();
  assert.equal(env.policy.enabled, false);
  assert.equal(env.policyModule.isFreeviewExhaustion({ code: 'FREEVIEW_EXHAUSTED' }), true);
  assert.equal(env.policyModule.isFreeviewExhaustion(new Error('unrelated')), false);
  const normal = env.instance(); env.context.currentTime = 100; env.policy.tick();
  assert.equal(env.policy.reject('ocean_high_tide_beach'), false);
  assert.equal(normal.stops.length, 0); assert.equal(normal.instance.gain.events.length, 0);
}
{
  const catalog = {};
  const source = readFileSync(new URL('../src/sounds.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports: catalog });
  const env = environment(); env.policy.configure(true);
  const tracks = catalog.CATEGORIES.flatMap(category => category.tracks);
  const instances = tracks.map(track => [track.id, env.instance(track.id)]);
  env.context.currentTime = 60; env.policy.tick();
  for (const [id, instance] of instances) { assert.equal(env.policy.reject(id), true, id); assert.equal(instance.finished(), 0); }
  assert.equal(env.policy.midpointExpirationTrackIds().length, 0);
  env.context.currentTime = 60.499; env.timers();
  assert.equal(env.policy.midpointExpirationTrackIds().length, 0);
  env.context.currentTime = 60.5; env.timers();
  for (const [id, instance] of instances) { assert(env.policy.midpointExpirationTrackIds().includes(id)); assert.equal(instance.finished(), 0); }
  env.context.currentTime = 61; env.timers();
  for (const [id, instance] of instances) { assert.equal(instance.finished(), 1, id); assert(env.policy.midpointExpirationTrackIds().includes(id)); }
  console.log(`PASS all ${tracks.length} canonical soundscapes, including High Tide Beach`);
}
{
  const env = environment(false); env.policy.configure(true);
  assert.equal(env.policy.enabled, false); // production web cannot enable enforcement
}
{
  const env = environment(); env.policy.configure(true);
  const high = env.instance('ocean_high_tide_beach', 0.04);
  assert.deepEqual(high.instance.gain.events.at(-1), ['ramp', 0, 61.04]);
  env.context.currentTime = 60.04; env.policy.tick();
  assert.equal(env.policy.reject('ocean_high_tide_beach'), true);
  env.context.currentTime = 100; // background cleanup throttled: audio stop was scheduled at 61.04
  assert.ok(Math.abs(env.usage.snapshot().secondsByTrack.ocean_high_tide_beach - 61) < 1e-9);
  env.timers(); assert.equal(high.finished(), 1);
  assert.equal(high.legacy.events.length, 0); // original gain never touched
}
{
  const env = environment(); env.policy.configure(true); const a = env.instance('short-loop', 0, 5);
  env.context.currentTime = 100; env.timers(); // scheduler silence: only five seconds were heard
  assert.equal(a.finished(), 0); assert.equal(env.policy.reject('short-loop'), false);
  assert.equal(env.usage.snapshot().secondsByTrack['short-loop'], 5);
  assert.deepEqual(a.instance.gain.events.at(-1), ['ramp', 0, 156]);
}
{
  const env = environment(); env.policy.configure(true); const a = env.instance();
  env.context.currentTime = 59.8; a.instance.yieldToExistingAction(); env.usage.tail(a.token, 0.75);
  const events = a.instance.gain.events.length;
  env.context.currentTime = 60.6; env.policy.tick(); env.timers();
  assert.equal(env.policy.reject('ocean_high_tide_beach'), true);
  assert.equal(a.finished(), 0); assert.equal(a.instance.gain.events.length, events);
  assert.equal(env.usage.snapshot().secondsByTrack.ocean_high_tide_beach, 60.55);
  a.instance.dispose(); // existing pause cleanup owns release, not Freeview
}
{
  const env = environment(); env.policy.configure(true); const old = env.instance();
  env.context.currentTime = 59.8; old.instance.yieldToExistingAction(); env.usage.tail(old.token, 0.75);
  env.context.currentTime = 59.9; const resumed = env.instance();
  env.context.currentTime = 60; env.policy.tick();
  assert.ok(Math.abs(env.usage.snapshot().secondsByTrack.ocean_high_tide_beach - 60) < 1e-9);
  assert.equal(env.policy.reject('ocean_high_tide_beach'), true);
  assert.equal(old.finished(), 0); assert.equal(resumed.finished(), 0);
}
{
  const env = environment(); env.policy.configure(true); const outgoing = env.instance('ocean_high_tide_beach');
  env.context.currentTime = 59; outgoing.instance.yieldToExistingAction(); env.usage.tail(outgoing.token, 2.25);
  const incoming = env.instance('forest');
  env.usage.source(incoming.token, 59.5, 560); // internal overlap union
  env.context.currentTime = 61.25; env.policy.tick(); env.timers();
  assert.equal(env.policy.reject('ocean_high_tide_beach'), true);
  assert.equal(env.usage.snapshot().secondsByTrack.forest, 2.25);
  assert.equal(incoming.finished(), 0); assert.equal(outgoing.finished(), 0);
  outgoing.instance.dispose();
  assert.equal(incoming.instance.gain.disconnected, false);
}
{
  const env = environment(); env.policy.configure(true); const old = env.instance('old');
  env.context.currentTime = 59.9; old.instance.yieldToExistingAction(); env.usage.tail(old.token, 0); old.instance.dispose();
  const replacement = env.instance('replacement'); env.context.currentTime = 62; env.timers();
  assert.equal(old.finished(), 0); assert.equal(replacement.finished(), 0); // no stale stop
}
{
  const env = environment(); env.policy.configure(true); const a = env.instance();
  env.context.currentTime = 30; env.state('suspended'); env.context.currentTime = 100; env.usage.snapshot();
  env.state('running');
  assert.deepEqual(a.instance.gain.events.at(-1), ['ramp', 0, 131]);
  env.context.currentTime = 130; env.policy.tick(); assert.equal(env.policy.reject('ocean_high_tide_beach'), true);
}
{
  const env = environment(); env.policy.configure(true); const a = env.instance();
  env.context.currentTime = 60.5; env.policy.tick(); env.state('suspended');
  env.context.currentTime = 80; env.state('running');
  assert.equal(a.finished(), 1); // exhausted recovery never restarts a stopped track
}
{
  const env = environment(); env.policy.configure(true); const a = env.instance();
  env.context.currentTime = 60.5; env.policy.subscribed = true; env.policy.tick();
  assert.equal(env.policy.reject('ocean_high_tide_beach'), false); assert.equal(a.stops.at(-1), 500);
  assert.deepEqual(a.instance.gain.events.at(-1), ['set', 1, 60.5]);
  env.context.currentTime = 90; env.timers(); assert.equal(a.finished(), 0);
  env.policy.subscribed = false; env.policy.tick(); assert.equal(env.policy.reject('ocean_high_tide_beach'), true);
  env.policy.configure(false); assert.equal(env.policy.reject('ocean_high_tide_beach'), false);
}
{
  const env = environment(); env.policy.configure(true); const a = env.instance();
  env.context.currentTime = 40; a.instance.yieldToExistingAction(); // sleep timer already fading
  env.context.currentTime = 70; env.policy.tick(); env.timers(); assert.equal(a.finished(), 0);
  assert.equal(env.policy.reject('ocean_high_tide_beach'), true);
  a.instance.cancelExistingTimerFade(); assert.deepEqual(a.instance.gain.events.at(-1), ['ramp', 0, 71]);
}
console.log('PASS web Stage 2: default-off/release gate, 60s latch, 1s independent envelope, pause, switches/tails, loop union, stale-instance protection, background deadlines, interruption, subscriber bypass, sleep precedence');

assert(environment().window.EarphoriaDevelopmentFreeview);
assert.equal(environment(false).window.EarphoriaDevelopmentFreeview, undefined);
console.log("PASS release does not export the developer-console control.");
