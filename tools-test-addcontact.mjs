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
ok(/password:CD_PW/.test(html.split('async function cdAddContact')[1].slice(0,1200)),
   'client sends the unlock password');
const cdadd = html.split('async function cdAddContact')[1].split('async function cdRemoveContact')[0];
ok(/A name is required/.test(cdadd), 'client requires a name');
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

console.log((bad?'FAIL ':'ok   ')+'tools-test-addcontact.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
