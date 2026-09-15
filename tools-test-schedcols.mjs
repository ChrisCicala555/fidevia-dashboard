// "On Schedule, for the contractors, remove Actual Date and Deviation."
//
// Those two are Fidevia's reading of how the job is tracking. A contractor sees
// the dates they are held to; put the slippage in front of one trade and it
// invites a conversation the row has no context for.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`currentProject.config.milestones=[
  {name:'Notice to Proceed', baseline:'2026-09-15', contract:'2026-09-14'},
  {name:'Substantial Completion', contract:'2026-12-31'}];
  renderSchedule();`);
const body=P.run(`document.getElementById('tbody-schedule').innerHTML`);
const cells=r=>[...String(r).matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map(m=>({attr:m[1], text:m[2]}));

console.log('Every column is still rendered, and the two are labelled');
{
  const first=cells(body.split('</tr>')[0]);
  ok(first.length===4, 'four cells on a milestone row — got '+first.length);
  ok(/sched-actual/.test(first[1].attr), 'Actual Date carries the class');
  ok(/sched-actual/.test(first[3].attr), 'and so does Deviation');
  ok(!/sched-actual/.test(first[0].attr), 'the milestone name does not');
  ok(!/sched-actual/.test(first[2].attr), 'and neither does Contract Date — that is what they are held to');
  ok(first[1].text.indexOf('09/15/2026')>=0, 'the actual date is still in the markup for everyone else');
  ok(first[3].text.indexOf('+1 days')>=0, 'and so is the deviation');
}

console.log('The heading matches the body');
{
  const head=html.slice(html.indexOf('<th>Milestone</th>'), html.indexOf('tbody-schedule'));
  ok(/<th class="sched-actual">Actual Date<\/th>/.test(head), 'the Actual Date heading is hidden with its column');
  ok(/<th class="sched-actual">Deviation<\/th>/.test(head), 'and the Deviation heading');
  ok(/<th>Contract Date<\/th>/.test(head), 'while Contract Date stays');
  ok((head.match(/sched-actual/g)||[]).length===2,
     'exactly two headings are marked, or a column would lose its heading and shift');
}

console.log('Who it is hidden from');
{
  ok(/body\.role-contractor \.sched-actual\{display:none;\}/.test(html),
     'hidden for the contractor view, in CSS rather than by rebuilding the table');
  ok(!/body\.external-mode \.sched-actual/.test(html),
     'not for every external reader — the architect, engineer and owner review progress and keep them');
  // role-contractor covers the Custom role too, which is company-scoped the
  // same way. That is set centrally, so this inherits it.
  const rc=html.slice(html.indexOf("classList.toggle('role-contractor'"));
  ok(/r==='contractor'\|\|r==='custom'/.test(rc.slice(0,120)),
     'and a Custom grant is scoped like a contractor, so it is covered by the same class');
}

console.log('And nor is the provenance line');
{
  ok(/body\.role-contractor #sched-updated\{display:none !important;\}/.test(html),
     'the "updated as of ... by ..." line is hidden from the contractor view');
  ok(/!important/.test((html.match(/body\.role-contractor #sched-updated\{[^}]*\}/)||[''])[0]),
     'with !important, because the render sets display inline on that element');
  // It is still built, so every other role keeps it.
  P.run(`currentProject.config.milestonesUpdatedAt='2026-09-10';
         currentProject.config.milestonesUpdatedBy='Christopher Cicala';
         currentProject.config.onsiteCM='Christopher Cicala';
         currentProject.config.milestones=[{name:'Notice to Proceed', contract:'2026-09-14'}];
         renderSchedule();`);
  const up=P.run(`document.getElementById('sched-updated').textContent`);
  ok(/Updated as of/.test(up) && /Christopher Cicala/.test(up),
     'the line is still written, so Fidevia and the design team keep it — got '+up);
}

console.log('Nothing else moved');
{
  ok(/colspan="4"/.test(body)===false || /No milestones set/.test(body)===false,
     'a populated table has no empty row');
  P.run(`currentProject.config.milestones=[]; renderSchedule();`);
  const empty=P.run(`document.getElementById('tbody-schedule').innerHTML`);
  ok(/colspan="4"/.test(empty), 'the empty row still spans all four columns');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-schedcols.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
