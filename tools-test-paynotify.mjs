// "Add a column — pay pencil / pay final. Then make it yes no. Contractors are
// given an auto designation where they are only notified when things happen
// pertaining to their pay app."
//
// Inference was tried and it kept being wrong: a role granted on the project, a
// word typed in a Role column, a name on a review chain. Each rule reached
// somebody it should not have or missed somebody it should have, and neither
// failure shows until an email has gone. A column shows.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
const C=(o)=>Object.assign({'Name':'','Company':'','Role':'','Email':'',
  'Notify - Pay Pencil':'','Notify - Pay Final':''}, o);
function people(list){ P.run(`allData.contacts=${JSON.stringify(list)};`); }
P.run(`currentProject={name:'X',config:{contractors:[
  {name:'Summit Builders'},{name:'Delaney Mechanical'}]}};`);
people([
  C({'Name':'Christopher Cicala','Company':'Fidevia','Email':'chris@fidevia.com',
     'Notify - Pay Pencil':'Yes','Notify - Pay Final':'Yes'}),
  C({'Name':'Quiet Architect','Company':'Architect 2','Role':'Principal','Email':'arch@example.com',
     'Notify - Pay Pencil':'Yes','Notify - Pay Final':'Yes'}),
  C({'Name':'Quiet Engineer','Company':'Engineer 1','Role':'Associate','Email':'eng@example.com',
     'Notify - Pay Pencil':'Yes','Notify - Pay Final':'No'}),
  C({'Name':'Owen Owner','Company':'Riverside School District','Email':'owen@rsd.example',
     'Notify - Pay Pencil':'No','Notify - Pay Final':'Yes'}),
  C({'Name':'Sophie','Company':'Fidevia','Email':'sophie@fidevia.com'}),
  C({'Name':'Sam Summit','Company':'Summit Builders','Email':'sam@summit.example'}),
  C({'Name':'Dana Delaney','Company':'Delaney Mechanical','Email':'dana@delaney.example',
     'Notify - Pay Pencil':'Yes','Notify - Pay Final':'Yes'})
]);
const ROW=(o)=>Object.assign({'App #':'PA #01','Contractor':'Summit Builders','Company':'Summit Builders',
  'Copy Type':'Pencil','Period':'2026-09-01'}, o);
const to=(row)=>P.run(`payNotifyEmails(${JSON.stringify(row||ROW())})`).slice().sort();
const FINAL=(o)=>ROW(Object.assign({'Copy Type':'Final'},o));

console.log('The column decides, and the two halves decide separately');
{
  const p=to();
  ok(p.includes('chris@fidevia.com') && p.includes('arch@example.com') && p.includes('eng@example.com'),
     'a Yes on Pay Pencil is on the pencil copy thread');
  ok(!p.includes('owen@rsd.example'), 'a No is not');
  ok(!p.includes('sophie@fidevia.com'),
     'and neither is somebody nobody has ticked \u2014 being at Fidevia is not an answer to the question');
  const f=to(FINAL());
  ok(f.includes('owen@rsd.example'), 'the owner was ticked for final applications, and gets those');
  ok(!f.includes('eng@example.com'),
     'and the engineer, ticked for pencil copies only, does not \u2014 the two halves are asked separately');
  ok(f.includes('arch@example.com'), 'somebody ticked for both is on both');
}
{
  ok(P.run(`payNotifyFieldFor({'Copy Type':'Pencil'})`)==='Notify - Pay Pencil', 'a pencil row reads the pencil column');
  ok(P.run(`payNotifyFieldFor({'Copy Type':'Final'})`)==='Notify - Pay Final', 'a final row reads the final one');
  ok(P.run(`payNotifyFieldFor({})`)==='Notify - Pay Final',
     'and a row that does not say which it is is treated as the formal one, not the draft');
  ok(/'Notify - RFI','Notify - CO','Notify - Submittal','Notify - Pay Pencil','Notify - Pay Final'/.test(html),
     'both columns are on the contact sheet');
  ok(!/Notify - Pay App'/.test(html), 'and the single column they replace is gone');
}
{
  people([C({'Name':'Shouty','Company':'Architect 2','Email':'a@x.com','Notify - Pay Pencil':'YES'}),
          C({'Name':'Spaced','Company':'Architect 2','Email':'b@x.com','Notify - Pay Pencil':' yes '})]);
  ok(to().length===2, 'a yes is a yes however it was written');
  people([C({'Name':'Odd','Company':'Architect 2','Email':'c@x.com','Notify - Pay Pencil':'true'})]);
  ok(to().length===0, 'and anything that is not yes is no, rather than being guessed at');
}

console.log('A contractor is told about their own, and that is not a switch');
{
  people([
    C({'Name':'Sam Summit','Company':'Summit Builders','Email':'sam@summit.example'}),
    C({'Name':'Dana Delaney','Company':'Delaney Mechanical','Email':'dana@delaney.example',
       'Notify - Pay Pencil':'Yes','Notify - Pay Final':'Yes'}),
    C({'Name':'Christopher Cicala','Company':'Fidevia','Email':'chris@fidevia.com',
       'Notify - Pay Pencil':'Yes','Notify - Pay Final':'Yes'})
  ]);
  ok(to().includes('sam@summit.example'),
     'their own application reaches them with nothing ticked \u2014 Auto, not a preference');
  ok(!to().includes('dana@delaney.example'),
     'and another contractor does not, though every box of theirs says Yes');
  ok(to(ROW({'Contractor':'Delaney Mechanical','Company':'Delaney Mechanical'})).includes('dana@delaney.example'),
     'on their own, they do');
  ok(!to(ROW({'Contractor':'Delaney Mechanical','Company':'Delaney Mechanical'})).includes('sam@summit.example'),
     'and the first one does not \u2014 which is the whole point of the rule');
  ok(to(FINAL()).includes('sam@summit.example'), 'the same on a final application');
  ok(to().includes('chris@fidevia.com'), 'while a ticked non-contractor is on both');
}
{
  ok(P.run(`payContractorOf({'Company':'Summit Builders'})`)==='summit builders', 'a contractor is recognised');
  ok(P.run(`payContractorOf({'Company':'Architect 2'})`)==='', 'a design firm is not one');
  ok(P.run(`payContractorOf({'Company':''})`)==='', 'nor is somebody with no firm recorded');
  ok(to(ROW({'Contractor':'','Company':''})).includes('chris@fidevia.com'),
     'a row with no contractor still reaches whoever is ticked');
  ok(!to(ROW({'Contractor':'','Company':''})).includes('sam@summit.example'),
     'and no contractor at all, since none of them own it');
}
{
  people([C({'Name':'No Address','Company':'Architect 2','Email':'','Notify - Pay Pencil':'Yes'})]);
  ok(to().length===0, 'a contact with no address is not a recipient');
  ok(P.run(`payNotifyAudience(${JSON.stringify(ROW())}).length`)===0,
     'and is not on the thread at all, rather than being counted and then dropped');
}
{
  // Restored for the sends below.
  people([
    C({'Name':'Christopher Cicala','Company':'Fidevia','Email':'chris@fidevia.com',
       'Notify - Pay Pencil':'Yes','Notify - Pay Final':'Yes'}),
    C({'Name':'Sam Summit','Company':'Summit Builders','Email':'sam@summit.example'})
  ]);
}

console.log('One address, once');
{
  P.run(`SENT=null; sendEmail=function(to){ SENT=to; };
    payNotify(${JSON.stringify(ROW())}, 's', 'b',
      {extraTo:['CHRIS@fidevia.com','sam@summit.example','extra@example.com']});`);
  const sent=P.run(`SENT`);
  ok(sent.filter(e=>/chris@fidevia\.com/i.test(e)).length===1,
     'somebody already on the thread who is named again is not written to twice \u2014 case included');
  ok(sent.includes('extra@example.com'), 'while a genuinely extra address still goes on');
}

console.log('Nothing about a payment application goes out the old way');
{
  ['submitPayReplace','submitPayAction'].forEach(fn=>{
    const b=html.split((fn==='submitPayReplace'?'async function ':'async function ')+fn+'(){')[1];
    const body=b.slice(0, b.indexOf('\n}\n'));
    ok(!/notifyContacts\(/.test(body), fn+' does not use the shared toggle list');
    ok(/payNotify\(/.test(body), fn+' uses the rule');
  });
  ok(!/pay_apps:'Notify - CO'/.test(html),
     'and the workflow paths no longer borrow the change order toggle for it');
  // Those two sends carry the row, so notifyContacts hands them to the rule
  // regardless; the field they name is only a fallback that is never reached.
  ok(/pay_apps:'Notify - Pay Pencil'/.test(html), 'they name a field that exists');
  const nc=html.split('function notifyContacts(notifyField, subject, bodyHTML, opts){')[1].split('\n}')[0];
  ok(/if\(opts\.payRow\) return payNotify\(opts\.payRow, subject, bodyHTML, opts\);/.test(nc),
     'and notifyContacts itself hands a payment application over to the rule, so a call that names the '
     +'wrong field cannot quietly send it to everybody');
  ok((html.match(/payRow: key==='pay_apps' \? row : null/g)||[]).length===2,
     'which both workflow sends pass');
}

console.log('And it is in Settings, with the rule stated')
{
  const pane=html.split('id="set-pane-notifs"')[1].split('id="set-pane-')[0];
  ok(/<h3[^>]*>Payment Application<\/h3>/.test(pane), 'payment applications have their own entry');
  ok(/id="nt-pay-subject"/.test(pane) && /id="nt-pay-intro"/.test(pane), 'with a subject and a heading');
  ok(/one column for pencil copies and one for/.test(pane),
     'and says the two halves are asked separately');
  ok(/never\s+about anybody else's, which is not something to switch on or off/.test(pane),
     'and what Auto means for a contractor');
  ok(/pay_apps:\{subject:'\[Fidevia\] Payment Application: \{number\}'/.test(html), 'a default to start from');
  ok(/document\.getElementById\('nt-pay-subject'\)\.value=g\('pay_apps','subject'\)/.test(html), 'loaded');
  ok(/pay_apps:\{subject:val\('nt-pay-subject'\),intro:val\('nt-pay-intro'\)\}/.test(html), 'and saved');
}
{
  ok(/>PAY PENCIL<\/th>/.test(html) && /<th[^>]*>PAY FINAL<\/th>/.test(html),
     'the contacts table has a column for each half of the cycle');
  ok(/\+payTog\(r,i,'pencil'\)\+payTog\(r,i,'final'\)/.test(html),
     'and every row draws both, or a header would stand over nothing');
  const t=html.split('const payTog=(r,i,which)=>{')[1].split('\n  };')[0];
  ok(/const f=PAY_NOTIFY_FIELD\[which\];/.test(t), 'each writes its own column');
  ok(/toggleNotify\(/.test(t),
     'through the same switch the three beside them use \u2014 one kind of control, not two');
  ok(/\+\(yes\?'Yes':'No'\)/.test(t), 'reading Yes or No, like its neighbours');
  ok(/if\(payContractorOf\(r\)\)/.test(t) && />Auto<\/span>/.test(t),
     'except a contractor, who reads Auto');
  ok(/cursor:default/.test(t) && !/onclick[^>]*Auto/.test(t),
     'and cannot be switched, because the answer is not a preference');
  ok(/told about their own payment applications, and no others/.test(t), 'with the reason on hover');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-paynotify.mjs \u2014 '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
