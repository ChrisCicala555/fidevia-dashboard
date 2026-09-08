// Open every form, for real.
//
// The RFI button did nothing for weeks: openModal threw on a `sel` left behind
// when Goes To stopped being a dropdown, so the function never reached the line
// that shows the dialog. Every test we had matched source text, and source text
// said the right thing. This one presses the button.
import { bootPage } from './tools-harness.mjs';
import vm from 'vm';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html');
const { ctx, doc, html } = b;
const bootErr = b.errors[0] || null;
ok(html.length>0, 'the page was read');

ok(typeof ctx.openModal === 'function',
   'openModal is reachable'+(bootErr?' (boot said: '+bootErr.message+')':''));

// Every form the dashboard offers, read from the source so a new one is
// covered the day it is added rather than the day somebody remembers.
const formsBlock = html.slice(html.indexOf('const FORMS = {'), html.indexOf('function openModal'));
const types = [...formsBlock.matchAll(/^\s{2,4}([a-z_]+):\{title:/gm)].map(m=>m[1]);
ok(types.length >= 14, 'found the form list ('+types.length+' forms)');
ok(types.includes('rfi') && types.includes('submittal') && types.includes('co'),
   'including the three that carry a workflow');

const backdrop = doc.getElementById('modal-backdrop');
for (const t of types){
  backdrop.classList.remove('open');
  let threw = null;
  try { ctx.openModal(t); } catch(e){ threw = e; }
  ok(!threw, 'openModal("'+t+'") does not throw' + (threw ? ' — '+threw.message : ''));
  ok(backdrop.classList.contains('open'),
     'openModal("'+t+'") actually opens the dialog');
}

// The exact failure, kept so the reason for this file is not lost: a function
// that throws part way leaves the dialog shut, and nothing says why.
{
  const probe = vm.createContext({ out:{opened:false} });
  let caught=null;
  try {
    vm.runInContext("function open(){ const x = missingThing.value; out.opened=true; } open();", probe);
  } catch(e){ caught=e; }
  ok(caught && /is not defined/.test(caught.message) && probe.out.opened===false,
     'a ReferenceError part way through leaves the dialog shut — which is what a dead button looks like');
}

console.log((bad?'FAIL':'ok  '),' tools-test-forms.mjs —',n,'assertions');
process.exit(bad?1:0);
