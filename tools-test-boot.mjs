// Actually run the page script. node --check only proves the syntax parses;
// it cannot see a const that reads another const declared further down, which
// throws at load and stops the boot sequence before it starts.
import fs from 'fs';
import vm from 'vm';
const html = fs.readFileSync('index.html','utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(scripts.length>0, 'found inline scripts to evaluate');

// Enough of a browser for top-level code to run. Anything the script only
// touches inside a function never gets called here, which is the point: this
// checks load-time evaluation, not behaviour.
const el = () => new Proxy(function(){}, {
  get(t,k){ if(k==='style') return {}; if(k==='classList') return {add(){},remove(){},toggle(){},contains(){return false}};
            if(k==='dataset') return {}; if(k==='value'||k==='textContent'||k==='innerHTML') return '';
            if(k==='files') return []; if(k==='parentElement') return el(); return el(); },
  set(){ return true; },
  apply(){ return el(); }
});
const doc = {
  getElementById:()=>el(), querySelector:()=>el(), querySelectorAll:()=>[],
  createElement:()=>el(), addEventListener(){}, body:el(), documentElement:el(),
  title:'', cookie:'', activeElement:null, referrer:''
};
const win = {
  document:doc, addEventListener(){}, removeEventListener(){}, location:{href:'https://x/',search:'',hash:'',pathname:'/'},
  history:{replaceState(){},pushState(){}}, localStorage:{getItem:()=>null,setItem(){},removeItem(){},clear(){},key:()=>null,length:0},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){},clear(){}},
  navigator:{userAgent:'node'}, matchMedia:()=>({matches:false,addEventListener(){}}),
  getSelection:()=>({toString:()=>''}), fetch:()=>new Promise(()=>{}),
  setTimeout:()=>0, setInterval:()=>0, clearTimeout(){}, clearInterval(){},
  requestAnimationFrame:()=>0, alert(){}, confirm:()=>false, prompt:()=>null,
  auth0:{ createAuth0Client:()=>new Promise(()=>{}) },
  URLSearchParams, console, Date, Math, JSON, Promise, Set, Map, RegExp, Intl
};
win.window = win; win.self = win; win.globalThis = win; win.top = win;

for (let i=0; i<scripts.length; i++){
  const ctx = vm.createContext(win);
  let threw = null;
  try {
    // Unhandled promise rejections from the boot IIFE are not what this checks.
    new vm.Script(scripts[i], { filename:'inline-'+i+'.js' }).runInContext(ctx, { timeout: 8000 });
  } catch (e) {
    // A missing browser API is this harness being thin, not a real fault.
    // A ReferenceError naming an identifier the file itself declares is real.
    const m = /^(\w+) is not defined|Cannot access '(\w+)' before initialization/.exec(e.message||'');
    const name = m && (m[1]||m[2]);
    const declaredHere = name && new RegExp('\\b(const|let|var|function|class)\\s+'+name+'\\b').test(scripts[i]);
    if (/before initialization/.test(e.message||'') || declaredHere) threw = e;
  }
  ok(!threw, 'script block '+i+' evaluates without a load-time error'
     + (threw ? ' — '+threw.message : ''));
}

// The specific shape of the bug, so the reason for this file survives.
{
  let caught=null;
  try { vm.runInNewContext("const A = B.x; const B = {x:1};"); } catch(e){ caught=e; }
  ok(caught && /before initialization/.test(caught.message),
     'a const reading a const declared below it throws at load (this is what broke it)');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-boot.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
