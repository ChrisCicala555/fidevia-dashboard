// The project's owner was free text, matched to the organization directory by
// exact name. "Ithaca Admin" was typed on the project while the Directory held
// the same body under its own name, so the two never met — and the change order
// generator, which needs the owner's address, had nowhere to look. The failure
// appeared at the moment somebody tried to generate a change order, a long way
// from the field that caused it.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);
R(`PROJECT_ORGS={
 'ithaca housing authority':{name:'Ithaca Housing Authority',line1:'1 Elm St',city:'Ithaca',state:'NY',zip:'14850',complete:true},
 'summit builders':{name:'Summit Builders',line1:'2 Main St',city:'',state:'',zip:'',complete:false}};`);
const note = v => { R(`document.getElementById('ps-owner').value=${JSON.stringify(v)}; ownerMatchNote('ps-owner','ps-owner-note');`);
  return R(`document.getElementById('ps-owner-note').innerHTML`).replace(/<[^>]+>/g,''); };

console.log('The field offers what is on file');
{
  const c = JSON.parse(R(`JSON.stringify(ownerNameChoices())`));
  ok(c.indexOf('Ithaca Housing Authority')>=0, 'organizations with a record are offered');
  // An organization that is NOT otherwise named on the project, so this tests
  // the org source rather than the project-companies one.
  R(`PROJECT_ORGS['half done']={name:'Half Done Authority',line1:'9 Road',city:'',state:'',zip:'',complete:false};`);
  const c2 = JSON.parse(R(`JSON.stringify(ownerNameChoices())`));
  ok(c2.indexOf('Half Done Authority')>=0,
     'including ones whose address is incomplete — the point is to find the record, not to hide it');
  R(`delete PROJECT_ORGS['half done'];`);
  ok(c.indexOf('Architect 2')>=0,
     'and companies named on the project, since the body paying is usually already in the directory under its own name');
  ok(c.join()===c.slice().sort((a,b)=>a.localeCompare(b)).join(), 'sorted, so a long list is scannable');
  ok(new Set(c).size===c.length, 'and with no name twice');
}
ok(/<datalist id="owner-orgs">/.test(R(`ownerDatalistHTML()`)), 'as a datalist');
ok(/id="ps-owner"[^>]*list="owner-orgs"/.test(html) && /id="np-owner"[^>]*list="owner-orgs"/.test(html),
   'shared by the settings field and the wizard');
ok(/id="ps-owner"[^>]*oninput="ownerMatchNote\('ps-owner','ps-owner-note'\)"/.test(html)
   && /id="np-owner"[^>]*oninput="ownerMatchNote\('np-owner','np-owner-note'\)"/.test(html),
   'and both say whether the name matches while it is being typed, not only once it is saved');
{
  // Refilled, not built once: assert by adding an organization between calls.
  R(`ownerListRefresh();`);
  ok(!/Late Addition Trust/.test(R(`document.getElementById('owner-orgs-host').innerHTML`)),
     'the list starts without an organization nobody has added');
  R(`PROJECT_ORGS['late addition trust']={name:'Late Addition Trust',line1:'1 A',city:'B',state:'C',zip:'1',complete:true};
     ownerListRefresh();`);
  ok(/Late Addition Trust/.test(R(`document.getElementById('owner-orgs-host').innerHTML`)),
     'and picks one up on the next refresh, so an organization added a minute ago is in it');
  R(`delete PROJECT_ORGS['late addition trust'];`);
}

console.log('And says whether what is typed found one');
ok(/No organization called Ithaca Admin is on file/.test(note('Ithaca Admin')),
   'the name that caused this says plainly that nothing matches it');
ok(/A change order cannot be generated until one exists/.test(note('Ithaca Admin')),
   'and what that will cost you later');
ok(/Matches Ithaca Housing Authority in the Directory, with a full address/.test(note('Ithaca Housing Authority')),
   'a good name confirms the match');
{
  const t=note('Summit Builders');
  ok(/Matches Summit Builders/.test(t), 'a matching name with a thin record still confirms the match');
  ok(/still needs a city, a state and a ZIP code/.test(t), 'and names what it is missing');
}
ok(/The body the work is for/.test(note('')), 'an empty field explains what it wants');
ok(!/Summit Builders/.test(note('')),
   'and does not keep the previous answer — mixing textContent and innerHTML on one element leaves whichever was not written still showing');
ok(/Matches Ithaca Housing Authority/.test(note('  ithaca housing authority  ')),
   'matching ignores case and surrounding space, as the directory key always has');

console.log('Typing is still allowed');
{
  ok(!/id="ps-owner"[^>]*readonly/.test(html), 'the field is not locked to the list');
  ok(!/<select id="ps-owner"/.test(html),
     'a new owner is not yet in the directory, so this offers names rather than restricting to them');
}

console.log('Wired where the field is used');
{
  const f = html.split('function fillProjectSettings(){')[1].split('\n}')[0];
  ok(/ownerListRefresh\(\);/.test(f), 'settings refills the list when it opens');
  ok(/ownerMatchNote\('ps-owner','ps-owner-note'\)/.test(f), 'and states the match for what is already saved');
}
{
  const o = html.split('function openNewProject(){')[1].split('\n}')[0];
  ok(/ownerListRefresh\(\); ownerMatchNote\('np-owner','np-owner-note'\)/.test(o),
     'and so does the wizard, so a second spelling is not created at the moment the project is');
}
{
  const l = html.split('async function loadProjectOrgs(){')[1].split('\n}')[0];
  ok(/ownerListRefresh\(\)/.test(l), 'the list refills when the organizations load');
  ok(/ownerMatchNote\('ps-owner','ps-owner-note'\)/.test(l),
     'and the note is restated then, since it cannot judge a match before the records arrive');
}

console.log('One definition of a match');
{
  const m = html.split('function ownerMatchNote(inputId, noteId){')[1].split('\n}')[0];
  ok(/orgRecordFor\(nm\)/.test(m), 'the note asks the same lookup the generator asks');
  ok(/orgMissingBits\(r\)/.test(m), 'and lists gaps with the same helper the generator uses');
  ok(!/line1|city|state|zip/.test(m), 'rather than deciding for itself what a complete record is');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-ownerlink.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
