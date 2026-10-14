import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../src/components/earphoria-layout/SubscriptionPreview.tsx', import.meta.url), 'utf8');
const exports = {}, updates = []; let closed = false;
function load(file, dev=true, native=false) {
 const module = {};
 const output = ts.transpileModule(readFileSync(new URL(`../src/components/earphoria-layout/${file}.tsx`,import.meta.url),'utf8').replaceAll('import.meta.env.BASE_URL', "'/'").replaceAll('import.meta.env.DEV',String(dev)), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(output,{exports:module,require(name){
  if(name === 'react') return {useRef:value=>({current:value}),useEffect(){},useState:value=>[value,value=>updates.push(value)]};
  if(name === '@capacitor/core') return {Capacitor:{isNativePlatform:()=>native}};
  if(name === 'react/jsx-runtime') {const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});return {jsx,jsxs:jsx};}
  if(name.endsWith('/SubscriptionPopup')) return load('SubscriptionPopup',dev,native);
  if(name.endsWith('.css')) return {};
  throw Error(`Forbidden presentation dependency: ${name}`);
 }});return module;
}
Object.assign(exports,load('SubscriptionPreview'));
const tree = exports.SubscriptionPreview({ onClose: () => { closed = true; }, terms: 'Existing terms', privacy: 'Existing privacy' });
function flatten(node) { return Array.isArray(node) ? node.flatMap(flatten) : node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : []; }
const nodes = flatten(tree), buttons = nodes.filter(n => n.type === 'button');
assert(nodes.some(n => n.props?.role === 'dialog' && n.props['aria-modal']));
const cards = buttons.filter(n => n.props.className?.startsWith('eh-sub-preview-card'));
assert.equal(cards.length, 2);
for (const card of cards) card.props.onClick();
assert.deepEqual(updates, ['MONTHLY','MONTHLY','ANNUAL','ANNUAL']);
buttons.find(n=>n.props.children === 'Terms').props.onClick(); assert.equal(updates.at(-1), 'terms');
buttons.find(n=>n.props.children === 'Privacy').props.onClick(); assert.equal(updates.at(-1), 'privacy');
buttons.find(n=>n.props['aria-label'] === 'Close subscription preview').props.onClick(); assert(closed);
assert(!/subscribe\(|restore\(|debugSetSubscribed|EarphoriaBilling/.test(source));
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert(app.includes('useState(false);\n  const [subscriptionInvite'));
assert(app.includes('import.meta.env.DEV && !Capacitor.isNativePlatform() && developmentSubscriptionPreview ?'));
console.log('PASS development modal: two display-only plan controls, legal document controls, close, no billing dependency or calls, default-off web/dev trigger');

const panelArt = nodes.find(n => n.props?.className === "eh-sub-preview-art");
assert.equal(panelArt.props.src, "/C2A-window-1d.png");
assert.equal(panelArt.props.width, 1474); assert.equal(panelArt.props.height, 2106);
console.log("PASS corrected 1d artwork intrinsic dimensions");

const ringTree = exports.SubscriptionPreview({ onClose() {}, terms: 'Existing terms', privacy: 'Existing privacy', variant: 'ringmatch' });
const ringNodes = flatten(ringTree);
assert(ringNodes.some(n => n.props?.src === '/C2A-window-2b.png'));
assert.equal(ringNodes.filter(n => n.type === 'button' && n.props.className?.startsWith('eh-sub-preview-card')).length, 2);
assert(ringNodes.some(n => n.props?.className === 'eh-sub-preview-content' && n.props.tabIndex === 0));
console.log('PASS RingMatch popup: approved artwork, same display-only cards, focusable scrollable offer');

assert(ringNodes.some(n => n.props?.className === 'eh-rm-experience-word' && n.props.children === 'Experience'));
assert(ringNodes.some(n => n.props?.className === 'eh-rm-trademark' && n.props.children === '™'));
assert(ringNodes.some(n => n.props?.className === 'eh-rm-free-word' && n.props.children === 'FREE'));
const ringCards = ringNodes.filter(n => n.type === 'button' && n.props.className?.startsWith('eh-sub-preview-card'));
assert(!ringCards.flatMap(flatten).some(n => n.type === 'small' && n.props.children === '7 DAYS FREE'));
assert(cards.flatMap(flatten).some(n => n.type === 'small' && n.props.children === '7 DAYS FREE'));
console.log('PASS RingMatch 2b: styled live invitation, separate trademark, single trial statement, prices and normal popup trial labels retained');

assert.equal(load('SubscriptionPreview',false).SubscriptionPreview({onClose(){},terms:'',privacy:''}),null);
assert.equal(load('SubscriptionPreview',true,true).SubscriptionPreview({onClose(){},terms:'',privacy:''}),null);
const pureSource=readFileSync(new URL('../src/components/earphoria-layout/SubscriptionPopup.tsx',import.meta.url),'utf8');
assert(!pureSource.includes('$4.99')&&!pureSource.includes('$39.99')&&!pureSource.includes('SAVE 33%')&&!pureSource.includes('no purchase made'));
const calls=[];const offer={monthlyPrice:'Store monthly',annualPrice:'Store annual',trialDuration:null,cardTrialLabel:null,savingsLabel:null,disclosure:['Store disclosure']};
const pure=load('SubscriptionPopup',false).SubscriptionPopup({terms:'',privacy:'',offer,onDismiss:()=>calls.push('dismiss'),onMonthlyPurchase:()=>calls.push('monthly'),onAnnualPurchase:()=>calls.push('annual'),onRestorePurchases:()=>calls.push('restore')});
const pureButtons=flatten(pure).filter(n=>n.type==='button');
for(const c of pureButtons.filter(n=>n.props.className?.startsWith('eh-sub-preview-card')))c.props.onClick();
pureButtons.find(n=>Array.isArray(n.props.children)&&n.props.children[0]==='Restore Purchases ').props.onClick();
pureButtons.find(n=>n.props.className==='eh-sub-preview-close').props.onClick();
assert.deepEqual(calls,['monthly','annual','restore','dismiss']);
const unavailable=load('SubscriptionPopup',false).SubscriptionPopup({terms:'',privacy:'',offer:null,onDismiss(){},onMonthlyPurchase(){},onAnnualPurchase(){},onRestorePurchases(){}});
assert(flatten(unavailable).filter(n=>n.props.className?.startsWith('eh-sub-preview-card')).every(n=>n.props.disabled));
console.log('PASS pure production presentation callbacks and store-supplied content; missing offers disabled; mock adapter hidden in release/native.');
