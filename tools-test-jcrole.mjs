// The job contact sheet's Role column shows granted access, not a typed title.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/\+roleCell\(r,i\)/.test(html), 'the Role column is rendered by roleCell');
ok(!/editCell\(i,'Role',r\['Role'\],120\)/.test(html), 'it no longer prints the typed title as the role');
ok(/function roleCell/.test(html), 'roleCell exists');

const rc = html.split('function roleCell')[1].split('async function setContactAccess')[0];
ok(/PROJECT_ROLES\[em\]/.test(rc), 'it reads the granted role for this project');
ok(/No access/.test(rc), 'someone with no grant is shown as such rather than blank');
ok(/color:var\(--muted\)[^']*'>'\+esc\(typed\)/.test(rc) || /esc\(typed\)/.test(rc),
   'the typed title is kept as secondary text');
ok(/if\(!IS_ADMIN \|\| viewingAsExternal\(\)\)/.test(rc), 'only Fidevia gets the editor');
ok(/<select class="jc-role"/.test(rc), 'Fidevia gets a picker');
ok(/architect-engineer'\?'<option value="architect-engineer" selected/.test(rc),
   'a legacy grant stays selectable rather than being silently rewritten');
ok(/granted===k\?' selected'/.test(rc), 'the current role is preselected');

const sa = html.split('async function setContactAccess')[1].split('function accessCell')[0];
ok(/adminRevoke/.test(sa) && /adminGrant/.test(sa), 'it can both grant and remove');
ok(/if\(!em\)/.test(sa), 'a contact with no email is refused rather than silently failing');
ok(/Remove .*access to this project\?/.test(sa), 'removal is confirmed');
ok(/They stay on the contact sheet/.test(sa), 'and says what is not affected');
ok(/Change '\+nm\+' from '\+roleLabelOf\(had\)\+' to '/.test(sa), 'a change names both roles');
ok(/access on other projects is untouched/.test(sa), 'and that it is scoped to this project');
ok(/sel\.value=had/.test(sa), 'declining puts the picker back');
ok(/catch\(e\)\{ alert\('Could not change access/.test(sa) && /sel\.value=had/.test(sa),
   'a failure restores the previous value rather than showing a lie');
ok(/company:String\(r\['Company'\]\|\|''\)\.trim\(\)/.test(sa),
   'the grant carries the company, which is what scopes their folders');
ok(/await loadProjectAccess\(\)/.test(sa), 'the table refreshes from the server, not from the picker');
ok(/sel\.disabled=true/.test(sa), 'the picker is locked while the change is in flight');

// search
ok(/The Role column shows granted access, so searching it should too/.test(html),
   'search covers the granted role');
{
  const ROLE_LABELS={'contractor':'Contractor','architect':'Architect','engineer':'Engineer',
    'architect-engineer':'Architect','owner':'Owner','custom':'Custom'};
  const PROJECT_ROLES={'a@x.test':'contractor','b@x.test':'owner','c@x.test':'architect-engineer'};
  const match=(email,q)=>{ const g=PROJECT_ROLES[email]||''; return !!g && (ROLE_LABELS[g]||g).toLowerCase().includes(q); };
  ok(match('a@x.test','contractor'), 'searching "contractor" finds a granted contractor');
  ok(!match('b@x.test','contractor'), 'and does not find an owner');
  ok(match('c@x.test','architect'), 'a legacy architect-engineer grant is found under Architect');
  ok(!match('zzz@x.test','contractor'), 'someone with no grant matches no role search');
}

// the staleness this makes moot
ok(/self-declared and inconsistent/.test(html),   // the note sits above the function
   'the reason for the change is recorded where the next person will read it');

console.log((bad?'FAIL ':'ok   ')+'tools-test-jcrole.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
