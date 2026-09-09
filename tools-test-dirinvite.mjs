// Two things about adding somebody: offering them a way in, and not burying
// the project you meant among the ones that are finished.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
b.run("ACCOUNT_EMAILS=new Set(['taken@example.com','dcicala@fidevia.com']); ACCOUNTS_LOADED=true;");
const check=async(em)=>{
  b.run("document.getElementById('cdn-invite').checked=true; document.getElementById('cdn-invite').disabled=false;");
  b.run("document.getElementById('cdn-email').value="+JSON.stringify(em));
  await b.run("cdInviteCheck()");
  return {offer: b.run("document.getElementById('cdn-invite').checked")
                 && !b.run("document.getElementById('cdn-invite').disabled"),
          hint: b.run("document.getElementById('cdn-invite-hint').textContent")}; };

console.log('Who is offered an invitation');
{
  const fresh = await check('new@example.com');
  ok(fresh.offer, 'somebody with no account is');
  const taken = await check('taken@example.com');
  ok(!taken.offer, 'somebody who already has one is not');
  ok(/already has an account/.test(taken.hint), 'and is told why rather than just losing the option');
  const fid = await check('dcicala@fidevia.com');
  ok(!fid.offer, 'nor is a Fidevia address');
  ok(/every project/.test(fid.hint), 'which has an account and every project already');
  const blank = await check('');
  ok(blank.offer, 'and before an address is typed the offer stands');
}
ok(/oninput="cdInviteCheck\(\)"/.test(html), 'the answer follows the address as it is typed');
ok(/ensureAccounts\(\)\.then\(\(\)=>\{ try\{ cdInviteCheck\(\); \}catch\(e\)\{\} \}\)/.test(html),
   'and the account list is fetched when the form opens, not when the address is finished');

console.log('What gets sent');
{
  const c = html.split('async function cdAddContact')[1].split('\nfunction ')[0];
  ok(/contactNeedsInvite\(\{Email:email\}\)/.test(c),
     'the same rule the project contact sheet uses decides it');
  ok(c.indexOf('await proxyCall(\'addContact\'') < c.indexOf('sendEmail'),
     'the contact is saved before anything is emailed — a lost email is recoverable, a lost contact is not');
  ok(/catch\(e\)\{ console\.warn\('invite:'/.test(c),
     'and a bounced invitation does not fail the add');
  ok(/No invitation sent \\u2014 that address already has an account/.test(c),
     'if it was asked for and not needed, that is said rather than silently skipped');
}
// The invitation has no project to name when it comes from the directory.
{
  const c = html.split('function inviteEmailHTML')[1].split('\nasync function ')[0];
  ok(/projectName\s*\n?\s*\? 'You\\u2019ve been invited to collaborate on the /.test(c.replace(/\s+/g,' ').replace(/ \? /,' ? '))
     || /projectName/.test(c), 'it names a project when there is one');
  ok(/Fidevia has set you up on the Fidevia Construction Dashboard/.test(c),
     'and says something true when there is not, rather than "collaborate on the "');
  ok(/request access to '\s*\n?\s*\+\(projectName\?'this project':'a project'\)/.test(c.replace(/\s+/g,' ').replace(/'\s*\+\(/,"'+(")) 
     || /projectName\?'this project':'a project'/.test(c),
     'and the footnote agrees with it');
}

console.log('Archived projects go to the bottom');
ok(/archived: _archSet\.has\(String\(e\.id\)\)/.test(srv),
   'whether a project is archived travels with the listing');
ok(/const _archSet = new Set\(\(_arch \|\| \[\]\)\.map\(String\)\)/.test(srv),
   'read once on the server rather than fetched separately by each caller');
b.run(`GRANT_PROJECTS=[{id:'1',name:'Zebra Ridge'},{id:'2',name:'Ithaca Housing',archived:true},
  {id:'3',name:'Apple Street'},{id:'4',name:'Boxwood',archived:true}];`);
{
  const order=JSON.parse(b.run("JSON.stringify(projectsLiveFirst(GRANT_PROJECTS).map(p=>p.name))"));
  ok(JSON.stringify(order)===JSON.stringify(['Apple Street','Zebra Ridge','Boxwood','Ithaca Housing']),
     'live first then archived, each alphabetical ('+order.join(', ')+')');
  ok(/— archived/.test(b.run("projectOptionLabel(GRANT_PROJECTS[1])")),
     'and an archived one says so, since it is still a legitimate thing to pick');
  ok(b.run("projectOptionLabel(GRANT_PROJECTS[0])")==='Zebra Ridge', 'while a live one is left alone');
}
b.run("renderGrantProjectList()");
{
  const out=b.run("document.getElementById('grant-project-list').innerHTML");
  ok(out.indexOf('Apple Street')<out.indexOf('Ithaca Housing'), 'the grant checklist orders the same way');
  ok(/>archived</.test(out), 'and labels them there too');
}
ok(/const avail=projectsLiveFirst\(GRANT_PROJECTS\.filter/.test(html),
   'so does the dropdown on a person’s record');

console.log((bad?'FAIL ':'ok   ')+'tools-test-dirinvite.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
