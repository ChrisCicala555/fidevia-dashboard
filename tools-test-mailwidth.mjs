// "On mobile, the email notifications are too far to the right.. can we move
// them closer to the left? Just move the divider over."
//
// The label column was a fixed 180px. On a desktop card of 600px that is a
// third; on a 360px phone it is half the screen, so every value was squeezed
// into a column four words wide and "Project Management and Coordination" came
// down the page one word at a time.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const proxy=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const P=bootPage('index.html'); P.run(SEED);

const mail=P.run(`emailTemplate('New Submittal: SUB-GC-005',
  [['Submittal #','SUB-GC-005'],
   ['Spec Section','01 31 00 Project Management and Coordination'],
   ['Submitted By','Test Contractor (Summit Builders)'],
   ['Reviewer','Architect 2'],
   ['Status','Pending Review']], 'Ithaca Housing Complex')`);

console.log('The divider is proportional, not fixed');
{
  ok(!/width:180px/.test(mail),
     'no fixed label column — 180px is a third of the card on a desktop and half of it on a phone');
  ok((mail.match(/width:34%/g)||[]).length===5,
     'each label cell takes a share of whatever width there is (got '
     +(mail.match(/width:34%/g)||[]).length+' of 5 rows)');
  ok(/max-width:600px/.test(mail), 'while the card itself is still capped, so it does not sprawl on a desktop');
}

console.log('And the gutters are not a tenth of the screen');
{
  ok(/padding:28px 8px/.test(mail),
     'the outer margin gives way on a narrow screen — 16px each side of a 360px phone is a tenth of '
     +'it spent on nothing');
  ok(/padding:11px 10px 11px 14px/.test(mail), 'and the label cell is tighter against the divider');
  ok(/padding:11px 14px 11px 10px/.test(mail), 'with the value starting just the other side of it');
}

console.log('The content is unchanged');
{
  ok(/SUB-GC-005/.test(mail) && /Project Management and Coordination/.test(mail),
     'every row still carries what it carried');
  ok(/Pending Review/.test(mail), 'including the status');
  ok(/Ithaca Housing Complex/.test(mail), 'and the project');
  ok(/Open in Dashboard|dashboard\.fidevia\.com/.test(mail), 'and the way back in');
}

console.log('The access email is the same shape');
{
  ok(!/width:170px/.test(proxy), 'its label column was fixed too');
  ok(/width:34%/.test(proxy),
     'and now matches — two templates drifting apart is how one of them quietly stops being read '
     +'on a phone');
}

console.log(bad ? `FAIL tools-test-mailwidth.mjs — ${bad} of ${n}` : `ok   tools-test-mailwidth.mjs — ${n} assertions`);
process.exit(bad?1:0);
