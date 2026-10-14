import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/DiagnosticsPanel.tsx', import.meta.url),'utf8');
// Exercise the actual SELECT wrapper and original body, with observable protected effects.
const start=source.indexOf('  const handleSelectClick = (freq: number) => {');
const end=source.indexOf('  // Stat window: live mode change',start);
const code=source.slice(start,end).replaceAll('(freq: number)','(freq)');
function selection(blocked){const calls=[];let pending;
 const context={developmentSelectBoundary:blocked?(freq,resume)=>{pending={freq,resume};calls.push(['invite',freq]);return true;}:undefined,stopTone:()=>calls.push(['stop']),setStatFreq:f=>calls.push(['stat',f]),onSelectedFrequencyChange:f=>calls.push(['saved',f]),setStatDismissing:v=>calls.push(['dismiss',v]),setPage:p=>calls.push(['page',p])};
 vm.createContext(context);vm.runInContext(code+'\nthis.select=handleSelectClick;',context);
 return {calls,select:context.select,get pending(){return pending;}};}
const free=selection(true);free.select(4000);assert.deepEqual(free.calls,[['invite',4000],['stop']]);assert.equal(free.pending.freq,4000);
free.select(5000);assert.deepEqual(free.calls,[['invite',4000],['stop'],['invite',5000],['stop']]);assert.equal(free.pending.freq,5000);
free.pending.resume();assert.deepEqual(free.calls.slice(4),[['stop'],['stat',5000],['saved',5000],['dismiss',false],['page','confirm']]);
const subscribed=selection(false);subscribed.select(4000);assert.deepEqual(subscribed.calls,[['stop'],['stat',4000],['saved',4000],['dismiss',false],['page','confirm']]);
const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
assert(app.includes('import.meta.env.DEV && !Capacitor.isNativePlatform() && developmentFreeview.enabled'));
assert(app.includes('developmentSelectBoundary={ringMatchFreeviewPreview && !subscription.isSubscribed ?'));
assert(app.includes('pendingRingMatchSelection.current = null;\n    setDiagOpen(false);'));
assert(app.includes('pending.resume(); // Original SELECT'));
console.log('PASS RingMatch Freeview: blocked SELECT silences tone immediately and preserves frequency/state/storage, repeated SELECT captures latest frequency, real entitlement continuation uses original confirmations, subscribers unchanged, local-only gate, close invalidates pending instance');
