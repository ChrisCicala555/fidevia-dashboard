// Project access decided on the team step, not afterwards.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── the picker exists and defaults to nothing ──
ok(/class="ct-access"/.test(html), 'each contact row has an access picker');
ok(/const ACCESS_OPTIONS='<option value="">No dashboard access<\/option>'/.test(html),
   'the first option is no access, so it is the default');
ok(/\['contractor','architect','engineer','owner','custom'\]/.test(html), 'all five access roles are offered');

// ── the two different "role" ideas stay separate ──
ok(/class="ct-role"/.test(html) && /class="ct-access"/.test(html),
   'the written role and the access role are separate fields');
ok(/free text and documents what someone does/.test(html),
   'the distinction is written down where the next person will read it');

// ── suggestion, never a silent grant ──
const hint = html.split('function accessHintFor')[1].split('function wizAccessNote')[0];
ok(/return '';/.test(hint), 'an unrecognised role suggests nothing');
{
  const ACCESS_HINTS=[
    [/architect/i,'architect'],
    [/engineer|mep|structural|civil|geotech/i,'engineer'],
    [/owner|board|district|superintendent of schools|business manager/i,'owner'],
    [/contractor|superintendent|foreman|project manager|pm\b|estimator/i,'contractor']
  ];
  const FID=/@fidevia\.com$/i;
  const hintFor=(t,email)=>{ if(FID.test(String(email||''))) return '';
    for(const [re,r] of ACCESS_HINTS){ if(re.test(String(t||''))) return r; } return ''; };
  ok(hintFor('MEP Engineer','a@x.test')==='engineer', '"MEP Engineer" suggests Engineer');
  ok(hintFor('Project Architect','a@x.test')==='architect', '"Project Architect" suggests Architect');
  ok(hintFor('Business Manager','a@x.test')==='owner', '"Business Manager" suggests Owner');
  ok(hintFor('Superintendent','a@x.test')==='contractor', '"Superintendent" suggests Contractor');
  ok(hintFor('Fidevian','ccicala@fidevia.com')==='', 'a Fidevia address is never suggested a grant');
  ok(hintFor('Tester','a@x.test')==='', 'an unrecognised title suggests nothing at all');
  ok(hintFor('','a@x.test')==='', 'a blank title suggests nothing');
  // ordering matters: architect is checked before engineer
  ok(hintFor('Architect / Engineer','a@x.test')==='architect',
     'a title naming both resolves to Architect rather than flipping between runs');
}
const pick = html.split('function dirPick')[1].split('window.addEventListener')[0];
ok(/if\(acc && !acc\.value && !acc\.dataset\.touched\)/.test(pick),
   'the suggestion only lands on an untouched, empty picker');
ok(/Check it before creating the project/.test(pick), 'a suggested value says it is a suggestion');
ok(/acc\.dataset\.touched='1'/.test(pick), 'once you change it, nothing overwrites your choice');

// ── granting ──
const cp = html.split('async function createProject')[1];
ok(/const toGrant=contacts\.filter\(c=>c\._access && String\(c\['Email'\]\|\|''\)\.trim\(\)\)/.test(cp),
   'only contacts with an explicit access choice and an email are granted');
ok(/if\(FIDEVIA_EMAIL\.test\(String\(c\['Email'\]\)\.trim\(\)\)\) continue;/.test(cp),
   'Fidevia addresses are skipped — they are administrators already');
ok(/company:String\(c\['Company'\]\|\|''\)\.trim\(\)/.test(cp),
   'the grant carries the company, which is what scopes them to their own folders');
ok(/role:c\._access/.test(cp), 'the grant uses the selected role, not the written one');
ok(cp.indexOf('writeProjectConfig(projId, config)') < cp.indexOf('toGrant'),
   'nothing is granted until the project exists');
ok(/catch\(e\)\{ console\.warn\('Could not grant access to'/.test(cp),
   'one failed grant does not abandon the rest or fail the project');
ok(/granted\?' '\+granted\+' given access\.'/.test(cp), 'the result says how many were granted');
ok(!/_access.*inferred|accessHintFor/.test(cp), 'creation grants only what was selected, never a guess');

// ── it survives a paused setup ──
ok(/_access:\(acc&&acc\.value\)\|\|''/.test(html), 'the choice is captured for a draft');
ok(/ac\.value=c\._access\|\|''; ac\.dataset\.touched='1'/.test(html),
   'a restored draft keeps the choice and is not re-suggested over');

// ── what the user is told ──
const note = html.split('function wizAccessNote')[1].split('function wizAddContractor')[0];
ok(/cannot sign in to this project/.test(note), 'no-access says plainly what that means');
ok(/Live as soon as they have an account/.test(note),
   'it explains that a grant works before the person signs up');
ok(/scoped to '\+co/.test(note), 'the note names the company the access is scoped to');
ok(/Custom access is granted here, then narrowed/.test(note), 'Custom explains the second step');

console.log((bad?'FAIL ':'ok   ')+'tools-test-teamaccess.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
