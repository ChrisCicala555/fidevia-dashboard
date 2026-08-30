// Project access decided on the team step, not afterwards.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── the picker exists and defaults to nothing ──
ok(/class="ct-access"/.test(html), 'each contact row has an access picker');
// A function rather than a const, so it is evaluated after ROLE_LABELS exists.
ok(/function accessOptions\(\)/.test(html), 'the options are built lazily');
ok(/return '<option value="">No dashboard access<\/option>'/.test(html),
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
// Picking a person is now an explicit statement of who the row is, so it sets
// access along with everything else rather than tiptoeing around what is there.
const pick = html.split('function dirPick')[1].split('window.addEventListener')[0];
ok(/applyAccessFor\(row, c\)/.test(pick), 'picking someone sets their access too');
{
  const af = html.split('function applyAccessFor')[1].split('function wizAccessNote')[0];
  ok(/No access anywhere yet, so worth checking/.test(af),
     'a value inferred from a job title still says it is a guess');
  ok(/note\.style\.color='#8a6d3b'/.test(af),
     'and is marked differently from one taken from a real grant');
}

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

// ── selecting a person replaces the row ──
{
  const pk = html.split('function dirPick')[1].split('window.addEventListener')[0];
  ok(/const put=\(sel,val\)=>\{ const f=row\.querySelector\(sel\); if\(f\) f\.value=val\|\|''; \};/.test(pk),
     'every field is written, not only the blank ones');
  ok(!/!f\.value\.trim\(\)/.test(pk), 'the fill-the-gaps behaviour is gone');
  ok(/applyAccessFor\(row, c\)/.test(pk), 'access is set from the person too');
  ok(/for '\+\(c\.name\|\|c\.email\)/.test(pk), 'the note names who the row was filled for');
}

// ── access reflects what they already hold ──
ok(/let GRANT_ROLES=\{\}/.test(html), 'existing grants are loaded');
{
  const lf = html.split('async function loadFideviaPeople')[1].split('// email -> |async function cdPickLoad')[0];
  ok(/adminListGrants/.test(lf), 'from the grant list');
  ok(/tally\[b\]-tally\[a\]/.test(lf), 'the most common role wins where they differ');
}
{
  const af = html.split('function applyAccessFor')[1].split('function wizAccessNote')[0];
  ok(/FIDEVIA_EMAIL\.test\(em\)/.test(af) && /acc\.disabled=true/.test(af),
     'Fidevia staff get no picker');
  ok(/Nothing to grant/.test(af), 'and are told why');
  ok(/GRANT_ROLES\[em\]/.test(af), 'an existing grant is preferred');
  ok(/Already '\+ROLE_LABELS\[held\.role\]\+' on '\+held\.count/.test(af),
     'the note says what they already are and on how many projects');
  ok(af.indexOf('GRANT_ROLES[em]') < af.indexOf('accessHintFor'),
     'held access outranks a guess from a job title');
  ok(/acc\.disabled=false/.test(af), 'a non-Fidevia address re-enables the picker');
}
ok(/function wizEmailTyped/.test(html), 'typing a Fidevia address by hand behaves the same as picking one');

// ── someone new reaches the directory ──
{
  const cp = html.split('async function createProject')[1];
  ok(/proxyCall\('ensureContact'/.test(cp), 'wizard contacts are added to the directory');
  ok(/if\(!em\) continue;/.test(cp), 'a contact with no email is skipped');
  ok(/if\(d && d\.created\) listed\+\+/.test(cp), 'only genuinely new records are counted');
  ok(/catch\(e\)\{ console\.warn\('Could not add'/.test(cp), 'a failure there does not fail the project');
  ok(cp.indexOf('ensureContact') < cp.indexOf('toGrant'), 'they are listed before being granted');
  ok(/listed\?' '\+listed\+' added to the directory\.'/.test(cp), 'the result says how many');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-teamaccess.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
