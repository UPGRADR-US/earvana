import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
const root = new URL('../src/', import.meta.url);
function code(path, dev) {
  return ts.transpileModule(readFileSync(new URL(path, root), 'utf8').replaceAll('import.meta.env.DEV', String(dev)).replaceAll('import.meta.env.PROD', String(!dev)).replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
async function bootstrap(dev, native, search) {
  const events = [], exports = {};
  vm.runInNewContext(code('main.tsx', dev), {
    exports, URLSearchParams,
    window: { location: { search }, screen: {}, addEventListener() {} },
    document: { getElementById: () => ({}) }, navigator: {},
    require(name) {
      if (name === 'react-dom/client') return { createRoot: () => ({ render: () => events.push('mount') }) };
      if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => native, getPlatform: () => 'ios' } };
      if (name.endsWith('developmentFreeview')) return { configureDevelopmentFreeview: async enabled => events.push(`enabled:${enabled}`) };
      if (name === 'react/jsx-runtime') return { jsx: () => ({}) };
      return {};
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return events;
}
assert.deepEqual(await bootstrap(true, false, '?freeviewTest=1'), ['enabled:true', 'mount']);
for (const config of [[false,false,'?freeviewTest=1'],[true,true,'?freeviewTest=1'],[true,false,''],[true,false,'?freeviewTest=0']]) {
  assert.deepEqual(await bootstrap(...config), ['mount']);
}
function observer(dev = true, native = false) {
  let state = null, effect, cleanup, callback;
  let usage = {}, reads = 0;
  const policy = { enabled: true, subscribed: false, observe: fn => { callback = fn; return () => { callback = undefined; }; }, midpointExpirationTrackIds: () => [], status: () => ({ exhaustedTrackIds: [] }) };
  const exports = {};
  vm.runInNewContext(code('components/earphoria-layout/FreeviewTestBar.tsx', dev), {
    exports,
    window: { addEventListener() {}, removeEventListener() {} }, document: { addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === 'react/jsx-runtime') { const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props }); return { jsx, jsxs: jsx }; }
      if (name.endsWith('/FreeviewBar')) { const barExports = {}; vm.runInNewContext(code('components/earphoria-layout/FreeviewBar.tsx',dev), { exports: barExports, require: name => name === 'react' ? { useRef: value => ({current:value}), useEffect() {} } : name === 'react/jsx-runtime' ? {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})} : {} }); return barExports; }
      if (name === 'react') return { useRef: value => ({current: value}), useState: () => [state, value => { state = typeof value === 'function' ? value(state) : value; }], useEffect: fn => { effect = fn; } };
      if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => native } };
      if (name.endsWith('developmentFreeview')) return { developmentFreeview: policy };
      if (name.endsWith('playbackUsage')) return { playbackUsage: { snapshot: () => { reads++; return { secondsByTrack: { ...usage } }; } } };
      return {};
    },
  });
  return { exports, policy, get state() { return state; }, get reads() { return reads; },
    select(id) { cleanup?.(); exports.useFreeviewTestSnapshot(id); cleanup = effect(); },
    setUsage(value) { usage = value; callback?.(); }, dispose() { cleanup?.(); },
  };
}
const ui = observer();
ui.select('ocean_hightide'); assert.equal(ui.state.countdown, ':60'); assert.equal(ui.state.isCountingDown, false);
ui.setUsage({ ocean_hightide: 12.3, ocean_lowtide: 4 }); assert.equal(ui.state.countdown, ':48'); assert.equal(ui.state.isCountingDown, true);
ui.setUsage({ ocean_hightide: 12.3, ocean_lowtide: 4 }); assert.equal(ui.state.isCountingDown, false); // no advancing audio clock
ui.select('ocean_lowtide'); assert.equal(ui.state.countdown, ':56');
ui.select('ocean_hightide'); assert.equal(ui.state.countdown, ':48');
ui.setUsage({ ocean_hightide: 60.2 }); assert.equal(ui.state.isCountingDown, false); assert.equal(ui.state.countdown, ':00'); assert(ui.state.exhaustedTrackIds.has('ocean_hightide'));
ui.policy.subscribed = true; ui.setUsage({ ocean_hightide: 60.2 }); assert.equal(ui.state, null);
ui.policy.subscribed = false; ui.policy.enabled = false; ui.setUsage({ ocean_hightide: 60.2 }); assert.equal(ui.state, null);
for (const config of [[false,false],[true,true]]) { const hidden = observer(...config); hidden.select('ocean_hightide'); assert.equal(hidden.state, null); assert.equal(hidden.reads, 0); }
assert.equal(ui.exports.formatFreeviewCountdown(59.001), ':01');
assert.equal(ui.exports.formatFreeviewCountdown(60), ':00');
ui.dispose();
console.log('PASS test UI: opt-in enable-before-mount, production/native exclusion, per-track return countdown, exhaustion, subscriber/disabled hiding, cleanup');

// Explicit fresh-test bootstrap is isolated from Stage 1/2 and billing.
function freshBootstrap(dev, native, query) {
  const exports = {}, storage = new Map([['earphoria.playbackUsage.v1', '{"ocean_high_tide_beach":65}'], ['other-setting', 'preserve']]);
  const events = [], location = { href: `http://localhost:5173/${query}`, search: query, assign: url => events.push(['navigate', url]) };
  vm.runInNewContext(code('lib/freeviewTestBootstrap.ts', dev), {
    exports, URL, URLSearchParams,
    sessionStorage: { removeItem: key => { events.push(['clear', key]); storage.delete(key); } },
    window: { location, history: { state: { keep: true }, replaceState: (state, _, url) => events.push(['consume', state.keep, String(url)]) } },
    require: () => ({ Capacitor: { isNativePlatform: () => native } }),
  });
  return { exports, storage, events };
}
const fresh = freshBootstrap(true, false, '?freeviewTest=1&freeviewReset=1');
assert(!fresh.storage.has('earphoria.playbackUsage.v1')); assert.equal(fresh.storage.get('other-setting'), 'preserve');
assert.equal(fresh.events[1][2], 'http://localhost:5173/?freeviewTest=1');
for (const config of [[true,false,'?freeviewTest=1'],[true,false,'?freeviewReset=1'],[false,false,'?freeviewTest=1&freeviewReset=1'],[true,true,'?freeviewTest=1&freeviewReset=1']]) {
  const retained = freshBootstrap(...config); assert(retained.storage.has('earphoria.playbackUsage.v1')); assert.equal(retained.events.length, 0);
}
const request = freshBootstrap(true, false, '?freeviewTest=1'); request.exports.startFreshFreeviewTest();
assert.equal(request.events[0][1], 'http://localhost:5173/?freeviewTest=1&freeviewReset=1');
const mainSource = readFileSync(new URL('main.tsx', root), 'utf8');
assert(mainSource.indexOf('import "./lib/freeviewTestBootstrap"') < mainSource.indexOf('import App'));
console.log('PASS fresh-test bootstrap: explicit one-shot pre-import reset, normal reload retention, unrelated storage preserved, production/native exclusion');


const rendering = observer().exports;
const tree = rendering.FreeviewTestBar({ snapshot: { isCountingDown: true }, isPlaying: true, onSubscribe() {} });
const bar = tree.props.children[0];
assert.equal(bar.props.children[0].props.children.props.src, '/FreeviewBar-v5.png');
assert.equal(bar.props.children[0].props.children.props.height, 388);
assert.equal(bar.props.children[1].props.children[0].props.children.props.children, 'Freeview Mode');
const sharedExports = {};
vm.runInNewContext(code('components/earphoria-layout/shared.tsx', true), {
 exports: sharedExports,
 require(name) { if (name === 'react/jsx-runtime') { const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props }); return { jsx, jsxs: jsx }; } return {}; },
});
const A = 'ocean_high_tide_beach', B = 'ocean_low_tide_beach';
function rows(playing, current, usage, exhausted = new Set()) {
 return sharedExports.TrackList({ categoryIndex: 0, selected: current === A ? 0 : 1, playing, paused: !playing, recommendedTrackIds: new Set(), freeviewCountdownByTrack: usage, freeviewPlayingTrackId: current, exhaustedTrackIds: exhausted, onSelect() {} }).props.children;
}
const countdown = row => row.props.children.find(child => child?.props?.['data-testid'] === 'freeview-track-countdown');
const highlight = row => row.props.children.find(child => child?.props?.['data-testid'] === 'freeview-playing-highlight');
let result = rows(true, A, {});
assert.equal(highlight(result[0]).props.src, '/TrackHilite-Green.png');
assert.equal(countdown(result[0]).props.children, ':60'); assert(!countdown(result[1]));
result = rows(true, B, { [A]: ':40', [B]: ':59' });
assert(!highlight(result[0])); assert(highlight(result[1]));
assert.equal(countdown(result[0]).props.children, ':40');
assert(!countdown(result[0]).props.className.includes('is-current'));
assert(countdown(result[1]).props.className.includes('is-current'));
result = rows(false, null, { [A]: ':40', [B]: ':59' });
assert(!highlight(result[0])); assert(!highlight(result[1]));
assert.equal(countdown(result[0]).props.children, ':40'); assert.equal(countdown(result[1]).props.children, ':59');
result = rows(true, A, { [A]: ':40', [B]: ':59' }); assert(highlight(result[0]));
result = rows(false, null, { [A]: ':00', [B]: ':59' }, new Set([A]));
assert(!highlight(result[0])); assert.equal(countdown(result[0]).props.children, ":00"); assert(countdown(result[0]).props.className.includes("is-exhausted")); assert(result[0].props.className.includes('eh-freeview-exhausted'));
assert.equal(countdown(result[1]).props.children, ':59');
const observed = observer(); observed.select(A); observed.setUsage({ [A]: 20, [B]: 5 });
assert.equal(observed.state.countdownByTrack[A], ':40'); assert.equal(observed.state.countdownByTrack[B], ':55');
observed.setUsage({ [A]: 20, [B]: 6 }); assert.equal(observed.state.countdownByTrack[A], ':40'); assert.equal(observed.state.countdownByTrack[B], ':54');
observed.setUsage({ [A]: 20, [B]: 6 }); assert.equal(observed.state.countdownByTrack[B], ':54');
const css = readFileSync(new URL('components/earphoria-layout/freeview-test.css', root), 'utf8');
assert(!css.includes('@keyframes freeviewSharedPulse'));
assert(css.includes('var(--eh-master-dim, 0)'));
assert(!css.includes('@keyframes freeviewTrackCountdown'));
assert(css.includes('color: #85898e; opacity: .85; text-shadow: 0 0 1px #85898e'));
assert(css.includes('animation: none; transition: none; opacity: var(--eh-freeview-pulse, 1)'));
assert(css.includes('opacity: var(--eh-freeview-pulse, 1)'));
console.log('PASS Stage 7B: no bar timer, immediate green, per-track :60 formatting, switch/pause/resume values, independent resting pulse, expiration removes highlight and retains steady zero, other allowance preserved');

const clockExports = {};
vm.runInNewContext(code('lib/sharedBlinkClock.ts', false), { exports: clockExports, window: {}, require: () => ({ Capacitor: {} }) });
for (const ms of [0, 1000, 2000]) assert(clockExports.blinkValues(ms).dim < 1e-10);
assert(clockExports.blinkValues(500).dim > .999999);
assert(Math.abs(clockExports.blinkValues(375).dim - .5) < 1e-6);
assert.equal(clockExports.blinkValues(250).freeview, 1);
assert.equal(clockExports.blinkValues(375).freeview, .75);
assert.equal(clockExports.blinkValues(750).freeview, .5);
assert.equal(clockExports.blinkValues(875).freeview, .75);
for (let ms = 0; ms <= 1000; ms++) {
 const value = clockExports.blinkValues(ms);
 assert(value.freeview >= .5 && value.freeview <= 1);
 assert.equal(value.freeview, 1 - .5 * value.dim);
 if (ms) assert(Math.abs(value.freeview - clockExports.blinkValues(ms - 1).freeview) <= .002000001);
}
assert.equal(clockExports.blinkValues(500).freeview, .5);
assert.equal(clockExports.blinkValues(1000).freeview, 1);
console.log('PASS master clock: 1s cycle, shared 250ms linear down/up ramps and endpoint holds, 85% expired title, no independent CSS blink clock');

let pendingFrame, startedFrames = 0;
const props = new Map(), classes = new Set();
const visualWindow = { location: { search: '?freeviewTest=1' }, matchMedia: () => ({ matches: false }), requestAnimationFrame: fn => { startedFrames++; pendingFrame = fn; } };
const visualContext = { exports: {}, window: visualWindow, document: { documentElement: { classList: { add: x => classes.add(x) }, style: { setProperty: (k, v) => props.set(k, v) } } }, performance: { now: () => 100 }, URLSearchParams, require: () => ({ Capacitor: { isNativePlatform: () => false } }) };
vm.runInNewContext(code('lib/sharedBlinkClock.ts', true), visualContext);
visualContext.exports.startSharedBlinkClock();
assert.equal(startedFrames, 1);
pendingFrame(600); assert.equal(props.get('--eh-freeview-pulse'), '0.5');
const beforeRemount = startedFrames;
const remountClock = { ...visualContext, exports: {} };
vm.runInNewContext(code('lib/sharedBlinkClock.ts', true), remountClock);
remountClock.exports.startSharedBlinkClock();
assert.equal(startedFrames, beforeRemount); // a remount/HMR import cannot start another clock
pendingFrame(1100); assert.equal(props.get('--eh-freeview-pulse'), '1');
console.log('PASS master lifetime: singleton survives remount/import and samples resumed elapsed phase');

assert(!css.includes('.eh-app.is-freeview-bar-pulsing .eh-freeview-art-effects'));
assert(css.includes('.eh-freeview-track-countdown.is-exhausted { color: #85898e; opacity: .85; text-shadow: 0 0 1px #85898e; animation: none; transition: none; }'));
const ctaWords = bar.props.children[1].props.children[1].props.children[0].props.children;
assert.equal(ctaWords[0].type, 'strong');
assert.equal(ctaWords[0].props.children, 'Turn On');
assert.equal(ctaWords[2].props.children, 'Unlimited Playback');
assert.equal(ctaWords[2].props.className, 'eh-freeview-subscribe-light');
assert.equal(ctaWords[0].props.children + ctaWords[1] + ctaWords[2].props.children, 'Turn On Unlimited Playback');
console.log('PASS steady bar/shadow, steady exhausted :00, CTA capitalization');

function pausedRows(categoryIndex, pausedId, exhaustedTrackIds = new Set()) {
 return sharedExports.TrackList({ categoryIndex, selected: 0, playing: false, paused: true, recommendedTrackIds: new Set(), freeviewCountdownByTrack: { [A]: ':40', [B]: ':55' }, freeviewPausedTrackId: pausedId, exhaustedTrackIds, onSelect() {} }).props.children;
}
const yellow = row => row.props.children.find(child => child?.props?.['data-testid'] === 'freeview-paused-highlight');
const frontPause = pausedRows(0, A);
assert.equal(yellow(frontPause[0]).props.src, '/TrackHilite-Yellow.png');
assert.equal(countdown(frontPause[0]).props.children, ':40');
assert(!yellow(frontPause[1])); assert(!highlight(frontPause[0]));
assert(pausedRows(1, A).every(row => !yellow(row)));
assert(!yellow(pausedRows(0, A, new Set([A]))[0]));
assert(highlight(rows(true, A, { [A]: ':40' })[0]));
console.log('PASS paused highlight: front-facing identity only, original yellow, saved countdown, off-course suppression, expired suppression, resumed green');

assert(countdown(frontPause[0]).props.className.includes('is-current'));
assert(!countdown(frontPause[1]).props.className.includes('is-current'));
assert(pausedRows(1, A).every(row => !countdown(row)?.props.className.includes('is-current')));
assert(css.includes('animation: none; transition: none; opacity: 1;\n  pointer-events: none;'));
console.log('PASS Stage 7I: only playing/front-facing paused countdown follows master; inactive countdowns steady, expired steady zero');
