// Open every form, for real.
//
// The RFI button did nothing for weeks: openModal threw on a `sel` left behind
// when Goes To stopped being a dropdown, so the function never reached the line
// that shows the dialog. Every test we had matched source text, and source text
// said the right thing. This one presses the button.
import fs from 'fs';
import vm from 'vm';
const html = fs.readFileSync('index.html','utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// A DOM thin enough to build quickly, real enough that opening a dialog is
// observable: elements keep their own identity, classes and values.
function makeDoc(){
  const byId = new Map();
  const mk = (id) => {
    const e = {
      id, value:'', textContent:'', innerHTML:'', placeholder:'', title:'', type:'text',
      readOnly:false, disabled:false, selectedIndex:0, checked:false, files:[],
      style:{}, dataset:{}, _classes:new Set(), options:[], children:[],
      classList:{ add:(...c)=>c.forEach(x=>e._classes.add(x)), remove:(...c)=>c.forEach(x=>e._classes.delete(x)),
                  toggle:(c)=>e._classes.has(c)?e._classes.delete(c):e._classes.add(c),
                  contains:(c)=>e._classes.has(c) },
      appendChild(){}, removeChild(){}, remove(){}, insertBefore(){}, insertAdjacentHTML(){},
      addEventListener(){}, removeEventListener(){}, setAttribute(){}, getAttribute:()=>null,
      removeAttribute(){}, focus(){}, blur(){}, click(){}, closest:()=>null,
      querySelector:()=>null, querySelectorAll:()=>[], scrollIntoView(){},
      getBoundingClientRect:()=>({top:0,left:0,width:0,height:0})
    };
    Object.defineProperty(e,'parentElement',{get:()=>null});
    Object.defineProperty(e,'parentNode',{get:()=>null});
    return e;
  };
  const doc = {
    getElementById(id){ if(!byId.has(id)) byId.set(id, mk(id)); return byId.get(id); },
    querySelector:()=>null, querySelectorAll:()=>[], createElement:(t)=>mk('<'+t+'>'),
    addEventListener(){}, removeEventListener(){}, body:mk('body'), documentElement:mk('html'),
    title:'', cookie:'', activeElement:null, referrer:'', _byId:byId
  };
  return doc;
}
function makeWin(doc){
  const win = {
    document:doc, addEventListener(){}, removeEventListener(){},
    location:{href:'https://x/',search:'',hash:'',pathname:'/',origin:'https://x'},
    history:{replaceState(){},pushState(){}},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){},clear(){},key:()=>null,length:0},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){},clear(){}},
    navigator:{userAgent:'node'}, matchMedia:()=>({matches:false,addEventListener(){}}),
    getSelection:()=>({toString:()=>''}), fetch:()=>new Promise(()=>{}),
    setTimeout:()=>0, setInterval:()=>0, clearTimeout(){}, clearInterval(){},
    requestAnimationFrame:()=>0, alert(){}, confirm:()=>false, prompt:()=>null,
    auth0:{ createAuth0Client:()=>new Promise(()=>{}) },
    URLSearchParams, console, Date, Math, JSON, Promise, Set, Map, RegExp, Intl, Object, Array, String, Number, Boolean, Error
  };
  win.window=win; win.self=win; win.globalThis=win; win.top=win;
  return win;
}

const doc = makeDoc();
const win = makeWin(doc);
const ctx = vm.createContext(win);
let bootErr = null;
for (let i=0;i<scripts.length;i++){
  try { new vm.Script(scripts[i],{filename:'inline-'+i+'.js'}).runInContext(ctx,{timeout:8000}); }
  catch(e){ bootErr = e; }
}
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
