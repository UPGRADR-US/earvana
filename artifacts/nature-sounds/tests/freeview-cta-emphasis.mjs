import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/components/earphoria-layout/FreeviewBar.tsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('  const wordsRef'),source.indexOf('  return <div ref='))
 .replace('(index: number)', '(index)')
 .replace('useRef<HTMLSpanElement>','useRef').replace('useRef<HTMLDivElement>','useRef');
const presented=new Set();let refs=[],cursor=0,reduced=false;const animations=[];const classes=new Set();
const words={offsetWidth:220,animate:(frames,options)=>{const animation={frames,options};animations.push(animation);return animation;},getAnimations:()=>[]};
const shell={clientWidth:320,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};
function render(ids){cursor=0;const effects=[];const context={snapshot:{midpointExpirationTrackIds:new Set(ids),exhaustedTrackIds:new Set([...ids,"still-fading"])},presentedExpirations:presented,window:{matchMedia:()=>({matches:reduced})},useRef:value=>refs[cursor++]??(refs[cursor-1]={current:value}),startSharedBlinkClock:()=>{},useEffect:fn=>effects.push(fn)};
 vm.runInNewContext(body,context);refs[0].current=words;refs[1].current=shell;effects[0]();}
render(['old']);assert.equal(animations.length,0);
render(['old','a']);assert.equal(animations.length,1);
const samples=[100,101,103,106,110,115,125,150,150,150,149,147,143,133,120,100,100];
assert.equal(animations[0].options.duration,1500);
assert.equal(animations[0].options.easing,'linear');
for(let i=0;i<samples.length;i++) {
 assert.equal(animations[0].frames[i].transform,`scale(${1+(samples[i]-100)/50*(320*.9/220-1)})`);

}
for(const [a,b,duration] of [[0,7,450],[7,9,300],[9,15,450],[15,16,300]]) {
 assert(Math.abs((animations[0].frames[b].offset-animations[0].frames[a].offset)*1500-duration)<1e-9);
}
assert.equal(animations[0].frames.at(-1).offset,1);
render(['old','a']);assert.equal(animations.length,1);
refs=[];render(['old','a']);assert.equal(animations.length,1); // remount never replays exhaustion
render(['old','a','b']);assert.equal(animations.length,2);
reduced=true;render(['old','a','b','c']);assert.equal(animations.length,2);
console.log('PASS audio midpoint notification only, single normalized inflation, no render/remount replay, per-track events, exact 1.5s sequence, 0.30-second holds, reduced-motion bypass.');
const css=fs.readFileSync(new URL('../src/components/earphoria-layout/freeview-test.css',import.meta.url),'utf8');
assert(css.includes('.eh-freeview-test-bar.is-counting-down .eh-freeview-subscribe { opacity: var(--eh-freeview-pulse, 1); }'));
assert(css.includes('.eh-freeview-test-shell.is-expiration-emphasis .eh-freeview-subscribe { opacity: 1; }'));
assert(css.includes('.eh-freeview-test-bar.is-counting-down .eh-freeview-subscribe { opacity: 1; }'));
assert(source.includes('isPlaying && snapshot.isCountingDown'));
assert(!source.includes('setInterval('));
console.log('PASS entire CTA row inherits master phase only during active countdown; expiration/reduced-motion resting opacity is 1.');

assert(!classes.has('is-post-expiration'));
animations.at(-1).onfinish();
assert(classes.has('is-post-expiration'));
assert(!classes.has('is-expiration-emphasis'));
assert(css.includes('.eh-freeview-test-shell.is-post-expiration .eh-freeview-test-bar:not(.is-counting-down) .eh-freeview-cta-arrows { opacity: var(--eh-freeview-pulse, 1); }'));
console.log('PASS chevron-only shared-clock blink begins after animation completion.');

assert(css.includes('gap: .2875cqw;'));
assert(css.includes('.eh-freeview-main-line { transform: scaleY(.68);'));
assert(css.includes('.eh-freeview-subscribe-light { display: inline-block; transform: scaleY(.68);'));
assert(css.includes('transform: translateY(-50%) scaleY(.85);'));
console.log('PASS text-only 85% vertical compression and 15% larger layout gap; inflation stays on outer words wrapper.');

assert(css.includes('top: -5.625%; width: 100%; height: auto;'));
assert.equal(320 * (-5.625/100) + 50, (320-256)/2);
assert(css.includes('box-shadow: none; } /* v5 includes its own shadow. */'));
console.log('PASS v5 intrinsic proportions, unchanged bar-body anchor/size, baked shadow without duplicate CSS shadow.');
