// The three ways a placeholder and a real signup can collide.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const prof = fs.readFileSync('netlify/functions/profile.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ══ 1. same email, identical details — clean merge, provenance survives ══
ok(/placeholder\.entered = \{/.test(prof), 'adoption records what was entered');
ok(/const prev = await store\.get\(sub, \{ type: 'json' \}\)/.test(prof),
   'profile POST reads the previous record before rebuilding it');
ok(/if \(prev && prev\.entered\) profile\.entered = prev\.entered/.test(prof),
   'the original entry survives the person saving their profile');
ok(/store\.delete\(key\)/.test(prof), 'the placeholder is deleted, so no duplicate row');

// the POST rebuild really does drop unlisted fields — that is why the above matters
{
  const post = prof.split("req.method === 'POST'")[1];
  ok(!/\.\.\.prev/.test(post) && !/Object\.assign\(prev/.test(post),
     'POST rebuilds rather than merges, so only named fields survive');
}

// ══ 2. same email, conflicting details — theirs wins, but it is visible ══
const ac = srv.split("if (op === 'allContacts')")[1].split("if (op === 'addContact')")[0];
ok(/if \(pr\.entered\)/.test(ac), 'allContacts compares against the original entry');
ok(/if \(Object\.keys\(was\)\.length\)/.test(ac), 'only a real difference is reported');
ok(/row\.enteredBy/.test(ac), 'who entered it is carried through');
ok(/c\.was\?'<span class="cd-diff"/.test(html), 'a difference is badged in the directory');
ok(/function cdShowEntered/.test(html), 'the badge opens a comparison');
{
  // the comparison is case- and whitespace-insensitive, or every row would flag
  const cmp = ac.split('const cmp =')[1].slice(0,400);
  ok(/toLowerCase\(\)/.test(cmp) && /\.trim\(\)/.test(cmp),
     'casing and stray spaces do not count as a change');
  ok(/if \(a &&/.test(cmp), 'a blank original is not reported as a change');
}
const showFn = html.split('async function cdShowEntered')[1].split('async function cdMergeStranded')[0];
ok(/Their version is what the dashboard uses/.test(showFn),
   'the comparison is explicit that their version stands');
ok(/clearEntered/.test(showFn), 'the flag can be dismissed once reviewed');
{
  const ce = srv.split("if (op === 'clearEntered')")[1].split("if (op === 'mergeContact')")[0];
  ok(/who\.isAdmin/.test(ce) && /PANEL_PW\(\)/.test(ce), 'clearEntered is admin and password guarded');
  ok(/delete pr\.entered/.test(ce) && !/pr\.company =/.test(ce),
     'dismissing forgets the original only — their details are untouched');
}

// ══ 3. same name, different email — warned at entry, caught afterwards ══
const cdadd = html.split('async function cdAddContact')[1].split('let cdNameWarned|async function cdShowEntered')[0];
ok(/const sameName=CONTACT_DIR\.filter/.test(html), 'adding checks for an existing name');
ok(/adding a second address would split their access/.test(html),
   'the warning explains the consequence rather than just objecting');
ok(/cdNameWarned/.test(html), 'the warning can be overridden — two people can share a name');
ok(/oninput="cdNameWarned=''"/.test(html), 'changing the name re-arms the warning');

ok(/c\._stranded = c\.pending \?/.test(html), 'a placeholder sharing a name with an account is flagged');
ok(/if\(!c\.pending\)\{ const k=String\(c\.name/.test(html), 'only real accounts are candidates to match against');
ok(/cd-strand/.test(html), 'stranded records are badged');

const mg = srv.split("if (op === 'mergeContact')")[1].split("// Once the difference has been looked at")[0];
ok(/who\.isAdmin/.test(mg) && /PANEL_PW\(\)/.test(mg), 'mergeContact is admin and password guarded');
ok(/Only a contact without an account can be merged away/.test(mg),
   'merge refuses to delete a real account');
ok(/Merge into an account, not into another placeholder/.test(mg), 'merge target must be a real account');
ok(/fromEmail === toEmail/.test(mg), 'merge refuses when both share an address');
ok(/const fg = \(await gstore\.get\(fromEmail/.test(mg), 'merge reads the stranded grants');
ok(/if \(ex\) continue;/.test(mg), 'an existing grant on the real account is not overwritten');
ok(/await gstore\.delete\(fromEmail\)/.test(mg), 'the stranded grant record is removed');
ok(/await store\.delete\(fromSub\)/.test(mg), 'the placeholder profile is removed');
ok(/if \(body\.dryRun\) return json/.test(mg), 'merge can be previewed before it acts');
ok(mg.indexOf('if (body.dryRun)') < mg.indexOf('await gstore.delete(fromEmail)'),
   'the dry run returns before anything is written');
ok(/if \(!String\(to\[ck\] \|\| ''\)\.trim\(\)/.test(mg),
   'details are only carried over where the account has none');

const ms = html.split('async function cdMergeStranded')[1].split('async function cdRemoveContact')[0];
ok(/dryRun:true/.test(ms), 'the client previews before confirming');
ok(/Their account and any access it already has are untouched/.test(ms),
   'the confirmation says what is not affected');
ok(/No project access is sitting on the directory entry/.test(ms),
   'the nothing-to-move case reads sensibly rather than showing an empty list');
ok(/if\(!CD_UNLOCKED\)/.test(ms), 'merging needs the directory unlocked');

// ══ the badges must not collide with the pending badge ══
ok(/c\.pending\?'<span class="cd-pend"/.test(html), 'the no-account badge still renders');
ok(html.indexOf('cd-strand') < html.indexOf("c.was?'<span class=\"cd-diff\"") ||
   /cd-strand[\s\S]{0,400}cd-diff/.test(html.split('const rowHtml=c=>{')[1]||''),
   'stranded and changed badges both sit on the row');

console.log((bad?'FAIL ':'ok   ')+'tools-test-collide.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
