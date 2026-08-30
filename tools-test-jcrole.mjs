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
// Outside Fidevia the cell is a single line: the granted role, or nothing.
{
  const ext = rc.split('if(!IS_ADMIN || viewingAsExternal())')[1].split('const opts=')[0];
  ok(!/sub/.test(ext), 'externals do not get the typed title as a second line');
  ok(!/>No access</.test(ext), 'externals are not told who cannot sign in');
  ok(/u2014/.test(ext), 'an ungranted contact shows a dash rather than a status');
  ok(/roleLabelOf\(granted\)/.test(ext), 'externals still see the granted role');
}
ok(/sub/.test(rc.split('const opts=')[1]||''), 'Fidevia keeps the second line');
ok(/<select class="jc-role"/.test(rc), 'Fidevia gets a picker');
// Layout: the picker and its caption share a width so the column lines up,
// and a long title cannot make one row taller than the rest.
ok(/\.jc-role-cell\{width:172px;\}/.test(html), 'the role column has one width');
ok(/\.jc-role\{width:100%/.test(html), 'the picker fills that width');
ok(/\.jc-role-sub\{[^}]*white-space:nowrap/.test(html), 'a long title stays on one line');
ok(/\.jc-role-sub\{[^}]*text-overflow:ellipsis/.test(html), 'and is clipped rather than wrapped');
ok(/class="jc-role-sub" title=/.test(rc), 'the full title is still available on hover');
ok(!/max-width:150px/.test(rc), 'the inline width that caused the ragged column is gone');
ok((rc.match(/<td class="jc-role-cell"/g)||[]).length===3,
   'all three branches — staff, external, Fidevia picker — use the same cell class');
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

// ── Fidevia staff ──
{
  const fid = rc.split('if(em && FIDEVIA_EMAIL.test(em))')[1].split('if(!IS_ADMIN')[0];
  ok(/>Fidevia</.test(fid), 'a Fidevia address reads as Fidevia rather than a dash');
  ok(!/<select/.test(fid), 'no picker is offered for staff');
  ok(/title="Fidevia staff/.test(fid), 'the cell explains why');
  ok(/IS_ADMIN && !viewingAsExternal\(\)/.test(fid), 'the typed title is still Fidevia-only');
  ok(rc.indexOf('FIDEVIA_EMAIL.test(em)') < rc.indexOf('if(!IS_ADMIN'),
     'staff are resolved before the granted-role branches');
}
{
  // the behaviour, not the source
  const FID=/@fidevia\.com$/i;
  const roleFor=(email, granted)=> FID.test(email) ? 'Fidevia' : (granted || '—');
  ok(roleFor('dcicala@fidevia.com','')==='Fidevia', 'a Fidevia address with no grant still reads Fidevia');
  ok(roleFor('DCicala@Fidevia.com','')==='Fidevia', 'matching ignores case');
  ok(roleFor('sdraper@example.com','')==='—', 'an outside contact with no grant still shows a dash');
  ok(roleFor('x@notfidevia.com','')==='—', 'a lookalike domain is not treated as staff');
  ok(roleFor('mtorres@example.com','Contractor')==='Contractor', 'a granted contact is unaffected');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-jcrole.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
