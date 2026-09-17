// Garden Spot holds the mechanical and the plumbing primes on one job. That is
// two contracts, two schedules of values, two sets of pay applications and two
// lots of retainage — and before this, one company name, which meant both
// contracts claimed all of it.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);

P.run(`currentProject={name:'Lincoln', folders:{}, config:{contractors:[
  {name:'Summit Builders', role:'GC', contract:3000000, active:true},
  {name:'Garden Spot', active:true, lines:[
    {role:'MC', contract:500000},
    {role:'PC', contract:300000}]}]}};
  viewingAsExternal=function(){ return false; };
  allData.pay_apps=[
    {'App #':'PA-MC-001','Contractor':'Garden Spot','Trade':'MC','Period':'2026-09-01',
     'Status':'Approved & Signed','Requested Amount':'100000','Approved Amount':'100000'},
    {'App #':'PA-PC-001','Contractor':'Garden Spot','Trade':'PC','Period':'2026-09-01',
     'Status':'Approved & Signed','Requested Amount':'40000','Approved Amount':'40000'},
    {'App #':'PA-GC-001','Contractor':'Summit Builders','Period':'2026-09-01',
     'Status':'Approved & Signed','Requested Amount':'250000','Approved Amount':'250000'}];
  allData.co=[
    {'CO #':'CO-001','Company':'Garden Spot','Trade':'MC','Status':'Approved','Cost Impact':'20000'},
    {'CO #':'CO-002','Company':'Garden Spot','Trade':'PC','Status':'Approved','Cost Impact':'5000'}];`);

const L=(t)=>`lineForTrade('${t}')`;

console.log('Each contract keeps its own money');
{
  ok(P.run(`contractBaseFor(${L('MC')})`)===500000, 'the mechanical contract is its own');
  ok(P.run(`contractBaseFor(${L('PC')})`)===300000, 'and so is the plumbing one');
  ok(P.run(`coContractImpactFor(${L('MC')})`)===20000, 'a change order lands on the contract it names');
  ok(P.run(`coContractImpactFor(${L('PC')})`)===5000, 'and not on its neighbour');
  ok(P.run(`payPrevPaidFor(${L('MC')},'2026-10-01')`)===100000,
     'previously paid is what was paid against THIS contract — pooling it would let a contractor '
     +'bill past their contract sum without any single figure looking wrong');
  ok(P.run(`payPrevPaidFor(${L('PC')},'2026-10-01')`)===40000, 'the plumbing side on its own');
  ok(P.run(`payPeriodRows(${L('MC')},'2026-09-01').length`)===1,
     'and one application a month per contract, which is how many there are');
}

console.log('A company name no longer answers for a firm holding two');
{
  ok(P.run(`contractBaseFor('Garden Spot')`)===0,
     'asked by name, a two-contract firm gives nothing rather than the first line’s figure — '
     +'which is what it used to give, silently');
  ok(P.run(`payPrevPaidFor('Garden Spot','2026-10-01')`)===0,
     'and no total is built from their name either \u2014 one contract\u2019s worth of billing presented as '
     +'the firm\u2019s is a worse answer than none, because it looks like an answer');
  ok(P.run(`coContractImpactFor('Garden Spot')`)===0, 'the change order log the same');
  ok(P.run(`contractBaseFor('Summit Builders')`)===3000000,
     'while a firm holding one contract still answers to its name, so nothing existing moves');
  ok(P.run(`payPrevPaidFor('Summit Builders','2026-10-01')`)===250000, 'their money included');
}

console.log('The financial summary shows a row per contract');
{
  const rows=P.run(`(function(){ renderFinancials();
    return [...document.getElementById('tbody-financials').innerHTML.matchAll(/Garden Spot/g)].length; })()`);
  ok(rows===2, 'Garden Spot appears twice, once per prime (got '+rows+')');
  const html2=P.run(`document.getElementById('tbody-financials').innerHTML`);
  ok(/\$500,000/.test(html2) && /\$300,000/.test(html2),
     'each with its own contract rather than the same figure printed twice');
  ok(/>MC</.test(html2) && />PC</.test(html2), 'and the trade says which is which');
}

console.log('And so does the payment application log');
{
  const h=P.run(`(function(){ renderPayApps(); return document.getElementById('payapp-groups').innerHTML; })()`);
  const groups=[...h.matchAll(/pay-group-head/g)].length;
  ok(groups===3, 'three groups for three contracts, not two for two companies (got '+groups+')');
  ok(!/Other \/ Unassigned/.test(h), 'with nothing left over, since every row named its trade');
  // The count beside each heading is the one that used to double.
  ok((h.match(/1 pay app /g)||[]).length===3, 'one application against each, counted once');
}

console.log('A row that names no trade is held back, not guessed');
{
  P.run(`allData.pay_apps.push({'App #':'PA-???','Contractor':'Garden Spot','Period':'2026-09-01',
    'Status':'Submitted','Requested Amount':'9000'});`);
  const h=P.run(`(function(){ renderPayApps(); return document.getElementById('payapp-groups').innerHTML; })()`);
  ok(/Other \/ Unassigned/.test(h),
     'it surfaces as unassigned — the money belongs to one of two schedules of values and nothing '
     +'on the row says which, so somebody has to answer that');
  ok(P.run(`payPrevPaidFor(${L('MC')},'2026-10-01')`)===100000,
     'and it is not quietly added to either contract meanwhile');
}

console.log('Wired to the real render, not a copy');
{
  const f=html.split('function renderFinancials')[1].split('\n}')[0];
  ok(/let contractors=contractorLines\(\);/.test(f), 'the summary iterates contracts');
  ok(/pays\.filter\(billedAgainst\(c\)\)/.test(f), 'and bills each from the one predicate');
  const p=html.split('function renderPayApps()')[1].split('\nfunction togglePayGroup')[0];
  ok(/const contractors=contractorLines\(\);/.test(p), 'the log groups by contract');
  ok(/rows:rows\.filter\(billedAgainst\(c\)\)/.test(p), 'through the same predicate, so the two cannot disagree');
  ok(/const claimed=new Set\(\); groups\.forEach/.test(p),
     'and leftovers are what no contract claimed, rather than what no company name matched');
}

console.log(bad ? `FAIL tools-test-twoprimes.mjs — ${bad} of ${n}` : `ok   tools-test-twoprimes.mjs — ${n} assertions`);
process.exit(bad?1:0);
