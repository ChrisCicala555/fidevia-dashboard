// The contractor's and the owner's addresses head the change order, so it
// cannot be drawn without them. The guard was right to stop; what it said was
// "Ithaca Admin has no address on file", which sends somebody to a form to work
// out for themselves which box it is unhappy about.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);
R(`currentProject.config.owner='Ithaca Admin';`);
const full = `{line1:'1 Main St',city:'Ithaca',state:'NY',zip:'14850',complete:true}`;
const miss = js => JSON.parse(R(`JSON.stringify(coDocumentReadiness('Summit Builders').missing)`));

console.log('Naming the fields');
R(`PROJECT_ORGS={'summit builders':${full},'ithaca admin':${full}};`);
ok(R(`coDocumentReadiness('Summit Builders').ready`)===true, 'two complete records generate');
ok(miss().length===0, 'with nothing to report');
R(`PROJECT_ORGS['ithaca admin']={line1:'2 Elm St',city:'',state:'',zip:'14850',complete:false};`);
ok(miss()[0]==='Ithaca Admin (owner) needs a city and a state',
   'a half-filled record names exactly what is missing, and which party it is');
R(`PROJECT_ORGS['ithaca admin']={line1:'',city:'',state:'',zip:'',complete:false};`);
ok(miss()[0]==='Ithaca Admin (owner) needs a street address, a city, a state and a ZIP code',
   'four missing fields read as a list, not as a run-on');
R(`PROJECT_ORGS['ithaca admin']={line1:'2 Elm St',city:'Ithaca',state:'NY',zip:'',complete:false};`);
ok(miss()[0]==='Ithaca Admin (owner) needs a ZIP code', 'one missing field reads as one thing');

console.log('No record is a different problem from a half-filled one');
R(`PROJECT_ORGS={'summit builders':${full}};`);
ok(miss()[0]==='Ithaca Admin (owner) has no organization record yet',
   'and says so, rather than "needs nothing on file at all", which reads as though nothing were needed');

console.log('Both parties, and neither silently');
R(`PROJECT_ORGS={};`);
{
  const m=miss();
  ok(m.length===2, 'a contractor and an owner both missing are both reported');
  ok(/Summit Builders \(contractor\)/.test(m[0]) && /Ithaca Admin \(owner\)/.test(m[1]),
     'each named with its role, so it is clear which record to go and fix');
}
R(`currentProject.config.owner='';`);
ok(miss().some(x=>/Owner is not recorded on this project/.test(x)),
   'and a project with no owner at all is a different message again');
R(`currentProject.config.owner='Ithaca Admin';`);

console.log('The helper is honest on its own');
ok(R(`JSON.stringify(orgMissingBits(null))`)==='["a street address","a city","a state","a ZIP code"]',
   'nothing at all is missing everything');
ok(R(`JSON.stringify(orgMissingBits({line1:'x',city:'y',state:'z',zip:'1'}))`)==='[]', 'a full one is missing nothing');
ok(R(`JSON.stringify(orgMissingBits({line1:'  ',city:'y',state:'z',zip:'1'}))`)==='["a street address"]',
   'and whitespace is not an address');
ok(R(`andList(['a'])`)==='a' && R(`andList(['a','b'])`)==='a and b' && R(`andList(['a','b','c'])`)==='a, b and c',
   'the list reads properly at one, two and three');
ok(R(`andList([])`)==='', 'and an empty one says nothing rather than "and"');

console.log('It is still a stop, not a warning');
{
  const g = html.split('function openCoGen(idx){')[1].split('\n}')[0];
  ok(/if\(!rd\.ready\)\{/.test(g) && /go\.disabled=true/.test(g),
     'generate stays disabled until the records are there — a change order without the parties’ addresses is not a contract document');
  ok(/Complete the organization records/.test(g), 'with a way through to fix it');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-coreadiness.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
