import fs from 'fs';
// "Certified Payroll - should be a tab for each company."
//
// One list in date order is four primes' unrelated paperwork interleaved. A
// certified payroll gets looked at to answer a question about one firm's week
// — did Summit file for the week ending the 10th — and that was a search.
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P=bootPage('index.html'); P.run(SEED);

const seed=(rows)=>P.run(`COTAB={}; allData.payrolls=${JSON.stringify(rows)};
  EXTERNAL=false; IS_ADMIN=true; ME_EMAIL='c@fidevia.com'; currentProject.userCompany='Fidevia';
  currentProject.userRole='owner'; renderPayrolls(); 1;`);
const pr=(co,wk,num)=>({'Week Ending':wk,'Company':co,'Payroll #':num||'','Submitted By':'x@y.test',
  'Notes':'','Attachment File ID':'f1','Attachment Name':'pr.pdf'});
const chips=()=>P.run("document.getElementById('pr-company').innerHTML");
const body=()=>P.run("document.getElementById('tbody-payrolls').innerHTML");
const shown=()=>{ const h=body(); return ['Summit Builders','Garden Spot','Cook’s Service Company']
  .filter(c=>h.indexOf(c)>=0); };

console.log('A tab for each firm that has filed');
seed([pr('Summit Builders','2026-09-10','1'), pr('Garden Spot','2026-09-10','1'),
      pr('Summit Builders','2026-09-03','2')]);
ok(/>All /.test(chips()), 'plus an All tab');
ok(chips().indexOf('Summit Builders')>=0 && chips().indexOf('Garden Spot')>=0, 'both firms are offered');
ok(/Summit Builders <span[^>]*>2</.test(chips()), 'with how many each has filed');
ok(/Garden Spot <span[^>]*>1</.test(chips()), 'counted per firm');
ok(/All <span[^>]*>3</.test(chips()), 'and All counts every one');
ok(/seg-opt on[^>]*>All/.test(chips()), 'All is the one selected to begin with');

console.log('Choosing a firm shows only theirs');
P.run("setCoTabAt('payrolls',1)");   // firms sorted: Garden Spot, Summit Builders
ok(P.run("coTabState('payrolls').sel")==='Summit Builders', 'the second firm alphabetically is Summit');
ok(shown().join()==='Summit Builders', 'and only their payrolls are listed');
ok(/seg-opt on[^>]*>Summit Builders/.test(chips()), 'with their tab marked as the one being read');
P.run("setCoTabAt('payrolls',0)");
ok(shown().join()==='Garden Spot', 'switching firms switches the list');
P.run("setCoTabAt('payrolls',-1)");
ok(P.run("coTabState('payrolls').sel")==='' && shown().length===2, 'and All brings everybody back');

console.log('A name with an apostrophe in it survives the click');
seed([pr('Cook’s Service Company','2026-09-10','1'), pr('Summit Builders','2026-09-10','1')]);
ok(chips().indexOf('Cook')>=0, 'the firm is offered');
P.run("setCoTabAt('payrolls',0)");
ok(P.run("coTabState('payrolls').sel")==='Cook’s Service Company', 'and selecting it works — the name never goes through the markup');
ok(shown().join()==='Cook’s Service Company', 'showing only theirs');

console.log('One firm is not a choice');
seed([pr('Summit Builders','2026-09-10','1'), pr('Summit Builders','2026-09-03','2')]);
ok(chips()==='', 'a subcontractor who sees only their own gets no tab strip');
ok(shown().join()==='Summit Builders', 'and their payrolls are listed without one');

console.log('Nothing filed at all');
seed([]);
ok(chips()==='', 'no tabs');
ok(/colspan/.test(body()), 'and the empty row, not a blank table');

console.log('A firm that drops off the project does not empty the page');
seed([pr('Summit Builders','2026-09-10','1'), pr('Garden Spot','2026-09-10','1')]);
P.run("setCoTabAt('payrolls',0)");
ok(P.run("coTabState('payrolls').sel")==='Garden Spot', 'reading Garden Spot');
P.run(`allData.payrolls=[${JSON.stringify(pr('Summit Builders','2026-09-10','1'))}]; renderPayrolls();`);
ok(P.run("coTabState('payrolls').sel")==='', 'their last payroll gone, the page falls back to All');
ok(shown().join()==='Summit Builders', 'rather than reading as though nobody had filed anything');

console.log('The months still group inside a firm');
seed([pr('Summit Builders','2026-09-10','1'), pr('Summit Builders','2026-08-06','1'),
      pr('Garden Spot','2026-09-10','1')]);
P.run("setCoTabAt('payrolls',1)");
ok(/September 2026/.test(body()) && /August 2026/.test(body()), 'both months are headed');
ok(!/Garden Spot/.test(body()), 'and the other firm is not in among them');

console.log('Contractor daily reports do the same, from the same code');
const seedCd=(rows)=>P.run(`COTAB={}; allData.contractor_daily=${JSON.stringify(rows)};
  EXTERNAL=false; IS_ADMIN=true; ME_EMAIL='c@fidevia.com'; currentProject.userCompany='Fidevia';
  currentProject.userRole='owner'; renderContractorDaily(); 1;`);
const cd=(co,date)=>({'Date':date,'Company':co,'Submitted By':'x@y.test',
  'Notes':'','Attachment File ID':'f1','Attachment Name':'r.pdf'});
const cdChips=()=>P.run("document.getElementById('cd-company').innerHTML");
const cdBody=()=>P.run("document.getElementById('tbody-cdaily').innerHTML");
const cdShown=()=>['Summit Builders','Voltage Electric','AH Plumbing']
  .filter(c=>cdBody().indexOf(c)>=0);

seedCd([cd('Summit Builders','2026-07-28'), cd('Voltage Electric','2026-07-25'),
        cd('AH Plumbing','2026-07-22'), cd('Summit Builders','2026-07-14')]);
ok(/>All /.test(cdChips()), 'an All tab');
ok(/Summit Builders <span[^>]*>2</.test(cdChips()), 'a tab per firm, with a count');
ok(/All <span[^>]*>4</.test(cdChips()), 'and All counts every report');
P.run("setCoTabAt('contractor_daily',2)");   // AH Plumbing, Summit Builders, Voltage Electric
ok(P.run("coTabState('contractor_daily').sel")==='Voltage Electric', 'firms are in alphabetical order');
ok(cdShown().join()==='Voltage Electric', 'and only that firm\u2019s reports are listed');
P.run("setCoTabAt('contractor_daily',-1)");
ok(cdShown().length===3, 'All brings everybody back');

console.log('The two logs do not share a selection');
seed([pr('Summit Builders','2026-09-10','1'), pr('Garden Spot','2026-09-10','1')]);
seedCd([cd('Summit Builders','2026-07-28'), cd('Voltage Electric','2026-07-25')]);
P.run("renderPayrolls();");   // seedCd cleared the state both logs keep
P.run("setCoTabAt('payrolls',0)");
ok(P.run("coTabState('payrolls').sel")==='Garden Spot', 'a firm is picked on payrolls');
ok(P.run("coTabState('contractor_daily').sel")==='', 'and daily reports are untouched');
P.run("setCoTabAt('contractor_daily',1)");
ok(P.run("coTabState('payrolls').sel")==='Garden Spot', 'and the reverse');

console.log('Switching project forgets which firm was being read');
P.run("COTAB={};");
ok(P.run("coTabState('payrolls').sel")==='' && P.run("coTabState('contractor_daily').sel")==='',
   'so the next project does not open on the last one\u2019s contractor');
ok(/COTAB=\{\};/.test(fs.readFileSync('index.html','utf8').split('SUB_SPEC_FILTER')[1]||''),
   'and the project switch actually does that');

console.log('One firm is not a choice here either');
seedCd([cd('Summit Builders','2026-07-28'), cd('Summit Builders','2026-07-14')]);
ok(cdChips()==='', 'a subcontractor who sees only their own gets no tab strip');
ok(cdShown().join()==='Summit Builders', 'and their reports are listed without one');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
