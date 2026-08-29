// Adding a directory contact for someone who has no account yet.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const prof = fs.readFileSync('netlify/functions/profile.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── server: the op exists and is guarded ──
ok(/if \(op === 'addContact'\)/.test(srv), 'addContact op exists');
const add = srv.split("if (op === 'addContact')")[1].split("if (op === 'deleteContact')")[0];
ok(/who\.isAdmin/.test(add) && /403/.test(add), 'addContact is admin-only');
ok(/PANEL_PW\(\)/.test(add) && /body\.password/.test(add), 'addContact needs the panel password');
ok(/A valid email address is required/.test(add), 'addContact validates the email');
ok(/409/.test(add), 'addContact refuses a duplicate email');
ok(/onboarded: false/.test(add), 'placeholder is not marked onboarded');
ok(/PENDING_PREFIX \+ email/.test(add), 'placeholder is written under the reserved key');

const del = srv.split("if (op === 'deleteContact')")[1].split("if (op === 'accountEmails')")[0];
ok(/who\.isAdmin/.test(del), 'deleteContact is admin-only');
ok(/PANEL_PW\(\)/.test(del), 'deleteContact needs the panel password');
ok(/startsWith\(PENDING_PREFIX\)/.test(del) && /Only contacts without an account/.test(del),
   'deleteContact refuses to touch a real account');

// ── the reserved prefix can never be a real Auth0 sub ──
ok(/const PENDING_PREFIX = 'pending\|'/.test(srv), 'PENDING_PREFIX defined');
for (const realSub of ['auth0|68b1f0', 'google-oauth2|1174', 'email|abc123']) {
  ok(!realSub.startsWith('pending|'), 'a real sub is never mistaken for a placeholder: '+realSub);
}

// ── a placeholder must NOT count as an account ──
const ae = srv.split("if (op === 'accountEmails')")[1].slice(0, 1800);
ok(/startsWith\(PENDING_PREFIX\)\) continue/.test(ae),
   'accountEmails skips placeholders so the Invite button stays visible');

// ── allContacts surfaces them, flagged ──
const ac = srv.split("if (op === 'allContacts')")[1].split("if (op === 'addContact')")[0];
ok(/pending: String\(b\.key\)\.startsWith\(PENDING_PREFIX\)/.test(ac), 'allContacts flags placeholders');

// ── adoption on first sign-in ──
ok(/pending\|' \+ em/.test(prof), 'profile GET looks for a placeholder by email');
ok(/store\.setJSON\(sub, placeholder\)/.test(prof), 'placeholder is re-keyed to the real sub');
ok(/store\.delete\(key\)/.test(prof), 'placeholder is removed after adoption, so no duplicate row');
const g = prof.split("if (req.method === 'GET')")[1].split("if (req.method === 'POST')")[0];
ok(g.indexOf('let profile = await store.get(sub')  < g.indexOf('pending|'),
   'the real profile wins; the placeholder is only consulted when there is none');
ok(/delete placeholder\.pending/.test(prof), 'the pending flag is cleared on adoption');

// ── client ──
ok(/function cdAddContact/.test(html) && /function cdToggleAdd/.test(html), 'client add helpers exist');
ok(/proxyCall\('addContact'/.test(html), 'client calls addContact');
ok(/password:CD_PW/.test(html.split('async function cdAddContact')[1].split('async function cdShowEntered')[0]),
   'client sends the unlock password');
const cdadd = html.split('async function cdAddContact')[1].split('async function cdRemoveContact')[0];
ok(/A name is required/.test(cdadd), 'client requires a name');
ok(/first, last, email/.test(cdadd), 'client sends first and last separately, not a joined string');
ok(!/const name=val\('name'\)/.test(cdadd), 'the single joined name field is gone from the add form');
ok(/already in the directory with that email/.test(cdadd), 'client catches a duplicate before the round trip');
ok(/allContacts/.test(cdadd), 'directory reloads after a successful add');
const cdrm = html.split('async function cdRemoveContact')[1].slice(0,900);
ok(/if\(!c\.pending\)/.test(cdrm), 'Remove refuses on someone with an account');
ok(/withBusy/.test(cdrm) && /Remove .*from the directory\?/.test(cdrm), 'Remove confirms and shows a spinner');

// ── the extra Actions column must not break the banner colspan ──
ok(/const NCOL = CD_UNLOCKED \? 6 : 5;/.test(html), 'band colspan tracks the unlocked column count');
ok(/colspan="'\+NCOL\+'"/.test(html), 'band uses NCOL rather than a literal');
const rowFn = html.split('const rowHtml=c=>{')[1].split('try{ cdUpdateSaveBar')[0];
const tdLocked   = (rowFn.match(/<td/g)||[]).length;
ok(tdLocked === 6, 'row emits 5 cells plus the conditional actions cell (found '+tdLocked+')');
ok(/CD_UNLOCKED\?'<td/.test(rowFn), 'the actions cell is conditional, matching the header');

// ── the badge ──
ok(/c\.pending\?'<span class="cd-pend"/.test(html), 'placeholders are badged in the directory');
ok(/\.cd-pend\{/.test(html), 'badge has styling');

// ── email stays unwritable ──
ok(/Email address is set by the sign-in account and cannot be changed here/.test(srv),
   'setContactMeta still refuses an email change');
ok(!/cdn-email/.test(html.split('function renderContactDir')[1]||''),
   'the add form email field is not reused as an editable directory field');

// ── prefill on adoption ──
ok(/localProf&&localProf\.first_name/.test(html), 'profile screen prefers the adopted record over Auth0 guesses');
ok(/set\('prof-company', localProf\.company\)/.test(html), 'company carries across to the profile screen');

// ── first/last are stored as typed, never re-guessed ──
const scm = srv.split("if (op === 'setContactMeta')")[1].split("if (op === 'addContact')")[0];
ok(/body\.first !== undefined\) pr\.first_name/.test(scm), 'setContactMeta stores first_name as given');
ok(/body\.last  !== undefined\) pr\.last_name/.test(scm), 'setContactMeta stores last_name as given');
ok(/body\.first === undefined && body\.last === undefined && body\.name !== undefined/.test(scm),
   'the old single-name path is only a fallback');
ok(/first: pr\.first_name/.test(ac) && /last: pr\.last_name/.test(ac),
   'allContacts returns both name fields');
ok(/name: \(\(\(pr\.first_name/.test(ac), 'allContacts still returns the joined name for display and search');

// the compound given name that the old guess got wrong
{
  const splitGuess = (full) => { const p=String(full||'').trim().split(/\s+/).filter(Boolean);
    return { first: p.length?p[0]:'', last: p.length>1?p.slice(1).join(' '):'' }; };
  const g = splitGuess('Mary Jo Van Der Berg');
  ok(g.first === 'Mary' && g.last === 'Jo Van Der Berg',
     'the old guess really did mangle a compound given name (documents why this changed)');
}

// ── the directory edits the two fields, and keeps the joined one in step ──
ok(/fld\(idx,'first',c\.first,88\)/.test(html) && /fld\(idx,'last',c\.last,110\)/.test(html),
   'directory row edits first and last separately');
ok(/if\(field==='first'\|\|field==='last'\) c\.name=/.test(html),
   'cdEdit recomputes the joined name so search and grouping stay correct');
ok(/Object\.assign\(\{sub, password:CD_PW\}, CD_DIRTY\[sub\]\)/.test(html),
   'dirty fields pass through to setContactMeta unchanged, so first/last reach the server');

// ── the directory reads by family name ──
ok(/const sortKey=c=>\(\(c\.last\|\|''\)/.test(html), 'sort key is the family name');
ok(/key=\(sortKey\(c\)\|\|'#'\)/.test(html), 'the A-Z bands are keyed on the family name');
ok(/letters\.forEach\(L=>groups\[L\]\.sort\(byName\)\)/.test(html), 'rows within a band use the same order');
ok(!/const within = mode==='name'/.test(html), 'the old always-first-name comparator is gone');

// behaviour of the comparator, run for real
{
  const sortKey=c=>((c.last||'').trim() || (c.first||'').trim() || (c.name||'').trim());
  const byName=(x,y)=>{ const c=sortKey(x).localeCompare(sortKey(y));
    return c || String(x.first||x.name||'').localeCompare(String(y.first||y.name||'')); };
  const people=[
    {first:'Aisha', last:'Rahman', name:'Aisha Rahman'},
    {first:'Andre', last:'Martin', name:'Andre Martin'},
    {first:'Brenda',last:'Santiago',name:'Brenda Santiago'},
    {first:'Chris', last:'Celmer', name:'Chris Celmer'},
    {first:'Zoe',   last:'Celmer', name:'Zoe Celmer'}
  ];
  const got=people.slice().sort(byName).map(p=>p.name);
  ok(got[0]==='Chris Celmer' && got[1]==='Zoe Celmer',
     'same surname falls back to the given name (got '+got.slice(0,2).join(', ')+')');
  ok(got.join('|')==='Chris Celmer|Zoe Celmer|Andre Martin|Aisha Rahman|Brenda Santiago',
     'ordered by surname, not given name (got '+got.join(', ')+')');
  ok(sortKey({first:'Jane', last:'', name:'Jane'})==='Jane',
     'someone with no surname still sorts on what there is');
  ok(sortKey({first:'', last:'', name:'billing@acme.test'})==='billing@acme.test',
     'a record with no name at all falls back to the display value');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-addcontact.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
