import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const root=new URL('../src/',import.meta.url);
const compile=(file)=>ts.transpileModule(fs.readFileSync(new URL(file,root),'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/preview/')),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function loader({warm=false,decode=true}={}) {
 const created=[],timers=new Map();let next=0;const exports={};
 class Image {constructor(){created.push(this);this.complete=warm;this.naturalWidth=warm?100:0;if(decode)this.decode=()=>new Promise((resolve,reject)=>{this.decoded=resolve;this.decodeError=reject;});}set src(v){this.url=v;}}
 vm.runInNewContext(compile('lib/homeArtworkReadiness.ts'),{exports,Image,window:{setTimeout:(fn,ms)=>{assert.equal(ms,15000);timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)}});
 return {exports,created,timers};
}
const cold=loader();let ready=false;const coldPromise=cold.exports.prepareHomeArtwork().then(()=>ready=true);
assert.equal(cold.created.length,3);assert(cold.created.every(i=>i.fetchPriority==='high'&&i.url.startsWith('/preview/earphoria-redesign/')));
for(const i of cold.created){i.naturalWidth=100;i.onload();}await Promise.resolve();assert(!ready);
for(const i of cold.created)i.decoded();await coldPromise;assert(ready);assert.equal(cold.timers.size,0);
await cold.exports.prepareHomeArtwork();assert.equal(cold.created.length,3); // warm remount uses decoded promises
const warm=loader({warm:true});const warmPromise=warm.exports.prepareHomeArtwork();for(const i of warm.created)i.decoded();await warmPromise;
const fallback=loader({warm:true,decode:false});await fallback.exports.prepareHomeArtwork();
const failed=loader();const failedPromise=failed.exports.prepareHomeArtwork();failed.created[0].onerror();await assert.rejects(failedPromise);for(const i of failed.created.slice(1)){i.naturalWidth=100;i.onload();i.decoded();}await Promise.resolve();
const retry=failed.exports.prepareHomeArtwork();assert.equal(failed.created.length,4);const retried=failed.created.at(-1);retried.naturalWidth=100;retried.onload();retried.decoded();await retry;
const stalled=loader();const stalledPromise=stalled.exports.prepareHomeArtwork();for(const fn of [...stalled.timers.values()])fn();await assert.rejects(stalledPromise);
const badDecode=loader({warm:true});const bad=badDecode.exports.prepareHomeArtwork();badDecode.created[0].decodeError(new Error('invalid'));await assert.rejects(bad);
const app=fs.readFileSync(new URL('App.tsx',root),'utf8');assert(app.includes('<Home />\n      </div>\n      <HomeStartup />')); // host stays outside the gate
const gate=fs.readFileSync(new URL('components/earphoria-layout/HomeStartup.tsx',root),'utf8');assert(gate.includes("if (state === 'ready') return <UpdatedHome />"));assert(gate.includes('role="alert"')&&gate.includes('role="status"')&&gate.includes('>Retry</button>'));
const html=fs.readFileSync(new URL('../index.html',root),'utf8');assert.equal((html.match(/rel="preload"/g)||[]).length,3);assert(!html.includes('href="/TR-bg.png"'));
console.log('PASS cold/warm image readiness, decode barrier, BASE_URL, old decode fallback, load/decode failure, bounded timeout, retry, separate mounted audio host, accessible gate, exact current preloads.');
