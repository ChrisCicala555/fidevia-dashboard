// "We are already going to be separating Garden Spot's MC and PC on West Earl -
// shouldn't we be able to separate the allowances by the MC and PC contracts?"
//
// The allowances were already separate. What could not reach them was the
// change order: it records a company, and a company holding two primes
// resolves to neither contract, so the allowance picker offered nothing while
// MC1 and PC1 sat in Settings. A payment application for the same firm added
// up against no contract at all.
//
// Both logs now record which contract. This is the red team on it: no figure
// may cross between the two.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);

const MC=()=>P.run("currentProject.config.contractors[0]");
const seed=()=>P.run(`
  currentProject.config={contractors:[
    {name:'Garden Spot Mechanical', role:'MC', contract:500000,
     allowances:[{id:'MC1',name:'Shutoffs',amount:10000}]},
    {name:'Garden Spot Mechanical', role:'PC', contract:300000,
     allowances:[{id:'PC1',name:'Carriers',amount:8000}]},
    {name:"Cook's Service Company", role:'EC', contract:200000,
     allowances:[{id:'EC1',name:'Receptacles',amount:5000}]}]};
  allData.co=[
    {'CO #':'CO-1','Company':'Garden Spot Mechanical','Trade':'MC','Cost Impact':'4000',
     'Approved Amount':'4000','Status':'Approved','Allowance':'MC1',
     'Allowance Splits':JSON.stringify([{id:'MC1',amount:4000}]),'Applied to Allowance':'4000'},
    {'CO #':'CO-2','Company':'Garden Spot Mechanical','Trade':'PC','Cost Impact':'1000',
     'Approved Amount':'1000','Status':'Approved','Allowance':'PC1',
     'Allowance Splits':JSON.stringify([{id:'PC1',amount:1000}]),'Applied to Allowance':'1000'}];
  allData.pay_apps=[
    {'App #':'PA-MC-001_Garden Spot Mechanical','Contractor':'Garden Spot Mechanical','Trade':'MC',
     'Requested Amount':'25000','Approved Amount':'25000','Status':'Approved'},
    {'App #':'PA-PC-001_Garden Spot Mechanical','Contractor':'Garden Spot Mechanical','Trade':'PC',
     'Requested Amount':'9000','Approved Amount':'9000','Status':'Approved'}];
  1;`);

console.log('A row now says which contract it is against');
seed();
ok(P.run("MODULES.co.headers.includes('Trade')"), 'change orders record it');
ok(P.run("MODULES.pay_apps.headers.includes('Trade')"), 'payment applications record it');
ok(P.run("tradeOfRow(allData.co[0])")==='MC', 'and a change order resolves to its own contract');
ok(P.run("tradeOfRow(allData.co[1])")==='PC', 'each to its own');

console.log('Allowances are reachable from a change order again');
{
  const mc=JSON.parse(P.run("JSON.stringify(allowancesFor(currentProject.config.contractors[0]))"));
  const pc=JSON.parse(P.run("JSON.stringify(allowancesFor(currentProject.config.contractors[1]))"));
  ok(mc.length===1 && mc[0].id==='MC1', 'the mechanical contract offers MC1');
  ok(pc.length===1 && pc[0].id==='PC1', 'the plumbing contract offers PC1');
  ok(!mc.some(a=>a.id==='PC1') && !pc.some(a=>a.id==='MC1'), 'and neither offers the other’s');
}

console.log('No draw lands on the wrong contract');
ok(P.run("allowanceUsedById(currentProject.config.contractors[0],'MC1')")===4000,
   'the mechanical draw is 4,000');
ok(P.run("allowanceUsedById(currentProject.config.contractors[1],'PC1')")===1000,
   'the plumbing draw is 1,000');
ok(P.run("allowanceUsedById(currentProject.config.contractors[1],'MC1')")===0,
   'and the plumbing contract has drawn nothing on MC1');
ok(P.run("allowanceRemainingById(currentProject.config.contractors[0],'MC1')")===6000,
   '6,000 left on MC1');
ok(P.run("allowanceRemainingById(currentProject.config.contractors[1],'PC1')")===7000,
   'and 7,000 on PC1 — not one balance shared between them');

console.log('Nor does a payment application');
ok(P.run("(allData.pay_apps||[]).filter(billedAgainst(currentProject.config.contractors[0])).length")===1,
   'one application on the mechanical contract');
ok(P.run("(allData.pay_apps||[]).filter(billedAgainst(currentProject.config.contractors[1])).length")===1,
   'one on the plumbing');
ok(P.run("(allData.pay_apps||[]).filter(billedAgainst(currentProject.config.contractors[0]))[0]['Requested Amount']")==='25000',
   'and the mechanical one is the 25,000, not the 9,000');

console.log('And another firm\u2019s money is not touched either');
P.run(`allData.pay_apps.push({'App #':'PA-001_Cook','Contractor':"Cook's Service Company",
   'Requested Amount':'40000','Approved Amount':'40000','Status':'Approved'});
  allData.co.push({'CO #':'CO-3','Company':"Cook's Service Company",'Cost Impact':'2000',
   'Approved Amount':'2000','Status':'Approved','Allowance':'EC1',
   'Allowance Splits':JSON.stringify([{id:'EC1',amount:2000}]),'Applied to Allowance':'2000'});`);
ok(P.run("(allData.pay_apps||[]).filter(billedAgainst(currentProject.config.contractors[0])).length")===1,
   'the mechanical contract still counts one application, not Cook\u2019s as well');
ok(P.run("(allData.pay_apps||[]).filter(billedAgainst(currentProject.config.contractors[2])).length")===1,
   'and Cook\u2019s counts its own');
ok(P.run("allowanceUsedById(currentProject.config.contractors[0],'EC1')")===0,
   'Cook\u2019s draw does not land on the mechanical contract');
ok(P.run("allowanceUsedById(currentProject.config.contractors[2],'MC1')")===0,
   'nor the mechanical draw on Cook\u2019s');
ok(P.run("rowOnLine(allData.pay_apps[2], currentProject.config.contractors[0])")===false,
   'a row filed by another firm is never on this contract, whatever its trade says');

console.log('A firm holding one contract is untouched by any of it');
ok(P.run("(allowancesFor(\"Cook's Service Company\")||[]).length")===1,
   'Cook’s allowances still resolve from the company name alone');
ok(P.run("tradePickerHTML('f-trade',\"Cook's Service Company\")")==='',
   'and they are never asked which contract, because there is only one');
ok(/^PA-\d+_/.test(P.run("nextItemNumber('pay_apps',\"Cook's Service Company\")")),
   'their numbering carries no contract segment, because there is only one contract');

console.log('The forms refuse rather than guess');
['co','payapp','payapp_ext'].forEach(m=>{
  ok(new RegExp("id=\"f-trade-slot\"").test(html), 'there is a slot for the picker');
});
ok(/holds more than one contract on this job\. Choose which one this change is against/.test(html),
   'a change order without one is refused, naming the firm');
ok(/Choose which one this application is against/.test(html),
   'and so is a payment application');
ok((html.match(/tradePicked\('f-trade'/g)||[]).length===3,
   'all three filing paths check it ('+(html.match(/tradePicked\('f-trade'/g)||[]).length+')');

console.log('Each contract has its own run of numbers');
seed();
P.run("allData.pay_apps=[];");
ok(P.run("nextItemNumber('pay_apps','Garden Spot Mechanical',null,'MC')").indexOf('PA-MC-001')===0,
   'the mechanical run starts at PA-MC-001');
ok(P.run("nextItemNumber('pay_apps','Garden Spot Mechanical',null,'PC')").indexOf('PA-PC-001')===0,
   'and the plumbing at PA-PC-001, rather than both being PA-001');
P.run(`allData.pay_apps=[
  {'App #':'PA-MC-001_Garden Spot Mechanical','Contractor':'Garden Spot Mechanical','Trade':'MC'},
  {'App #':'PA-MC-002_Garden Spot Mechanical','Contractor':'Garden Spot Mechanical','Trade':'MC'}];`);
ok(P.run("nextItemNumber('pay_apps','Garden Spot Mechanical',null,'MC')").indexOf('PA-MC-003')===0,
   'the mechanical run counts on');
ok(P.run("nextItemNumber('pay_apps','Garden Spot Mechanical',null,'PC')").indexOf('PA-PC-001')===0,
   'without pushing the plumbing run along with it');
ok(P.run("nextItemNumber('co','Garden Spot Mechanical','pco','MC')")==='PCO-MC-001',
   'change orders run per contract too');
ok(P.run("nextItemNumber('co','Garden Spot Mechanical','pco','PC')")==='PCO-PC-001',
   'each with its own sequence');

console.log('A number already in use is never issued twice');
// A row filed before the contract column existed carries no contract, so the
// run for a contract could not see it - and reissued the number it holds. Two
// rows answering to PA-GC-001, and every later write refusing because more
// than one matched. A gap in a sequence is a cosmetic problem; two records
// with one name is not.
P.run(`allData.pay_apps=[{'App #':'PA-GC-001_Garden Spot Mechanical',
  'Contractor':'Garden Spot Mechanical','Trade':''}];`);
ok(P.run("nextItemNumber('pay_apps','Garden Spot Mechanical',null,'MC')").indexOf('PA-MC-002')===0,
   'an untagged row still occupies its number');
ok(P.run("nextItemNumber('pay_apps','Garden Spot Mechanical',null,'PC')").indexOf('PA-PC-002')===0,
   'on every contract, because nothing says which one it was');
P.run(`allData.pay_apps=[
  {'App #':'PA-MC-001_Garden Spot Mechanical','Contractor':'Garden Spot Mechanical','Trade':'MC'},
  {'App #':'PA-MC-002_Garden Spot Mechanical','Contractor':'Garden Spot Mechanical','Trade':'MC'}];`);
ok(P.run("nextItemNumber('pay_apps','Garden Spot Mechanical',null,'MC')").indexOf('PA-MC-003')===0,
   'once they are tagged the run counts on normally');
ok(P.run("nextItemNumber('pay_apps','Garden Spot Mechanical',null,'PC')").indexOf('PA-PC-001')===0,
   'and the other contract is not dragged along by it');
{
  // Whatever it issues must not already be in the log.
  const rows=JSON.parse(P.run("JSON.stringify(allData.pay_apps)")).map(r=>r['App #']);
  ['MC','PC'].forEach(tr=>{
    const nxt=P.run(`nextItemNumber('pay_apps','Garden Spot Mechanical',null,'${tr}')`);
    ok(rows.indexOf(nxt)<0, tr+' is issued a number no row already holds: '+nxt);
  });
}

console.log('A form with nothing chosen is refused');
P.run(`EXTERNAL=true; currentProject.userCompany='Garden Spot Mechanical'; openModal('co');`);
{
  const picked=JSON.parse(P.run("JSON.stringify(tradePicked('f-trade','Garden Spot Mechanical'))"));
  ok(picked.ok===false, 'nothing chosen is not a valid filing');
  ok(picked.trade==='', 'and no contract is invented for it');
  P.run("document.getElementById('f-trade').value='PC';");
  const ok2=JSON.parse(P.run("JSON.stringify(tradePicked('f-trade','Garden Spot Mechanical'))"));
  ok(ok2.ok===true && ok2.trade==='PC', 'choosing one is');
}
ok(JSON.parse(P.run("JSON.stringify(tradePicked('f-trade',\"Cook's Service Company\"))")).ok===true,
   'and a firm with one contract passes without being asked at all');

console.log('A row filed before any of this still resolves');
P.run("allData.co.push({'CO #':'CO-OLD','Company':\"Cook's Service Company\",'Cost Impact':'500','Approved Amount':'500','Status':'Approved'});");
ok(P.run("tradeOfRow(allData.co[2])")==='EC',
   'no Trade recorded, one contract, so the company name still answers it');
P.run("allData.co.push({'CO #':'CO-OLD2','Company':'Garden Spot Mechanical','Cost Impact':'500','Status':'Approved'});");
ok(P.run("tradeOfRow(allData.co[3])")==='',
   'and a two-prime firm with no Trade stays unattributed rather than being guessed at');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
