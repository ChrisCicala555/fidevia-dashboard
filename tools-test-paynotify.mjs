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
console.log('The chain is the list, whatever the Role column happens to say');
{
  // This is what went wrong. contactIsDesign asks the grant and the Role text.
  // From a contractor's session the grants are not theirs to read, so it came
  // down to free text: "Structural Engineer" matched, "Principal" did not, and
  // the architect was left off their own review.
  P.run(`PROJECT_ROLES={};
    allData.contacts=[
      {'Name':'Christopher Cicala','Company':'Fidevia','Role':'CM','Email':'chris@fidevia.com'},
      {'Name':'Quiet Architect','Company':'Architect 2','Role':'Principal','Email':'arch@example.com'},
      {'Name':'Test Engineer','Company':'Engineer 1','Role':'Structural Engineer','Email':'eng@example.com'},
      {'Name':'Sam Summit','Company':'Summit Builders','Role':'PM','Email':'sam@summit.example'},
      {'Name':'Dana Delaney','Company':'Delaney Mechanical','Role':'PM','Email':'dana@delaney.example'}];
    wfStepsFor=function(k,co,r){
      return String((r&&r['Copy Type'])||'')==='Final'
        ? [{name:'Fidevia Signature', person:'Christopher Cicala', company:'Fidevia'},
           {name:'Architect Signature', person:'Quiet Architect', company:'Architect 2'}]
        : [{name:'Fidevia Review', person:'Christopher Cicala', company:'Fidevia'},
           {name:'Architect Review', person:'Quiet Architect', company:'Architect 2'}];
    };
    wfEffectiveSteps=function(k,r){ return wfStepsFor(k,'',r); };`);
  ok(P.run(`contactIsDesign(allData.contacts[1])`)===false,
     'a contact whose Role column says "Principal" does not read as the design team');
  ok(to().includes('arch@example.com'),
     'but the chain names them, so they are on the thread — which is the point of the chain');
  ok(to().includes('eng@example.com'), 'the engineer still is too');
  ok(!to().includes('dana@delaney.example'), 'and no other contractor has been let in by it');
}
{
  // The final copy's signature chain counts from the day the pencil is filed.
  P.run(`wfStepsFor=function(k,co,r){
      return String((r&&r['Copy Type'])||'')==='Final'
        ? [{name:'Architect Signature', person:'Quiet Architect', company:'Architect 2'}] : [];
    }; wfEffectiveSteps=function(){ return []; };`);
  ok(to().includes('arch@example.com'),
     'somebody who only signs the final application is on the thread from the start');
  // And the other way round: somebody who only reviews the pencil copy.
  P.run(`wfStepsFor=function(k,co,r){
      return String((r&&r['Copy Type'])||'')==='Pencil'
        ? [{name:'Architect Review', person:'Quiet Architect', company:'Architect 2'}] : [];
    };`);
  ok(to().includes('arch@example.com'), 'and somebody who only reviews the pencil copy');
}
{
  // A step spliced onto this row alone \u2014 one somebody added, or a step handed
  // to a colleague \u2014 is as real as the configured chain.
  P.run(`wfStepsFor=function(){ return []; };
    wfEffectiveSteps=function(){ return [{name:'Further Review', person:'Quiet Architect', company:'Architect 2'}]; };`);
  ok(to().includes('arch@example.com'), 'a reviewer added to this row alone is on its thread');
  P.run(`wfEffectiveSteps=function(){ return []; };`);
}
{
  // A firm named on a step with nobody against it still counts.
  P.run(`wfStepsFor=function(){ return [{name:'Architect Review', person:'', company:'Architect 2'}]; };
         wfEffectiveSteps=function(){ return []; };`);
  ok(to().includes('arch@example.com'), 'a step naming a firm and no person reaches that firm');
  P.run(`wfStepsFor=function(){ return [{name:'Architect Review', person:'Quiet Architect', company:''}]; };`);
  ok(to().includes('arch@example.com'), 'and one naming a person and no firm reaches that person');
}
{
  P.run(`wfStepsFor=function(){ throw new Error('no config'); };
         wfEffectiveSteps=function(){ throw new Error('no config'); };`);
  ok(to().includes('chris@fidevia.com') && to().includes('sam@summit.example'),
     'a project whose chains cannot be read still reaches Fidevia and the contractor');
  ok(!to().includes('dana@delaney.example'), 'and still nobody else');
}
{
  P.run(`wfStepsFor=function(){ return [{name:'Review', person:'', company:''}]; };
         wfEffectiveSteps=function(){ return []; };`);
  ok(!to().includes('dana@delaney.example'), 'a step naming nobody lets nobody in');
  // The case that would go wrong if a blank were stored: a contact with no name
  // and no firm would match a step with neither.
  P.run(`allData.contacts=allData.contacts.concat([
    {'Name':'','Company':'','Role':'','Email':'ghost@example.com'}]);`);
  ok(!to().includes('ghost@example.com'),
     'and a contact with neither name nor firm is not matched by a step with neither');
  P.run(`allData.contacts=allData.contacts.filter(function(c){ return c['Email']!=='ghost@example.com'; });`);
  // Put the working fixtures back for the rest of the file.
  P.run(`allData.contacts=[
      {'Name':'Christopher Cicala','Company':'Fidevia','Role':'CM','Email':'chris@fidevia.com'},
      {'Name':'Test Architect','Company':'Architect 2','Role':'Architect','Email':'arch@example.com'},
      {'Name':'Test Engineer','Company':'Engineer 1','Role':'Structural Engineer','Email':'eng@example.com'},
      {'Name':'Sam Summit','Company':'Summit Builders','Role':'PM','Email':'sam@summit.example'},
      {'Name':'Dana Delaney','Company':'Delaney Mechanical','Role':'PM','Email':'dana@delaney.example'},
      {'Name':'Owen Owner','Company':'Riverside School District','Role':'Business Manager','Email':'owen@rsd.example'}];
    wfStepsFor=function(){ return []; }; wfEffectiveSteps=function(){ return []; };`);
}

console.log('Every chain on the project, not only the payment application one');
{
  // "Actually let's copy the engineers too." An engineer who reviews submittals
  // but sits on no payment application step is still this project's engineer.
  P.run(`PROJECT_ROLES={};
    currentProject={name:'X',config:{contractors:[
      {name:'Summit Builders'},{name:'Delaney Mechanical'},{name:'Gorilla Construction'}]}};
    allData.contacts=[
      {'Name':'Christopher Cicala','Company':'Fidevia','Role':'CM','Email':'chris@fidevia.com'},
      {'Name':'Quiet Architect','Company':'Architect 2','Role':'Principal','Email':'arch@example.com'},
      {'Name':'Quiet Engineer','Company':'Engineer 1','Role':'Associate','Email':'eng@example.com'},
      {'Name':'Sam Summit','Company':'Summit Builders','Role':'PM','Email':'sam@summit.example'},
      {'Name':'Dana Delaney','Company':'Delaney Mechanical','Role':'PM','Email':'dana@delaney.example'}];
    wfStepsFor=function(k){
      if(k==='pay_apps') return [{name:'Fidevia Review', person:'Christopher Cicala', company:'Fidevia'},
                                 {name:'Architect Review', person:'Quiet Architect', company:'Architect 2'}];
      if(k==='sub') return [{name:'Engineer Review', person:'Quiet Engineer', company:'Engineer 1'}];
      return [];
    };
    wfEffectiveSteps=function(){ return []; };`);
  ok(P.run(`contactIsDesign(allData.contacts[2])`)===false,
     'an engineer whose Role column says "Associate" does not read as the design team either');
  ok(to().includes('eng@example.com'),
     'but the submittal chain names them, so they are copied \u2014 which is the ask');
  ok(to().includes('arch@example.com'), 'with the architect from the payment application chain');
  ok(to().includes('chris@fidevia.com') && to().includes('sam@summit.example'),
     'and the two who were never in doubt');
}
{
  // The safeguard. Chains name contractors as well, and a rival reading what
  // Summit Builders billed is the one thing this rule exists to prevent.
  P.run(`wfStepsFor=function(k){
      return k==='rfi' ? [{name:'GC Review', person:'Dana Delaney', company:'Delaney Mechanical'}] : [];
    };`);
  ok(!to().includes('dana@delaney.example'),
     'another contractor on some other chain is still not copied on this application');
  ok(to(ROW({'Contractor':'Delaney Mechanical','Company':'Delaney Mechanical'}))
       .includes('dana@delaney.example'), 'though they are on their own');
  ok(P.run(`payIsRivalContractor({'Company':'Delaney Mechanical'},'Summit Builders')`)===true,
     'the test is simply whether they are a different contractor on this job');
  ok(P.run(`payIsRivalContractor({'Company':'Architect 2'},'Summit Builders')`)===false,
     'a design firm is not a contractor');
  ok(P.run(`payIsRivalContractor({'Company':'Summit Builders'},'Summit Builders')`)===false,
     'and the contractor whose application it is is not a rival to themselves');
  ok(P.run(`payIsRivalContractor({'Company':''},'Summit Builders')`)===false,
     'somebody with no firm recorded is not excluded by a firm they do not have \u2014 '
     +'no contractor is recorded without a name, so a blank matches none of them');
}
{
  // Fidevia, the owner and the submitting contractor do not come through the
  // chain at all, so the exclusion cannot reach them.
  P.run(`wfStepsFor=function(){ return []; };`);
  ok(to().includes('chris@fidevia.com') && to().includes('sam@summit.example'),
     'with no chains configured, the four who are named by rule are still on it');
  // Back to the working fixtures.
  P.run(`currentProject={name:'X',config:{owner:'Riverside School District'}};
    allData.contacts=[
      {'Name':'Christopher Cicala','Company':'Fidevia','Role':'CM','Email':'chris@fidevia.com'},
      {'Name':'Test Architect','Company':'Architect 2','Role':'Architect','Email':'arch@example.com'},
      {'Name':'Test Engineer','Company':'Engineer 1','Role':'Structural Engineer','Email':'eng@example.com'},
      {'Name':'Sam Summit','Company':'Summit Builders','Role':'PM','Email':'sam@summit.example'},
      {'Name':'Dana Delaney','Company':'Delaney Mechanical','Role':'PM','Email':'dana@delaney.example'},
      {'Name':'Owen Owner','Company':'Riverside School District','Role':'Business Manager','Email':'owen@rsd.example'}];
    wfStepsFor=function(){ return []; }; wfEffectiveSteps=function(){ return []; };`);
}

console.log('The owner joins when the pencil is approved, and not before');
{
  P.run(`currentProject={name:'X',config:{owner:'Riverside School District'}};`);
  ok(!to().includes('owen@rsd.example'),
     'a pencil copy still being worked through is not something the owner is asked to pay');
  ok(!to(ROW({'Status':'Pencil \u2014 awaiting Test Architect'})).includes('owen@rsd.example'),
     'nor part-way through its review');
  // "If there are corrections, then all of the above stays on the thread."
  const sent=ROW({'Status':'Revise and resubmit \u2014 awaiting contractor'});
  ok(!to(sent).includes('owen@rsd.example'), 'a pencil sent back keeps the owner off it');
  ok(to(sent).length===4, 'and keeps the other four on');
  ok(!to(ROW({'Status':'Pencil rejected'})).includes('owen@rsd.example'), 'so does a refusal');
  // Neither of those statuses says approved, and one status cannot say both,
  // so the approval test carries this on its own.
  ok(P.run(`payOwnerIsOn({'Copy Type':'Pencil','Status':'Revise and resubmit \u2014 awaiting contractor'})`)===false
     && P.run(`payOwnerIsOn({'Copy Type':'Pencil','Status':'Pencil rejected'})`)===false,
     'which the approval test settles without a rule of its own');
  ok(P.run(`payOwnerIsOn(null)`)===false, 'and no row at all is not an approval');
}
{
  ok(to(ROW({'Status':'Pencil approved \u2014 awaiting final'})).includes('owen@rsd.example'),
     'once it is approved they are on it, because it is now an application they will see');
  ok(to(ROW({'Status':'Pencil approved as noted \u2014 awaiting final'})).includes('owen@rsd.example'),
     'approved as noted counts \u2014 the marks are conditions on the final, not a refusal of it');
  ok(to(ROW({'Copy Type':'Final','Status':'Uploaded \u2014 awaiting Fidevia'})).includes('owen@rsd.example'),
     'and a final copy always, since it is on their own screen');
  ok(to(ROW({'Status':'Pencil approved \u2014 awaiting final'})).includes('sam@summit.example'),
     'with everybody who was already on it still there');
}
{
  // Two ways of knowing who the owner is, as with the design team.
  P.run(`PROJECT_ROLES={'owen@rsd.example':'owner'}; currentProject={name:'X',config:{}};`);
  ok(to(ROW({'Status':'Pencil approved \u2014 awaiting final'})).includes('owen@rsd.example'),
     'the role granted on this project');
  P.run(`PROJECT_ROLES={}; currentProject={name:'X',config:{owner:'Riverside School District'}};`);
  ok(to(ROW({'Status':'Pencil approved \u2014 awaiting final'})).includes('owen@rsd.example'),
     'or the owner organization named on the project');
  P.run(`currentProject={name:'X',config:{}};`);
  ok(!to(ROW({'Status':'Pencil approved \u2014 awaiting final'})).includes('owen@rsd.example'),
     'and with neither, nobody is assumed to be the owner');
  // An owner org of '' must not match a contact whose company is also blank.
  P.run(`allData.contacts=allData.contacts.concat([
    {'Name':'No Firm','Company':'','Role':'','Email':'nofirm@example.com'}]);`);
  ok(!to(ROW({'Status':'Pencil approved \u2014 awaiting final'})).includes('nofirm@example.com'),
     'least of all somebody with no firm recorded, on a project with no owner recorded');
  P.run(`allData.contacts=allData.contacts.filter(function(c){ return c['Email']!=='nofirm@example.com'; });`);
  P.run(`currentProject={name:'X',config:{owner:'Riverside School District'}};`);
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
  ok(/The owner joins once the pencil copy\s+is approved/.test(pane), 'including when the owner joins');
  ok(/pencil sent back to be corrected keeps the same four on it/.test(pane), 'and when they do not');
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
     'named from the same tests the rule itself uses');
  ok(/contactIsOwner\(r\) \? 'the owner, from the point a pencil copy is approved'/.test(t),
     'and the owner is shown as on it, with the point at which they join');
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
