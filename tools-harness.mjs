// Boot the page in a sandbox and let a test press things.
//
// Written after + New RFI turned out to have been dead for thirty commits: the
// source read correctly, node --check passed, and every assertion we had was
// matching text rather than calling code. A stub is not a browser, but it is
// enough to catch a function that throws before it finishes.
import fs from 'fs';
import vm from 'vm';

// knownIds: every id literal that appears anywhere in the file, static markup
// and template strings alike. A browser returns null for an id that is not
// there, and the page leans on that — `const card=getElementById(x); if(card)`
// is the guard all over this codebase. A stub that invents an element for any
// id asked of it turns those guards inside out and reports failures the real
// page would never have.
export function makeDoc(knownIds){
  const known = knownIds instanceof Set ? knownIds : null;
  const byId = new Map();
  const mk = (id) => {
    const e = {
      id, value:'', textContent:'', innerHTML:'', outerHTML:'', placeholder:'', title:'',
      type:'text', readOnly:false, disabled:false, selectedIndex:0, checked:false, files:[],
      style:{}, dataset:{}, _classes:new Set(), options:[], children:[], childNodes:[],
      classList:{ add:(...c)=>c.forEach(x=>e._classes.add(x)), remove:(...c)=>c.forEach(x=>e._classes.delete(x)),
                  toggle:(c)=>e._classes.has(c)?e._classes.delete(c):e._classes.add(c),
                  contains:(c)=>e._classes.has(c) },
      appendChild(){}, removeChild(){}, remove(){}, insertBefore(){}, insertAdjacentHTML(){},
      addEventListener(){}, removeEventListener(){}, setAttribute(){}, getAttribute:()=>null,
      removeAttribute(){}, hasAttribute:()=>false, focus(){}, blur(){}, click(){}, closest:()=>null,
      querySelector:()=>null, querySelectorAll:()=>[], scrollIntoView(){}, cloneNode:()=>mk(id),
      getBoundingClientRect:()=>({top:0,left:0,right:0,bottom:0,width:0,height:0}),
      getContext:()=>null, submit(){}, reset(){}, select(){}, setSelectionRange(){}
    };
    Object.defineProperty(e,'parentElement',{get:()=>null});
    Object.defineProperty(e,'parentNode',{get:()=>null});
    Object.defineProperty(e,'firstChild',{get:()=>null});
    Object.defineProperty(e,'lastElementChild',{get:()=>null});
    return e;
  };
  const doc = {
    getElementById(id){
      if(known && !known.has(String(id))) return null;
      if(!byId.has(id)) byId.set(id, mk(id));
      return byId.get(id);
    },
    querySelector:()=>null, querySelectorAll:()=>[], createElement:(t)=>mk('<'+t+'>'),
    createTextNode:()=>mk('#text'), createDocumentFragment:()=>mk('#frag'),
    addEventListener(){}, removeEventListener(){}, body:mk('body'), head:mk('head'),
    documentElement:mk('html'), title:'', cookie:'', activeElement:null, referrer:'',
    readyState:'complete', _byId:byId, _mk:mk
  };
  return doc;
}

export function makeWin(doc){
  const win = {
    document:doc, addEventListener(){}, removeEventListener(){},
    location:{href:'https://x/',search:'',hash:'',pathname:'/',origin:'https://x',reload(){},assign(){},replace(){}},
    history:{replaceState(){},pushState(){},back(){}},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){},clear(){},key:()=>null,length:0},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){},clear(){}},
    navigator:{userAgent:'node',clipboard:{writeText:()=>Promise.resolve()}},
    matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),
    getSelection:()=>({toString:()=>''}),
    fetch:()=>new Promise(()=>{}),                    // never settles: no network in here
    setTimeout:()=>0, setInterval:()=>0, clearTimeout(){}, clearInterval(){},
    requestAnimationFrame:()=>0, cancelAnimationFrame(){},
    // Without this, anything that times itself throws inside its own try and
    // the failure looks like the work simply not happening.
    performance:{ now:()=>0 },
    alert(){}, confirm:()=>false, prompt:()=>null, open:()=>null, print(){}, scrollTo(){},
    btoa:(s)=>Buffer.from(String(s),'binary').toString('base64'),
    atob:(s)=>Buffer.from(String(s),'base64').toString('binary'),
    auth0:{ createAuth0Client:()=>new Promise(()=>{}) },
    URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},
    URLSearchParams, console, Date, Math, JSON, Promise, Set, Map, WeakMap, RegExp, Intl,
    Object, Array, String, Number, Boolean, Error, TypeError, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, Blob:function(){}, FormData:function(){},
    FileReader:function(){ this.readAsDataURL=()=>{}; }, Image:function(){}
  };
  win.window=win; win.self=win; win.globalThis=win; win.top=win; win.parent=win;
  return win;
}

// Run the page's inline scripts. Returns the context plus whatever the boot
// threw, so a caller can decide whether it matters.
export function bootPage(file='index.html'){
  const html = fs.readFileSync(file,'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  // Ids the page can actually produce, so getElementById can say no.
  const knownIds = new Set([...html.matchAll(/\bid=["']([A-Za-z][\w:.-]*)["']/g)].map(m=>m[1]));
  const doc = makeDoc(knownIds);
  const win = makeWin(doc);
  const ctx = vm.createContext(win);
  const errors = [];
  for (let i=0;i<scripts.length;i++){
    try { new vm.Script(scripts[i],{filename:'inline-'+i+'.js'}).runInContext(ctx,{timeout:10000}); }
    catch(e){ errors.push(e); }
  }
  return { ctx, doc, win, html, errors, run:(code)=>vm.runInContext(code, ctx) };
}

// A project with one of everything, so render paths have something to draw.
// Top-level `let` in a vm script shares the context's lexical scope, so a
// later script can assign it — which is how the page's own state is seeded.
export const SEED = `
IS_ADMIN = true; EXTERNAL = false; DATA_READY = true;
ME_EMAIL = 'cc@fidevia.com'; ME_NAME = 'Christopher Cicala'; ME_COMPANY = 'Fidevia';
ACCOUNTS_LOADED = true;
currentProject = {
  name:'Ithaca Housing Complex', folderId:'900',
  folders:{ rfi:'1', co:'2', sub:'3', daily:'4', contacts:'5', budget:'6', docs:'7',
            comments:'8', pay_apps:'9', meetings:'10', board:'11', gendocs:'12',
            contractor_daily:'13', payrolls:'14' },
  config:{
    projectName:'Ithaca Housing Complex', owner:'Ithaca', contractDate:'2026-01-05',
    contractors:[{name:'Summit Builders', role:'GC', contract:'2000000', active:true,
                  allowances:[{id:'A',name:'Unforeseen',amount:'50000'}]}],
    milestones:[{name:'Substantial Completion', contract:'2026-12-01', baseline:'2026-12-08'}],
    responseDays:{gc:7, architect:14, engineer:14, submittal:14},
    workflows:{ rfi:[{name:'Architect Review', person:'Test Architect', email:'a@x.test'}],
                sub:[{name:'Architect Review', person:'Test Architect', email:'a@x.test'},
                     {name:'Engineer Review', person:'Penelope Odiem', email:'p@y.test', parallel:true}],
                co:[{name:'Fidevia Review', person:'Chris', email:'cc@fidevia.com'}] },
    orgs:{ 'Summit Builders':{category:'Contractor', city:'Ithaca'} }
  },
  notif:{}
};
allData = {
  rfi:[{'RFI #':'RFI-GC-001','Subject':'Beam clearance','Description':'d','Submitted By':'Dave (Summit Builders)',
        'Assigned To':'Architect 2','Date Submitted':'2026-09-01','Due Date':'2026-09-15','Status':'Open',
        'Company':'Summit Builders','Workflow Step':'0','Workflow Status':'In Review','Version History':'[]'}],
  co:[{'PCO #':'PCO-GC-001','CO #':'','Description':'Slab','Submitted By':'Dave','Cost Impact':'48200',
       'Approved Amount':'48200','Applied to Allowance':'20000','Allowance':'A','Cause':'Unforeseen',
       'Status':'Pending Review','Date Submitted':'2026-09-02','Company':'Summit Builders',
       'Workflow Step':'0','Workflow Status':'In Review','Version History':'[]'}],
  sub:[{'Submittal #':'SUB-GC-001','Spec Section':'04 20 00 Unit Masonry','Description':'Wall',
        'Submitted By (Sub)':'Dave','Reviewer':'Architect 2','Date Submitted':'2026-09-08',
        'Due Date':'2026-09-22','Status':'Pending Review','Company':'Summit Builders',
        'Workflow Step':'0','Workflow Status':'In Review','Version History':'[]'}],
  pay_apps:[{'App #':'PA-001','Contractor':'Summit Builders','Company':'Summit Builders',
             'Period':'2026-08','Due Date':'2026-09-10','Contract Amount':'2000000',
             'Requested Amount':'100000','Approved Amount':'','Status':'Submitted','Version History':'[]'}],
  contacts:[{'Name':'Dave Chen','Company':'Summit Builders','Role':'PM','Email':'d@s.test',
             'Phone':'5551234567','Notify - RFI':'Yes','Notify - CO':'Yes','Notify - Submittal':'Yes'},
            {'Name':'Test Architect','Company':'Architect 2','Role':'Architect','Email':'a@x.test','Phone':''}],
  daily:[{'Date':'2026-09-01','Submitted By':'Chris','Work Performed':'Framing'}],
  contractor_daily:[{'Date':'2026-09-01','Company':'Summit Builders','Submitted By':'Dave'}],
  payrolls:[{'Week Ending':'2026-09-05','Company':'Summit Builders','Payroll #':'1','Submitted By':'Dave'}],
  meetings:[{'Date':'2026-09-03','Meeting Type':'OAC','Attendees':'All','Summary':'s'}],
  board:[{'Date':'2026-09-04','Title':'Monthly','Summary':'s'}],
  docs:[{'Document':'Drawings','Category':'Drawing','Version':'1','Date':'2026-09-01','Visible To':'External'}],
  gendocs:[], comments:[], budget:[]
};
`;
