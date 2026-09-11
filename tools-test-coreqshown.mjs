// Reporting what is missing tells somebody they are blocked. Stating the whole
// requirement tells them what finished looks like — which is the thing they can
// act on, and means a second party missing one field is not a second surprise.
//
// So the blocked panel now lists every field a change order needs from each
// party, ticked or crossed, and the organization form says the same before
// anything is typed.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);
R(`currentProject.config.owner='Ithaca Admin';`);
const text = js => R(`coReadinessHTML(${js})`).replace(/<[^>]+>/g,'|').replace(/\|+/g,' ').trim();

console.log('Every field, whether it is there or not');
R(`PROJECT_ORGS={'summit builders':{line1:'1 Main St',city:'Ithaca',state:'NY',zip:'14850',complete:true},
                 'ithaca admin':{line1:'2 Elm St',city:'',state:'',zip:'14850',complete:false}};`);
{
  const t=text(`'Summit Builders'`);
  ['street address','city','state','ZIP code'].forEach(f=>
    ok((t.match(new RegExp(f,'g'))||[]).length===2, f+' is listed for both parties, not only where it is absent'));
  ok(/Contractor — Summit Builders/.test(t) && /Owner — Ithaca Admin/.test(t),
     'each party is named with its role');
}
{
  const h=R(`coReadinessHTML('Summit Builders')`);
  const owner=h.split('Owner')[1];
  ok((owner.match(/✕/g)||[]).length===2, 'the owner’s two gaps are crossed');
  ok((owner.match(/✓/g)||[]).length===2, 'and its two filled fields are ticked, so the list is a checklist rather than a complaint');
  const contractor=h.split('Owner')[0];
  ok((contractor.match(/✕/g)||[]).length===0, 'a complete party shows no crosses at all');
}
{
  R(`currentProject.config.owner='';`);
  const t=text(`'Summit Builders'`);
  // The stripped markup leaves the span as a space, so allow for it.
  ok(/Owner —\s+not recorded on this project/.test(t),
     'a project with no owner says that, rather than listing fields for a party that does not exist');
  // The real point: a party that does not exist gets no tick-list at all, so
  // the panel does not invite somebody to fill in an address for nobody.
  const ownerPart=R(`coReadinessHTML('Summit Builders')`).split('Owner')[1]||'';
  ok(!/street address/.test(ownerPart) && !/✕/.test(ownerPart) && !/✓/.test(ownerPart),
     'and offers no checklist for it');
  R(`currentProject.config.owner='Ithaca Admin';`);
}
{
  R(`PROJECT_ORGS={};`);
  const h=R(`coReadinessHTML('Summit Builders')`);
  ok((h.match(/✕/g)||[]).length===8,
     'with no records at all, all four fields are crossed for both parties rather than the party being skipped');
}

console.log('Where it is shown');
{
  const g = html.split('function openCoGen(idx){')[1].split('\n}')[0];
  ok(/A change order names both parties in full/.test(g), 'the blocked panel states the rule');
  ok(/each needs a street address, a city, a state and a ZIP code/.test(g), 'and the fields it means');
  ok(/\+coReadinessHTML\(contractor\)/.test(g), 'above the per-party checklist');
  ok(/esc\(rd\.missing\.join\('; '\)\)/.test(g), 'with the specific gaps still spelled out beneath');
  ok(/Complete the organization records/.test(g), 'and a way through to fix them');
}
{
  const f = html.split('id="og-line1"')[0].slice(-400);
  ok(/Street address, city, state and ZIP are required to generate a change order/.test(f),
     'the organization form says so before anything is typed, not only when it is discovered missing');
}
ok(/<label>Street address \*<\/label>/.test(html) && /<label>City \*<\/label>/.test(html)
   && /<label>State \*<\/label>/.test(html) && /<label>ZIP \*<\/label>/.test(html),
   'and the four fields are marked required');
ok(/<label>Line 2 <span[^>]*>\(optional\)/.test(html),
   'while line 2 stays marked optional, so the asterisks mean something');

console.log('The fields listed are the fields checked');
{
  // One list, so the checklist cannot promise something the guard does not want
  // or stay silent about something it does.
  ok(/const ORG_ADDR_FIELDS=\[\['line1','a street address'\],\['city','a city'\],\['state','a state'\],\['zip','a ZIP code'\]\]/.test(html),
     'there is one list of required fields');
  const r = html.split('function coReadinessHTML(companyName){')[1].split('\n}')[0];
  ok(/ORG_ADDR_FIELDS\.map/.test(r), 'the checklist is built from it');
  const m = html.split('function orgMissingBits(r){')[1].split('\n}')[0];
  ok(/ORG_ADDR_FIELDS\.filter/.test(m), 'and so is the check that blocks generation');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-coreqshown.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
