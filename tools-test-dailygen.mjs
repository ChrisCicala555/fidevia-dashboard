// Four changes to Fidevia's daily report, at Christopher's request:
//   Material Deliveries and Inspections as sections of their own;
//   Contractor and Subcontractor collapsed into one Contractor field;
//   Hours replaced by Full day / Half day;
//   and yesterday's report carried into tomorrow's form.
//
// The fill-then-read round trip is the part worth proving, and the usual
// harness cannot: its DOM stub returns nothing from querySelectorAll, so every
// assertion about it would pass whether the code worked or not. This uses a
// real DOM. Without one it says so and stops rather than reporting a pass it
// did not earn.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

let JSDOM;
try{ ({ JSDOM } = await import('jsdom')); }
catch(e){
  console.log('SKIP tools-test-dailygen.mjs — jsdom not installed (npm i), so the round trip cannot be exercised honestly');
  process.exit(0);
}

const dom = new JSDOM('<!doctype html><body>'
  + '<div id="dg-crew-rows"></div><div id="dg-note-rows"></div>'
  + '<div id="dg-del-rows"></div><div id="dg-insp-rows"></div>'
  + '<input id="dg-copies"><div id="dg-carried"></div></body>');
const { window } = dom;
// The functions under test, lifted out of the page and given a real document.
const grab = name => { const i=html.indexOf('function '+name); return html.slice(i, html.indexOf('\n}', i)+2); };
const src = ['dgCrewRow','dgNoteRow','dgDeliveryRow','dgInspectionRow','dgDayValue','dgDayLabel',
             'dgDaysLabel','dgFillRows','dgSetVal','dgApplyCarry','dgStartBlank','dgLastReport','dgGather']
  .map(grab).join('\n');
const api = new window.Function('document','allData',
  src + '\nreturn {dgApplyCarry,dgGather,dgStartBlank,dgLastReport,dgDayValue,dgDayLabel,dgDaysLabel,dgCrewRow};')(
  window.document, {daily:[]});

console.log('Full day and half day');
ok(api.dgDayValue('full')===1 && api.dgDayValue('half')===0.5 && api.dgDayValue('')===0,
   'a day counts one, a half counts half, and neither counts nothing rather than being guessed at');
ok(api.dgDayLabel('full')==='Full day' && api.dgDayLabel('half')==='Half day' && api.dgDayLabel('')==='—',
   'and each reads as words on the document');
ok(api.dgDaysLabel(1)==='1 day' && api.dgDaysLabel(1.5)==='1.5 days' && api.dgDaysLabel(0)==='—',
   'the total agrees in number, and says nothing when there is nothing');
{
  const row = api.dgCrewRow();
  ok(/class="dg-day"/.test(row) && /Full day/.test(row) && /Half day/.test(row), 'the row offers the two');
  ok(!/dg-hours/.test(row) && !/type="number" min="0" step="0.5"/.test(row), 'and no longer asks for hours');
}

console.log('One contractor field, not two');
{
  const row = api.dgCrewRow();
  ok(/class="dg-co"/.test(row) && />Contractor</.test(row), 'the field is there and called Contractor');
  ok(!/dg-sub/.test(row) && !/Subcontractor/.test(row),
     'and the second box is gone — whoever was on site is the company that was on site');
}
ok(!/\bc\.sub\b/.test(html.split('function dgBuildPDF')[1]||html), 'nothing in the document reads it either');

console.log('Carrying yesterday into today');
{
  const prev = {
    crews:[{company:'Summit Builders',workers:'6',day:'full',work:'Formwork to grid C'},
           {company:'Comfort Systems',workers:'2',day:'half',work:'Duct hangers'}],
    notes:[{event:'Rain delay',text:'45 minutes lost'}],
    deliveries:[{from:'ABC Supply',what:'Rebar #5',qty:'3 bundles',by:'R. Alvarez'}],
    inspections:[{what:'Footing rebar',who:'Town of Ithaca',result:'Passed',note:'Grid A-C'}],
    copies:'Owner; Architect'};
  api.dgApplyCarry(prev);
  const g = api.dgGather();
  ok(g.crews.length===2, 'both crews come back');
  ok(g.crews[0].company==='Summit Builders' && g.crews[0].workers==='6'
     && g.crews[0].day==='full' && g.crews[0].work==='Formwork to grid C',
     'with contractor, headcount, time on site and the work as they were');
  ok(g.crews[1].day==='half', 'including a half day, which a select drops silently if the option is missing');
  ok(g.deliveries.length===1 && g.deliveries[0].from==='ABC Supply'
     && g.deliveries[0].qty==='3 bundles' && g.deliveries[0].by==='R. Alvarez', 'the delivery comes back whole');
  ok(g.inspections.length===1 && g.inspections[0].result==='Passed' && g.inspections[0].who==='Town of Ithaca',
     'so does the inspection, result included');
  ok(g.notes.length===1 && g.notes[0].event==='Rain delay', 'and the notable event');
  ok(window.document.getElementById('dg-copies').value==='Owner; Architect', 'with the distribution list');
}
{
  api.dgStartBlank();
  const g = api.dgGather();
  ok(!g.crews.length && !g.notes.length && !g.deliveries.length && !g.inspections.length,
     'Start blank empties every section');
  ok(window.document.getElementById('dg-copies').value==='', 'and the distribution list');
  ok(window.document.querySelectorAll('#dg-crew-rows .dg-crew').length===1,
     'leaving one empty row to type into rather than nothing at all');
  ok(window.document.getElementById('dg-carried').style.display==='none', 'and takes the banner down with it');
}
{
  api.dgApplyCarry(null);
  const g = api.dgGather();
  ok(!g.crews.length, 'a first-ever report starts empty');
  ok(window.document.querySelectorAll('#dg-insp-rows .dg-insp').length===1, 'with one row in each section');
}

console.log('Which report is carried');
{
  const mk=(d,co)=>({'Date':d,'Report Data':JSON.stringify({crews:[{company:co}]})});
  const api2 = new window.Function('document','allData', src + '\nreturn {dgLastReport};')(
    window.document, {daily:[mk('2026-09-08','Older'), mk('2026-09-10','Newest'), mk('2026-09-09','Middle')]});
  ok(api2.dgLastReport().data.crews[0].company==='Newest',
     'the most recent by date, not the last row in the file');
  const api3 = new window.Function('document','allData', src + '\nreturn {dgLastReport};')(
    window.document, {daily:[{'Date':'2026-09-10'}, {'Date':'2026-09-09','Report Data':'not json'}]});
  ok(api3.dgLastReport()===null, 'rows with no data, or unreadable data, are skipped rather than throwing');
  // The case that matters: an unreadable NEWER row must not hide a good older
  // one. Returning null there would silently lose the carry-over, which is
  // indistinguishable from having nothing to carry.
  const api4 = new window.Function('document','allData', src + '\nreturn {dgLastReport};')(
    window.document, {daily:[mk('2026-09-09','Good older'), {'Date':'2026-09-10','Report Data':'{oops'}]});
  const got = api4.dgLastReport();
  ok(got && got.data.crews[0].company==='Good older',
     'and an unreadable newer row falls through to the last readable one rather than hiding it');
}

console.log('Stored so there is something to carry');
{
  const hdr = html.split("daily:    {folder:'04 - Daily Logs'")[1].split(']}')[0];
  ok(/'Report Data'/.test(hdr), 'the log has a column for the report as entered');
  const g = html.split("const row={'Date':date")[1].split('};')[0];
  ok(/'Report Data':JSON\.stringify\(\{crews,notes,deliveries,inspections,/.test(g),
     'and every section is written to it');
  ok(/copies:String\(\(document\.getElementById\('dg-copies'\)\|\|\{\}\)\.value\|\|''\)\.trim\(\)/.test(g),
     'with the distribution list, which is the other thing retyped every morning');
}

console.log('The form says it has been carried');
{
  const o = html.split('async function openDailyGen(){')[1].split('\n}')[0];
  ok(/const prev=dgLastReport\(\);/.test(o) && /dgApplyCarry\(prev && prev\.data\)/.test(o),
     'the dialog opens on yesterday');
  ok(/Carried over from the report of/.test(o), 'and says which day it came from');
  ok(/what is here describes that day, not this one/.test(o),
     'warning that it has to be checked — carried text nobody looked at is worse than a blank form');
  ok(/Start blank instead/.test(o), 'with a way out');
  ok(/b\.style\.display = prev \? '' : 'none'/.test(o), 'and no banner when there was nothing to carry');
}

console.log('The document prints the new sections');
{
  const pdf = html.split('function dgBuildPDF')[1];
  ok(/sect\('Material Deliveries'\)/.test(pdf), 'material deliveries');
  ok(/head:\[\['#','Supplier','Material','Quantity','Received by'\]\]/.test(pdf), 'with its own columns');
  ok(/sect\('Inspections'\)/.test(pdf), 'inspections');
  ok(/head:\[\['#','Inspection','Inspector \/ agency','Result','Notes'\]\]/.test(pdf), 'with its own');
  ok(/if\(deliveries\.length\)\{/.test(pdf) && /if\(inspections\.length\)\{/.test(pdf),
     'each skipped entirely when empty, rather than printing an empty table');
  ok(/if\(y>640\)\{ doc\.addPage\(\); y=60; \}[\s\S]{0,80}sect\('Material Deliveries'\)/.test(pdf),
     'and each checks for room first, so a section does not start at the foot of a page');
  ok(/head:\[\['#','Contractor','Workers','Time on site','Work Performed'\]\]/.test(pdf),
     'while manpower loses its subcontractor column and counts days');
  ok(/foot:\[\['','Total',String\(totW\),dgDaysLabel\(totD\),''\]\]/.test(pdf), 'totalling them');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-dailygen.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
