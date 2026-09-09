// "Revise and Resubmit" means the item is with whoever filed it. The status
// said so and nothing else did: the chain stayed on the architect, the log kept
// naming them in Assigned To, and the email announced a status change without
// saying whose move it was.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const J = c => JSON.parse(b.run('JSON.stringify('+c+')'));

// The row from the screenshot: an architect answered "Revise and Resubmit" and
// the chain is still sitting on their own step, in a parallel group with an
// engineer who never acted.
const stale = (extra='{}') => b.run(`allData.sub=[Object.assign({}, allData.sub[0], {
  'Submittal #':'SUB-GC-001','Description':'Wall',
  'Submitted By (Sub)':'theintergalacticinvestments@gmail.com (Summit Builders)',
  'Company':'Summit Builders','Reviewer':'Architect 2','Status':'Revise and Resubmit',
  'Workflow Step':'0','Workflow Status':'In Review','Workflow Extra':''
}, ${extra})]; allData.sub[0];`);

console.log('The chain catches up with the decision');
stale();
ok(b.run("wfHealReturn('sub', allData.sub[0])")===true, 'a row whose status disagrees with its chain is repaired');
{
  const steps = J("wfEffectiveSteps('sub', allData.sub[0]).map(s=>s.name)");
  ok(steps.length===3, 'the chain gains a step ('+steps.length+')');
  ok(steps[2]==='Revise and Resubmit', 'and it says what it is');
  ok(b.run("allData.sub[0]['Workflow Step']")==='2', 'the item is moved onto it');
  ok(b.run("allData.sub[0]['Workflow Status']")==='In Review', 'and the chain is open, not complete');
}
// The submitter was recorded as the address they signed up with. A step reading
// "theintergalacticinvestments@gmail.com" tells the rest of the project nothing.
b.run("allData.contacts.push({'Name':'Dave Chen','Company':'Summit Builders','Email':'theintergalacticinvestments@gmail.com'})");
stale();
b.run("wfHealReturn('sub', allData.sub[0])");
{
  const nw = J("wfNowWith('sub', allData.sub[0])");
  ok(nw && nw.label==='Dave Chen', 'an address the directory knows resolves to a name ('+(nw&&nw.label)+')');
  ok(nw && nw.firmLabel==='Summit Builders', 'and the firm is the one that filed it ('+(nw&&nw.firmLabel)+')');
  ok(nw && nw.returned===true, 'and it is marked as a return, not an ordinary next step');
}

console.log('Repairing it twice does not return it twice');
stale();
b.run("wfHealReturn('sub', allData.sub[0]); wfHealReturn('sub', allData.sub[0]); wfHealReturn('sub', allData.sub[0]);");
ok(J("wfEffectiveSteps('sub', allData.sub[0]).map(s=>s.name)").length===3,
   'three passes add one step');
// renderAll runs it on every draw, so it has to be safe to run on every draw.
stale(); b.run("renderAll(); renderAll();");
ok(J("wfEffectiveSteps('sub', allData.sub[0]).map(s=>s.name)").length===3,
   'and drawing the page twice does not either');

console.log('What it leaves alone');
// A chain that already records the return.
stale(`{'Workflow Extra':JSON.stringify([{after:1,name:'Revise and Resubmit',person:'Dave Chen',returned:true}]),'Workflow Step':'2'}`);
ok(b.run("wfHealReturn('sub', allData.sub[0])")===false, 'a chain that already says so is untouched');
// A finished or killed chain.
stale(`{'Workflow Status':'Complete'}`);
ok(b.run("wfHealReturn('sub', allData.sub[0])")===false, 'a complete chain is not reopened');
stale(`{'Workflow Status':'Rejected'}`);
ok(b.run("wfHealReturn('sub', allData.sub[0])")===false, 'nor is one closed against the item');
// An ordinary status.
stale(`{'Status':'Pending Review'}`);
ok(b.run("wfHealReturn('sub', allData.sub[0])")===false, 'and an item nobody sent back is left where it is');
ok(J("wfNowWith('sub', allData.sub[0])").returned===false,
   'wfNowWith reports a normal step as a normal step');

console.log('The log column names who has it');
stale(); b.run("renderAll()");
{
  const cell = b.run("assignedCell('sub', allData.sub[0], 'Reviewer')").replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  ok(/Summit Builders/.test(cell), 'the column shows the firm it went back to ('+cell+')');
  ok(!/Architect 2/.test(cell), 'not the firm that sent it back');
  ok(/sent back to revise/.test(cell), 'and says why it moved');
}
// An item nobody returned still reads exactly as it did before.
stale(`{'Status':'Pending Review'}`); b.run("renderAll()");
ok(/Architect 2/.test(b.run("assignedCell('sub', allData.sub[0], 'Reviewer')")),
   'an ordinary item still shows the reviewer it was assigned to');

console.log('Needs Your Attention follows the chain, not the column');
const lines = () => (b.run("document.getElementById('attention-panel').innerHTML")
  .match(/<div class="att-item"[\s\S]*?<\/div>/g)||[])
  .map(x=>x.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
b.run(`EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='a@x.test'; ME_NAME='Test Architect';
  currentProject.userCompany='Architect 2'; currentProject.userRole='architect'; DATA_READY=true;
  allData.rfi=[];`);
stale(); b.run("renderAll()");
ok(!lines().some(l=>/SUB-GC-001/.test(l)),
   'the architect who sent it back is not still chased for it');
b.run(`ME_EMAIL='theintergalacticinvestments@gmail.com'; ME_NAME='Dave Chen';
  currentProject.userCompany='Summit Builders'; currentProject.userRole='contractor';`);
stale(); b.run("renderAll()");
ok(lines().some(l=>/SUB-GC-001/.test(l)),
   'and the contractor who has to redraw it is');

console.log('The email says whose move it is');
{
  const c = html.slice(html.indexOf("let _nowWith='';"), html.indexOf("const _returnedTo="));
  ok(/\['Now With',_nowWith\]/.test(c), 'the notification carries a Now With row');
  ok(/to revise and resubmit/.test(c), 'which spells out what is being asked when it was sent back');
  ok(/Nobody — the review chain is complete/.test(c) && /Nobody — the review chain is closed/.test(c),
     'and says nobody, rather than guessing, when the chain has ended');
}
// The step is written to Box, not just drawn.
ok(/'Workflow Extra':row\['Workflow Extra'\]\|\|'', 'Workflow Reassigned'/.test(html),
   'the added step is saved with the rest of the review');

console.log('What the contractor is actually shown');
// Two Dave Chens in the directory: the step has to name the one who filed it,
// which the row knows and a name lookup does not.
b.run(`allData.contacts=[{'Name':'Dave Chen','Company':'Summit Builders','Email':'d@s.test'},
  {'Name':'Dave Chen','Company':'Summit Builders','Email':'theintergalacticinvestments@gmail.com'},
  {'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'}];
  EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='theintergalacticinvestments@gmail.com'; ME_NAME='Dave Chen';
  currentProject.userCompany='Summit Builders'; currentProject.userRole='contractor';
  allData.rfi=[]; allData.co=[]; allData.pay_apps=[];`);
stale(); b.run("renderAll()");
{
  const panel = b.run("wfProgressHTML('sub', allData.sub[0], 0)");
  ok(/Awaiting you/.test(panel),
     'the person the item went back to is told it is on them, by name off the row');
  ok(/YOUR TURN/.test(panel) && !/YOUR REVIEW/.test(panel),
     'and it is called their turn, not their review — they are redrawing, not reviewing');
  ok(/Submit Revision/.test(b.run("verThreadRows('sub', allData.sub[0], 0, 10)")),
     'the button asks for a revision rather than a review');
  const att = lines().join(' ');
  ok(/Revise and resubmit/.test(att) && !/Your review/.test(att),
     'Needs Your Attention says the same thing ('+att+')');
}
// The email carries it too.
{
  const body = b.run(`emailTemplate('Submittal Updated: Revise and Resubmit',
    [['Submittal #','SUB-GC-001'],['Now With',(function(){const nw=wfNowWith('sub',allData.sub[0]);
      return nw.label+' ('+nw.firmLabel+')'+(nw.returned?' \u2014 to revise and resubmit':'');})()]],
    'Ithaca')`).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  ok(/Now With/.test(body) && /Summit Builders/.test(body) && /to revise and resubmit/.test(body),
     'and so does the email that goes out');
}

// Whose line it is gets decided by the address, not by the display name, which
// is not always loaded when the panel is drawn.
b.run("ME_NAME=''");
stale(); b.run("renderAll()");
ok(/Revise and resubmit/.test(lines().join(' ')),
   'the line still reads as mine when only my address is known');

console.log('A returned step belongs to the firm, not to one address');
// The live row's returned step carries no address at all, and the person who
// uploads the revision is often not the person who uploaded the first version.
b.run(`allData.contacts=[{'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@summit.test'},
  {'Name':'Site Super','Company':'Summit Builders','Email':'super@summit.test'},
  {'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'}];
allData.sub=[Object.assign({}, allData.sub[0], {'Submittal #':'SUB-GC-001','Status':'Resubmitted',
  'Company':'Summit Builders','Reviewer':'Architect 2','Workflow Step':'2','Workflow Status':'In Review',
  'Workflow Extra':JSON.stringify([{after:1,name:'Revise and Resubmit',person:'Test Contractor',
    company:'Summit Builders',email:'',returned:true}])})];`);
const seenBy = (email,co,role) => { b.run(`EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='${email}';ME_NAME='';
  currentProject.userCompany='${co}';currentProject.userRole='${role}';DATA_READY=true;renderAll();`);
  return {panel:b.run("wfProgressHTML('sub',allData.sub[0],0)"),
          row:b.run("verThreadRows('sub',allData.sub[0],0,10)")}; };
{
  const colleague = seenBy('super@summit.test','Summit Builders','contractor');
  ok(/Awaiting you/.test(colleague.panel),
     'anyone at the firm it went back to sees it as theirs, address or no address');
  ok(/Submit Revision/.test(colleague.row), 'and is offered the revision, not a reply');
  const architect = seenBy('a@x.test','Architect 2','architect');
  ok(!/Awaiting you/.test(architect.panel), 'the reviewer who sent it back does not own it');
  ok(/Submit Review Step/.test(architect.row),
     'and their button is unchanged — a reviewer still submits a review step');
  const other = seenBy('someone@gorilla.test','Gorilla Construction','contractor');
  ok(!/Awaiting you/.test(other.panel), 'and another contractor on the job does not own it either');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-sentback.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
