import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const panel=fs.readFileSync(new URL('../src/DiagnosticsPanel.tsx',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const initial=panel.slice(panel.indexOf('  const initialSelectedFrequency ='),panel.indexOf('  // the frequency anchored'));
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
for(const selectedFrequency of [null,2000])for(const showInstructionsInitially of [true,false]){
 const state={selectedFrequency,showInstructionsInitially,currentNotch:selectedFrequency,currentBoost:null,developmentSelectBoundary:undefined,useState:value=>[typeof value==='function'?value():value,()=>{}]};
 vm.runInNewContext(compile(initial+'\nthis.pageResult=page;this.savedResult=initialSelectedFrequency;'),state);
 assert.equal(state.pageResult,selectedFrequency === null ? 1 : "stat");assert.equal(state.savedResult,selectedFrequency);
}
for (const currentNotch of [null, 3500]) {
 const state={selectedFrequency:null,currentNotch,currentBoost:null,developmentSelectBoundary:undefined,useState:value=>[typeof value==='function'?value():value,()=>{}]};
 vm.runInNewContext(compile(initial+'\nthis.pageResult=page;this.savedResult=initialSelectedFrequency;'),state);
 assert.equal(state.pageResult,currentNotch === null ? 1 : 'stat');
 assert.equal(state.savedResult,currentNotch);
}
const start=app.indexOf('  const openDiag = useCallback('),end=app.indexOf('  // Called when user clicks START TEST',start);
for(let visit=0;visit<4;visit++){
 const calls=[];const context={useCallback:fn=>fn,ringMatchFreeviewPreview:true,previewFreeUser:false,subscription:{isSubscribed:false},isPremiumFeatureLocked:()=>false,setSubscriptionInvite:v=>calls.push(['invite',v]),setDiagShowInstructions:v=>calls.push(['instructions',v]),setDiagOpen:v=>calls.push(['open',v])};
 vm.runInNewContext(app.slice(start,end)+'\nthis.enter=openDiag;',context);context.enter();
 assert.deepEqual(calls,[['instructions',true],['open',true]]);
}
const startClick=panel.match(/onClick=\{\(\) => \{ onStartTest\?\.\(\); ([^\n]+?) \}\}/)[1];
const acknowledge=panel.match(/onClick=\{\(\) => \{ setShowCaution\(false\); ([^\n]+?) \}\}/)[1];
for(const scenario of ['first visit','exit/re-entry','after audition','after warning close']){
 let acknowledged=false,warning=false,page=1,timer;
 const context={setCautionAcknowledged:v=>acknowledged=v,setPage:v=>page=v,setShowCaution:v=>warning=v,setTimeout:(fn,ms)=>{assert.equal(ms,380);timer=fn;}};
 vm.runInNewContext(startClick,context);assert.equal(page,2);assert(!acknowledged); // tone list remains inert before warning animates
 timer();assert(warning);assert(!acknowledged);
 vm.runInNewContext('setShowCaution(false);'+acknowledge,context);assert(!warning);assert(acknowledged);
}
assert(panel.includes('inert={!cautionAcknowledged || showCaution}'));
assert(panel.includes('useState(0.20)'));
assert(!app.includes('diagHasOpened'));
console.log('PASS unsaved entry starts page 1, saved entry opens Status, saved frequencies retained, repeat-entry scenarios, original 380ms warning delay, tones gated until acknowledgment, 20% volume default unchanged.');

const repeat=panel.slice(panel.indexOf('  const handleRepeatTest ='),panel.indexOf('  // "reset >>"'));
let timer,ack=true,page='stat';const repeatCalls=[];
const repeatContext={setStatDismissing:v=>repeatCalls.push(['dismiss',v]),setTimeout:(fn,ms)=>{assert.equal(ms,200);timer=fn;},setCautionAcknowledged:v=>ack=v,handleShowInstructions:()=>{page=1;repeatCalls.push(['instructions']);}};
vm.runInNewContext(repeat+'\nthis.repeat=handleRepeatTest;',repeatContext);repeatContext.repeat();timer();
assert.equal(page,1);assert.equal(ack,false);assert.deepEqual(repeatCalls,[['dismiss',true],['dismiss',false],['instructions']]);
const reset=panel.slice(panel.indexOf('  const handleReset ='),panel.indexOf('  const handleShowInstructions ='));
const resetCalls=[];let resetTimer;
const resetContext={statDismissing:false,setStatDismissing:v=>resetCalls.push(['dismiss',v]),window:{setTimeout:(fn,ms)=>{assert.equal(ms,200);resetTimer=fn;}},onNotch:v=>resetCalls.push(['notch',v]),onBoost:v=>resetCalls.push(['boost',v]),setStatFreq:v=>resetCalls.push(['saved',v]),stopTone:()=>resetCalls.push(['stop']),onResetRingMatch:()=>resetCalls.push(['reset']),onClose:()=>resetCalls.push(['close'])};
vm.runInNewContext(reset+'\nthis.reset=handleReset;',resetContext);resetContext.reset();resetTimer();
assert.deepEqual(resetCalls,[['dismiss',true],['notch',null],['boost',null],['saved',null],['stop'],['reset'],['close']]);
console.log('PASS original Status entry and mode fallback, Repeat Test returns through instructions/warning, original Reset ordering and 200ms transition unchanged.');
