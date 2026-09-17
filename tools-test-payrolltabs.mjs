// "Certified Payroll - should be a tab for each company."
//
// One list in date order is four primes' unrelated paperwork interleaved. A
// certified payroll gets looked at to answer a question about one firm's week
// — did Summit file for the week ending the 10th — and that was a search.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P=bootPage('index.html'); P.run(SEED);

const seed=(rows)=>P.run(`PR_CO=''; allData.payrolls=${JSON.stringify(rows)};
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
P.run("setPrCompanyAt(1)");   // firms sorted: Garden Spot, Summit Builders
ok(P.run("PR_CO")==='Summit Builders', 'the second firm alphabetically is Summit');
ok(shown().join()==='Summit Builders', 'and only their payrolls are listed');
ok(/seg-opt on[^>]*>Summit Builders/.test(chips()), 'with their tab marked as the one being read');
P.run("setPrCompanyAt(0)");
ok(shown().join()==='Garden Spot', 'switching firms switches the list');
P.run("setPrCompanyAt(-1)");
ok(P.run("PR_CO")==='' && shown().length===2, 'and All brings everybody back');

console.log('A name with an apostrophe in it survives the click');
seed([pr('Cook’s Service Company','2026-09-10','1'), pr('Summit Builders','2026-09-10','1')]);
ok(chips().indexOf('Cook')>=0, 'the firm is offered');
P.run("setPrCompanyAt(0)");
ok(P.run("PR_CO")==='Cook’s Service Company', 'and selecting it works — the name never goes through the markup');
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
P.run("setPrCompanyAt(0)");
ok(P.run("PR_CO")==='Garden Spot', 'reading Garden Spot');
P.run(`allData.payrolls=[${JSON.stringify(pr('Summit Builders','2026-09-10','1'))}]; renderPayrolls();`);
ok(P.run("PR_CO")==='', 'their last payroll gone, the page falls back to All');
ok(shown().join()==='Summit Builders', 'rather than reading as though nobody had filed anything');

console.log('The months still group inside a firm');
seed([pr('Summit Builders','2026-09-10','1'), pr('Summit Builders','2026-08-06','1'),
      pr('Garden Spot','2026-09-10','1')]);
P.run("setPrCompanyAt(1)");
ok(/September 2026/.test(body()) && /August 2026/.test(body()), 'both months are headed');
ok(!/Garden Spot/.test(body()), 'and the other firm is not in among them');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
