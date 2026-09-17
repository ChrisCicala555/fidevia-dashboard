// "It should keep the architect, Fidevia, the submitting contractor and the
// engineers on the email thread... for payment applications we should keep
// contractors with their own payment applications and then not be copied on
// not their own."
//
// Every other module tells whoever ticked its box, and that is right for an
// RFI: the question and the answer concern the whole job. A payment
// application is one contractor's money. Sending it to the change order list
// told every other contractor on the job what Summit Builders had billed —
// which the dashboard itself refuses to show them.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`
  allData.contacts=[
    {'Name':'Christopher Cicala','Company':'Fidevia','Role':'CM','Email':'chris@fidevia.com'},
    {'Name':'Test Architect','Company':'Architect 2','Role':'Architect','Email':'arch@example.com'},
    {'Name':'Test Engineer','Company':'Engineer 1','Role':'Structural Engineer','Email':'eng@example.com'},
    {'Name':'Sam Summit','Company':'Summit Builders','Role':'PM','Email':'sam@summit.example'},
    {'Name':'Dana Delaney','Company':'Delaney Mechanical','Role':'PM','Email':'dana@delaney.example'},
    {'Name':'Owen Owner','Company':'Riverside School District','Role':'Business Manager','Email':'owen@rsd.example'}
  ];
  PROJECT_ROLES={};
`);
const ROW=(o)=>Object.assign({'App #':'PA #01','Contractor':'Summit Builders','Company':'Summit Builders',
  'Copy Type':'Pencil','Period':'2026-09-01'}, o);
const to=(row)=>P.run(`payNotifyEmails(${JSON.stringify(row||ROW())})`).slice().sort();

console.log('Who is on the thread');
{
  const list=to();
  ok(list.includes('chris@fidevia.com'), 'Fidevia');
  ok(list.includes('arch@example.com'), 'the architect');
  ok(list.includes('eng@example.com'), 'the engineers');
  ok(list.includes('sam@summit.example'), 'and the contractor whose application it is');
}
{
  const list=to();
  ok(!list.includes('dana@delaney.example'),
     "but not another contractor — they may not see this application, so they may not be told about it");
  const theirs=to(ROW({'Contractor':'Delaney Mechanical','Company':'Delaney Mechanical'}));
  ok(theirs.includes('dana@delaney.example') && !theirs.includes('sam@summit.example'),
     'and it is the other way round on theirs');
  ok(theirs.includes('chris@fidevia.com') && theirs.includes('arch@example.com'),
     'with Fidevia and the design team on both, since they review every application');
}
{
  ok(!to().includes('owen@rsd.example'),
     'the owner is not on it: they see final applications on the dashboard, and never the pencil copies');
}
{
  // Roles come from the grant as well as from the contact sheet, because a firm
  // added but never signed in has only the latter, and a person who signed in
  // may have only the former.
  P.run(`allData.contacts=allData.contacts.concat([
    {'Name':'Quiet Engineer','Company':'Engineer 9','Role':'','Email':'quiet@e9.example'}]);
    PROJECT_ROLES={'quiet@e9.example':'engineer'};`);
  ok(to().includes('quiet@e9.example'), 'a granted design role with nothing written on the contact sheet');
  // With no firm recorded either, the granted role is the only thing that can
  // answer for them.
  P.run(`allData.contacts=allData.contacts.concat([
    {'Name':'Firmless','Company':'','Role':'','Email':'firmless@e9.example'}]);
    PROJECT_ROLES['firmless@e9.example']='architect';`);
  ok(to().includes('firmless@e9.example'), 'and one with no firm recorded either');
  P.run(`delete PROJECT_ROLES['firmless@e9.example'];`);
  ok(!to().includes('firmless@e9.example'), 'who drops off the moment the grant does');
  P.run(`allData.contacts=allData.contacts.filter(function(c){ return c['Email']!=='firmless@e9.example'; });`);
  P.run(`allData.contacts=allData.contacts.concat([
    {'Name':'Colleague','Company':'Engineer 9','Role':'','Email':'colleague@e9.example'}]);`);
  ok(to().includes('colleague@e9.example'),
     'and their colleague at the same firm, because firms are added as firms and one of them signs in');
  P.run(`PROJECT_ROLES={};`);
  ok(!to().includes('quiet@e9.example'),
     'with neither a role written nor one granted, nobody is assumed onto the thread');
  P.run(`allData.contacts=allData.contacts.filter(function(c){ return !/e9\\.example/.test(c['Email']); });`);
}
{
  // Somebody the rule would otherwise reach: the contractor's own colleague,
  // entered without an address.
  P.run(`allData.contacts=allData.contacts.concat([{'Name':'No Email','Company':'Summit Builders','Role':'PM','Email':''}]);`);
  ok(to().length===4, 'a contact with no address is not a recipient');
  ok(P.run(`payNotifyAudience(${JSON.stringify(ROW())}).length`)===4,
     'and is not on the thread at all, rather than being counted and then dropped');
  P.run(`allData.contacts=allData.contacts.filter(function(c){ return c['Email']; });`);
  ok(to(ROW({'Contractor':'','Company':''})).length===3,
     'a row with no contractor still reaches Fidevia and the design team, and no contractor at all');
}

console.log('Taking somebody off it');
{
  P.run(`allData.contacts[1]['Notify - Pay App']='No';`);
  ok(!to().includes('arch@example.com'), 'an explicit No is honoured');
  P.run(`allData.contacts[1]['Notify - Pay App']='';`);
  ok(to().includes('arch@example.com'),
     'and blank means yes — a column added today, defaulting to off, would have silenced everyone at once');
  ok(/'Notify - Pay App'\]/.test(html), 'which is a column of its own');
  ok(/headers:\['Name','Company','Role','Email','Phone','Notify - RFI','Notify - CO','Notify - Submittal','Notify - Pay App'\]/.test(html),
     'on the contact sheet');
  ok(/saveContactField\(i, 'Notify - Pay App', off\?'':'No'\)/.test(html),
     'written as No or cleared, rather than Yes or cleared, because blank means on for this one');
}

console.log('One address, once');
{
  P.run(`SENT=null; sendEmail=function(to){ SENT=to; };
    payNotify(${JSON.stringify(ROW())}, 's', 'b',
      {extraTo:['ARCH@example.com','sam@summit.example','extra@example.com']});`);
  const sent=P.run(`SENT`);
  ok(sent.filter(e=>/arch@example\.com/i.test(e)).length===1,
     'somebody already on the thread who is named again is not written to twice \u2014 case included');
  ok(sent.filter(e=>e==='sam@summit.example').length===1, 'nor an exact repeat');
  ok(sent.includes('extra@example.com'), 'while a genuinely extra address still goes on');
  P.run(`SENT=null; sendEmail=function(to){ SENT=to; };
    payNotify(${JSON.stringify(ROW({'Contractor':'Nobody At All','Company':'Nobody At All'}))}, 's', 'b', {});`);
  ok((P.run(`SENT`)||[]).length===3, 'and an application from a company with no contacts still reaches the reviewers');
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
  ok(/pay_apps:'Notify - Pay App'/.test(html), 'they name the right field');
  const nc=html.split('function notifyContacts(notifyField, subject, bodyHTML, opts){')[1].split('\n}')[0];
  ok(/if\(opts\.payRow\) return payNotify\(opts\.payRow, subject, bodyHTML, opts\);/.test(nc),
     'and notifyContacts itself hands a payment application over to the rule, so a call that names the '
     +'wrong field cannot quietly send it to everybody');
  ok((html.match(/payRow: key==='pay_apps' \? row : null/g)||[]).length===2,
     'which both workflow sends pass');
}

console.log('And it is in Settings, with the rule stated');
{
  const pane=html.split('id="set-pane-notifs"')[1].split('id="set-pane-')[0];
  ok(/<h3[^>]*>Payment Application<\/h3>/.test(pane), 'payment applications have their own entry');
  ok(/id="nt-pay-subject"/.test(pane) && /id="nt-pay-intro"/.test(pane), 'with a subject and a heading');
  ok(/one contractor's money/.test(pane) && /never to another contractor on the job/.test(pane),
     'and the audience rule said in words, since it is not something you can see from a box');
  ok(/pay_apps:\{subject:'\[Fidevia\] Payment Application: \{number\}'/.test(html), 'a default to start from');
  ok(/document\.getElementById\('nt-pay-subject'\)\.value=g\('pay_apps','subject'\)/.test(html), 'loaded');
  ok(/pay_apps:\{subject:val\('nt-pay-subject'\),intro:val\('nt-pay-intro'\)\}/.test(html), 'and saved');
}
{
  ok(/>PAY<\/th>/.test(html), 'the contacts table has the column');
  ok(/togglePayNotify\(/.test(html), 'which can be switched');
  const t=html.split('const payTog=(r,i)=>{')[1].split('\n  };')[0];
  ok(/if\(!why\)/.test(t) && /\\u2014<\/span>/.test(t),
     'and shows a dash rather than a switch for anybody the rule does not reach — '
     +'a toggle that changes nothing is worse than no toggle');
  // Yes beside three Nos reads as a mistake, or as this column meaning the
  // reverse of its neighbours. It is not a choice anybody made.
  ok(/>'\+\(off\?'Off':'Auto'\)\+'<\/button>/.test(t),
     'and says Auto rather than Yes, because nobody chose it — the rule did');
  ok(!/'No'/.test(t), 'and Off rather than No, for the same reason');
  ok(/On automatically, because they are '\+why/.test(t),
     'with the reason on hover: Fidevia, the design team, or the contractor on these applications');
  ok(/contactIsFidevia\(r\) \? 'Fidevia'/.test(t) && /contactIsDesign\(r\) \? 'on the design team'/.test(t),
     'named from the same three tests the rule itself uses');
  ok(/Click to take them off\./.test(t) && /Click to put them back on/.test(t),
     'and what pressing it will do');
}
{
  const th=html.split('>PAY</th>')[0].split('<th class="hide-external notify-col"').pop();
  ok(/not an opt-in like the three to the left/.test(th),
     'the column header says it is a different kind of thing from its neighbours');
  ok(/Auto means the rule reaches them; Off means somebody took them out of it; a dash means/.test(th),
     'and what each of the three states means');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-paynotify.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
