// "For the example amounts across the dashboard, could we replace the greyed
// out stuff with more generic names/numbers?"
//
// Grey example text is read as a suggestion of what belongs in the field. An
// oddly exact one — $18,799,000, a real school district, a real street — reads
// as somebody's actual job, which is unsettling on a form about a different
// job and, on a shared dashboard, is a leak of whose numbers built the thing.
// Examples should be obviously invented and obviously round.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const all=[...html.matchAll(/placeholder="([^"]*)"/g)].map(m=>m[1]);
const of=id=>{ const m=html.match(new RegExp('(?:id|class)="'+id+'"[^>]*placeholder="([^"]*)"'))
            || html.match(new RegExp('placeholder="([^"]*)"[^>]*(?:id|class)="'+id+'"')); return m?m[1]:null; };

console.log('Money reads as an illustration, not as a figure off a real job');
const MONEY=['pa-contract','pa-prev','pa-req','pa-amount','pa-cos',
             'f-contract','f-prev','f-req','f-cost','f-cos-approved',
             'f-budget','f-committed','f-actual','nc-amount',
             'ct-amt','alw-amt'];
MONEY.forEach(id=>{
  const p=of(id);
  ok(p!==null, id+' has an example at all');
  if(p===null) return;
  ok(/^(0|[1-9][0-9]?[0-9]?(,[0-9]{3})*)$/.test(p), id+' is a plain whole number — got '+JSON.stringify(p));
  const digits=p.replace(/,/g,'');
  ok(digits==='0' || /^[1-9]0*$/.test(digits) || /^[1-9][05]0*$/.test(digits),
     id+' is round enough to be obviously made up — got '+p);
});
{
  const big=MONEY.map(of).filter(Boolean).map(p=>p.replace(/,/g,'')).filter(d=>d.length>3);
  ok(big.every(d=>d.length>3), 'sanity: there are four-figure examples to check');
  ok(MONEY.map(of).filter(Boolean).every(p=>p==='0' || p.replace(/,/g,'').length<4 || p.includes(',')),
     'and a four-figure example is grouped the way the field groups what is typed into it');
}
ok(/A deduct is a negative, e\.g\. -10,000\./.test(html),
   'the deduct example follows the field it explains, rather than naming a different figure');
ok(!/-8400|18799000|182500|140200/.test(html), 'and none of the old exact figures survive anywhere');

// The allowance field this list still named was removed when allowances became
// a named list per contractor; money wiring for a field that does not exist is
// a line nobody can check, so it goes too.
ok(!/'f-allow'/.test(html), 'and the money wiring no longer names a field that was taken out');

console.log('People are invented, and visibly so');
ok(of('prof-first')==='Jane' && of('prof-last')==='Doe', 'the profile form uses one invented person');
ok(of('cdn-first')==='Jane' && of('cdn-last')==='Doe', 'and the directory form uses the same one');
ok(of('cdn-email')==='jane.doe@example.com',
   'whose email is that person at example.com, the domain reserved so it can never be anyone');
all.filter(p=>/@/.test(p)).forEach(p=>{
  ok(/example\.com$|fidevia\.com$|\{|…|\bor\b/.test(p),
     'every email example is either example.com or Fidevia’s own domain — got '+p);
});
all.filter(p=>/^\(\d{3}\)/.test(p)).forEach(p=>{
  ok(/^\(555\) 555-01\d\d$/.test(p),
     'every phone example sits in the 555-01xx range, which cannot ring a real line — got '+p);
});

console.log('Organizations, projects and addresses are invented too');
['Lobar','Lebanon','Ithaca Admin','Lincoln School','Acme','ABC Mechanical',
 'Okafor','Reyes','R. Alvarez','Dana Rowe','Lancaster','Dillsburg',
 '124 West Church','17601','17019','(717)'].forEach(name=>{
  ok(!all.some(p=>p.includes(name)), 'no example names '+name);
});
ok(all.filter(p=>/Riverside/.test(p)).length>=4,
   'the project, owner and request examples share one invented place, so they read as one story');
ok(of('og-city')===of('np-city') && of('og-zip')===of('np-zip'),
   'both address forms show the same invented address rather than two different real ones');
ok(of('og-line1')==='123 Main Street', 'which is the street everyone already reads as a placeholder');
ok(of('np-zip')==='12345', 'and a ZIP that is a counting sequence, not a town');

console.log('Examples that teach a format are left alone');
ok(all.includes('e.g. 26-108'), 'the job number still shows its year-and-sequence shape');
ok(all.includes('03-300'), 'the cost code still shows a CSI division');
ok(all.some(p=>/\{number\}/.test(p)), 'the email subject templates still show their token');
ok(all.includes('e.g. Footing rebar') && all.includes('e.g. Door hardware'),
   'and the examples that describe work, rather than name anyone, are untouched');

console.log((bad?'FAIL':'ok  ')+' tools-test-placeholders.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
