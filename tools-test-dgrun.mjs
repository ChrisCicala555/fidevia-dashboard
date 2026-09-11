// "Can't find variable: notes", on pressing Generate. dgGenerate destructured
// only `crews` from dgGather, while the row it writes referenced notes,
// deliveries and inspections — so reading an undeclared name threw, and the
// daily report could not be generated at all.
//
// The same mistake as allowId/allowAmt a few commits earlier, and it got
// through the same way: the test asserted the TEXT of the row literal, which
// was correct, rather than running the function that evaluates it. Text cannot
// see an undeclared variable. This runs it.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

let JSDOM;
try{ ({ JSDOM } = await import('jsdom')); }
catch(e){ console.log('SKIP tools-test-dgrun.mjs — jsdom not installed (npm i)'); process.exit(0); }

const dom = new JSDOM(`<!doctype html><body>
  <input id="dg-date" value="2026-09-11"><input id="dg-by" value="Christopher Cicala (Fidevia)">
  <input id="dg-w-low" value="54"><input id="dg-w-high" value="71">
  <input id="dg-w-precip"><input id="dg-w-wind"><input id="dg-w-humid">
  <input id="dg-copies" value="Owner; Architect">
  <div id="dg-crew-rows"></div><div id="dg-note-rows"></div>
  <div id="dg-del-rows"></div><div id="dg-insp-rows"></div>
  <div id="dg-carried"></div><div id="dg-status"></div>
  <span id="dg-progress"></span><button id="dg-submit"></button></body>`);
const { window } = dom;
const grab = name => { const i=html.indexOf('function '+name); return html.slice(i, html.indexOf('\n}', i)+2); };
const parts = ['dgCrewRow','dgNoteRow','dgDeliveryRow','dgInspectionRow','dgDayValue','dgDayLabel',
               'dgDaysLabel','dgFillRows','dgSetVal','dgApplyCarry','dgGather'].map(grab).join('\n');

// dgGenerate, with everything it reaches for answered locally. The point is to
// evaluate its body, not to talk to Box.
const genSrc = html.slice(html.indexOf('async function dgGenerate()'),
                          html.indexOf('\n}', html.indexOf('renderAll(); closeDailyGen();'))+2);
const run = new window.Function('document','ME_EMAIL','MODULES','allData','ctx', `
  ${parts}
  const {showStatus,dgBuildPDF,boxUploadBinary,uploadProgressTo,findFile,boxGetText,
         parseCSV,toCSV,boxUploadText,proxyCall,renderAll,closeDailyGen,currentProject,EXTERNAL,
         monthFolderName,ymOf,findOrCreateFolder,DG_CAPTIONS,DG_FILES,etToday} = ctx;
  ${genSrc}
  return dgGenerate();
`);

const calls = { rows:null, err:null };
const ctx = {
  showStatus:(id,t,k)=>{ if(k==='error') calls.err=t; },
  dgBuildPDF: async()=>({ output:()=>new window.Blob(['x']), save:()=>{} }),
  boxUploadBinary: async()=>({entries:[{id:'f1'}]}),
  uploadProgressTo:()=>null,
  findFile: async()=>({id:'log'}),
  boxGetText: async()=>'',
  parseCSV:()=>({headers:[],rows:[]}),
  toCSV:(h,rows)=>{ calls.rows=rows; return ''; },
  boxUploadText: async()=>({}),
  proxyCall: async()=>({}),
  renderAll:()=>{}, closeDailyGen:()=>{},
  currentProject:{folders:{daily:'4'}}, EXTERNAL:false,
  // Daily reports are filed by month, so the generator reaches for these too.
  monthFolderName:(ym)=>ym?('2026-09 September'):'',
  ymOf:()=>'2026-09',
  findOrCreateFolder: async()=>'44',
  DG_CAPTIONS:{}, DG_FILES:[], etToday:()=>'2026-09-11'
};
const MODULES={daily:{log:'Daily Log Index.csv',
  headers:['Date','Submitted By','Submitted By Email','Weather','Crew Count','Work Performed',
           'Delays / Issues','Photo Notes','Attachment File ID','Attachment Name','Report Data']}};

console.log('Generating a report runs to the end');
{
  // One of everything, so the row has all four sections to write.
  const api = new window.Function('document', parts + '\nreturn {dgApplyCarry};')(window.document);
  api.dgApplyCarry({
    crews:[{company:'Summit Builders',workers:'6',day:'full',work:'Formwork'}],
    notes:[{event:'Rain delay',text:'45 minutes'}],
    deliveries:[{from:'ABC Supply',what:'Rebar',qty:'3 bundles',by:'R. Alvarez'}],
    inspections:[{what:'Footing rebar',who:'Town',result:'Passed',note:''}],
    copies:'Owner; Architect'});

  let threw='';
  try{ await run(window.document,'cc@fidevia.com',MODULES,{daily:[]},ctx); }
  catch(e){ threw=String(e&&e.message||e); }
  ok(!threw, 'no error is thrown'+(threw?(' — '+threw):''));
  ok(!/Can't find variable|is not defined/.test(threw||''),
     'and specifically not an undeclared name, which is what pressing Generate produced');
  ok(!calls.err, 'nothing is reported to the user as an error'+(calls.err?(' — '+calls.err):''));
}

console.log('And writes the whole report to the row');
{
  ok(calls.rows && calls.rows.length===1, 'a row was written');
  const row = (calls.rows||[])[0] || {};
  ok(row['Date']==='2026-09-11', 'carrying the date');
  ok(row['Crew Count']==='6', 'and the headcount');
  const data = JSON.parse(row['Report Data']||'{}');
  ok(data.crews && data.crews[0].company==='Summit Builders', 'the crews are stored');
  ok(data.notes && data.notes[0].event==='Rain delay', 'the notable events are stored');
  ok(data.deliveries && data.deliveries[0].from==='ABC Supply',
     'the deliveries are stored — this is the reference that threw');
  ok(data.inspections && data.inspections[0].result==='Passed', 'and the inspections');
  ok(data.copies==='Owner; Architect', 'with the distribution list, so tomorrow starts from all of it');
}

console.log('Every section it stores is one it asked for');
{
  const g = html.split('async function dgGenerate(){')[1].split('\n}\n')[0];
  const declared = (g.match(/const \{([^}]*)\}=dgGather\(\)/)||[])[1]||'';
  const stored = (g.match(/'Report Data':JSON\.stringify\(\{([^}]*)/)||[])[1]||'';
  const names = stored.split(',').map(x=>x.split(':')[0].trim()).filter(x=>x && x!=='copies');
  names.forEach(nm=>ok(declared.split(',').map(x=>x.trim()).indexOf(nm)>=0,
    nm+' is destructured before it is stored'));
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-dgrun.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
