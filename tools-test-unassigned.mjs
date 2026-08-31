// Accounts that exist but are on no project.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// server
const ac = srv.split("if (op === 'allContacts')")[1].split("if (op === 'addContact')")[0];
ok(/const grantCount = \{\}/.test(ac), 'grants are counted per address');
ok(/grantsStore\(\)\.list\(\)/.test(ac), 'from the grants store');
ok(/projects: grantCount\[/.test(ac), 'and returned on each contact');
ok(/joined: pr\.updated_at \|\| pr\.added_at \|\| ''/.test(ac), 'a join date comes back too');
ok(/One walk of the grants/.test(ac), 'the cost is acknowledged');

// client
const rd = html.split('function renderContactDir')[1].split('let CD_DIRTY')[0];
ok(/const unassigned = list\.filter/.test(rd), 'the group is worked out');
ok(/!c\.pending/.test(rd), 'placeholders are excluded — they have no account');
ok(/!FIDEVIA_EMAIL\.test/.test(rd), 'Fidevia addresses are excluded');
ok(/!Number\(c\.projects\|\|0\)/.test(rd), 'only accounts on no project qualify');
ok(/list = list\.filter\(c=>!unassignedSubs\.has\(c\.sub\)\)/.test(rd),
   'they are lifted out of the A-Z rather than appearing twice');
ok(/Unassigned accounts/.test(rd), 'the band is labelled');
ok(/cd-band-warn/.test(rd) && /\.cd-band-warn td\{background:#FBF3E7/.test(html), 'and looks different');
ok(/Pinned above the A-Z/.test(rd), 'it sits at the top where it will be seen');
ok(rd.indexOf('unassignedRows') < rd.indexOf('letters.map'), 'and is emitted first');
ok(/found the sign-up page/.test(rd), 'the note names the unexpected case, not just the invited one');
ok(/unassigned\.length\?\(' · '\+unassigned\.length\+' unassigned'\)/.test(rd),
   'the count line mentions them');
ok(/const total=list\.length\+unassigned\.length/.test(rd),
   'and the total still counts everyone, since they were removed from the list');
ok(/unassigned\.slice\(\)\.sort\(byName\)/.test(rd),
   'sorting the group does not reorder the array it came from');

// who lands there
{
  const FID=/@fidevia\.com$/i;
  const pick=list=>list.filter(c=>!c.pending && !FID.test(String(c.email||'').trim()) && !Number(c.projects||0));
  const dir=[
    {name:'Stranger',      email:'someone@random.test',  pending:false, projects:0},
    {name:'Invited, idle', email:'new@acme.test',        pending:false, projects:0},
    {name:'Placed',        email:'onjob@acme.test',      pending:false, projects:2},
    {name:'Placeholder',   email:'notyet@acme.test',     pending:true,  projects:0},
    {name:'Fidevian',      email:'dcicala@fidevia.com',  pending:false, projects:0}
  ];
  const got=pick(dir).map(c=>c.name);
  ok(got.includes('Stranger'), 'an uninvited signup shows up — the case nothing else caught');
  ok(got.includes('Invited, idle'), 'so does someone invited who was never placed');
  ok(!got.includes('Placed'), 'someone on a project does not');
  ok(!got.includes('Placeholder'), 'nor does a contact with no account');
  ok(!got.includes('Fidevian'), 'nor Fidevia staff, who are on everything by domain');
  ok(got.length===2, 'exactly the two that need attention (got '+got.join(', ')+')');
  // once placed, they leave
  const after=pick(dir.map(c=>c.name==='Invited, idle'?{...c,projects:1}:c)).map(c=>c.name);
  ok(after.length===1 && after[0]==='Stranger', 'granting access removes them from the group');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-unassigned.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
