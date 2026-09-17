// "In the change order tab, there should be a summary at the top of all the
// approved change orders and their impact on the financials: Total Approved
// Cost impact."
//
// Three numbers rather than one, because one would be a lie by omission: the
// cost impact is what was agreed, the allowance draw is the part of it the
// contract was already carrying, and only the difference moves the contract.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`currentProject={folders:{},config:{contractors:[
  {name:'Summit Builders', contract:'3000000', active:true},
  {name:'Gorilla Construction', contract:'1000000', active:true}]}};
  viewingAsExternal=function(){ return false; };`);

const CO=(o)=>Object.assign({'PCO #':'PCO-GC-001','Company':'Summit Builders',
  'Description':'x','Status':'Approved','Cost Impact':'5000'}, o);
const bar=(rows)=>P.run(`(function(){ allData.co=${JSON.stringify(rows)}; updateCoBar(allData.co);
  var g=function(id){ return document.getElementById(id).textContent; };
  return { impact:g('cob-impact'), allow:g('cob-allow'), await_:g('cob-await'),
           contract:g('cob-contract'), revised:g('cob-revised'), note:g('cob-note'),
           shown:document.getElementById('co-bar').style.display!=='none' }; })()`);

console.log('What has been agreed, and what it did to the contract');
{
  const b=bar([CO({'CO #':'CO-001','Cost Impact':'5000'}),
               CO({'PCO #':'PCO-GC-002','CO #':'CO-002','Cost Impact':'9000'})]);
  ok(b.impact==='$14,000', 'the approved cost impact is the total asked for and agreed — '+b.impact);
  ok(b.contract==='$14,000', 'all of it reaches the contract when none is funded from an allowance');
  ok(b.revised==='$4,014,000', 'and the revised contract is every contract plus that — '+b.revised);
  ok(b.allow==='$0', 'with nothing drawn from an allowance');
  ok(b.shown, 'and the summary is on screen');
}

console.log('An allowance draw is not new money');
{
  // $5,000 agreed, $2,000 of it funded from allowance A: the contract carries
  // the allowance already, so only $3,000 is an increase.
  const splits=JSON.stringify([{id:'A', amount:2000}]);
  const b=bar([CO({'CO #':'CO-001','Cost Impact':'5000','Allowance Splits':splits})]);
  ok(b.impact==='$5,000', 'the cost impact is still the whole change order');
  ok(b.allow==='$2,000', 'the draw is shown on its own');
  ok(b.contract==='$3,000', 'and only the difference moves the contract — '+b.contract);
  ok(b.revised==='$4,003,000', 'which is what the revised contract is built on');
}

console.log('A deduct lowers it');
{
  const b=bar([CO({'CO #':'CO-001','Cost Impact':'5000'}),
               CO({'PCO #':'PCO-GC-002','CO #':'CO-002','Cost Impact':'-2000'})]);
  ok(b.impact==='$3,000', 'a credit nets against an addition rather than being counted as one');
  ok(b.contract==='$3,000', 'and comes off the contract in full');
}

console.log('Agreed is not the same as executed');
{
  // Approved with no CO # yet: the owner has agreed, nobody has written the
  // paper. The Financial Summary counts the contract off executed ones, and
  // this has to agree with it or one of the two screens is wrong.
  const b=bar([CO({'Cost Impact':'5000'})]);
  ok(b.impact==='$5,000', 'it counts as agreed');
  ok(b.contract==='$0', 'and not yet as contract, which is where the Financial Summary has it');
  ok(b.revised==='$4,000,000', 'so the revised contract has not moved');
  ok(b.await_==='$5,000',
     'it waits in a column of its own, where a contract that has not moved has something standing next to it');
  ok(/Revised Contract reaches \$4,005,000/.test(b.note),
     'and the note says what the number becomes rather than leaving it to be worked out — '+b.note);
  ok(/once the outstanding change orders are written/.test(b.note), 'and what has to happen first');
}

console.log('$12,000 approved and a contract that has not moved');
{
  // Asked of exactly this screen. Nothing was wrong: $7,000 came out of an
  // allowance the contract was already carrying, and the other $5,000 had no
  // change order written. Both reasons were there; the arithmetic joining them
  // was not.
  const splits=JSON.stringify([{id:'A', amount:7000}]);
  const b=bar([CO({'Cost Impact':'7000','Allowance Splits':splits}),
               CO({'PCO #':'PCO-GC-002','Cost Impact':'5000'})]);
  ok(b.impact==='$12,000', 'twelve thousand agreed');
  ok(b.allow==='$7,000', 'seven of it out of the allowance, which the contract already held');
  ok(b.await_==='$5,000', 'five waiting on a change order nobody has written');
  ok(b.contract==='$0', 'and so nothing has reached the contract');
  ok(b.revised==='$4,000,000', 'which is why it has not moved');
  ok(/Revised Contract reaches \$4,005,000 once the outstanding change orders are written/.test(b.note),
     'and the line under it answers the question before it is asked — '+b.note);
}

console.log('What is still open');
{
  const b=bar([CO({'Status':'Open','Cost Impact':'9000'}),
               CO({'PCO #':'PCO-GC-002','Status':'Submitted','Cost Impact':'1000'}),
               CO({'PCO #':'PCO-GC-003','Status':'Rejected','Cost Impact':'50000'})]);
  ok(b.impact==='$0', 'nothing open is counted as agreed — that is the whole point of the word');
  ok(/2 still open, \$10,000 requested/.test(b.note), 'they are counted separately — '+b.note);
  ok(!/50,000/.test(b.note), 'and a rejected one is not pending anything');
}

console.log('Whose arithmetic it is');
{
  P.run(`viewingAsExternal=function(){ return true; };
         viewingAsRole=function(){ return 'contractor'; };
         viewingAsCompany=function(){ return 'Gorilla Construction'; };`);
  const b=bar([CO({'CO #':'CO-001','Cost Impact':'5000'}),
               CO({'PCO #':'PCO-GC-002','CO #':'CO-002','Company':'Gorilla Construction','Cost Impact':'7000'})]);
  ok(b.impact==='$7,000', 'a contractor sees their own change orders, not the project’s — '+b.impact);
  ok(b.revised==='$1,007,000', 'against their own contract, not the sum of everybody’s — '+b.revised);
  P.run(`viewingAsExternal=function(){ return false; };`);
}

console.log('Where it sits');
{
  ok(html.indexOf('id="co-bar"') < html.indexOf('All Change Orders'),
     'above the log, which is what "a summary at the top" means');
  ok(/id="co-bar"[^>]*class="contract-bar"|class="contract-bar" id="co-bar"/.test(html),
     'built from the same card as the payment application summary, so the two read alike');
  // Every figure is labelled, and in the order the money travels: what was
  // agreed, what came out of the allowance, what is waiting on paperwork, what
  // has landed, and what the contract now is.
  const card=html.split('id="co-bar"')[1].split('</div>\n        </div>')[0];
  ['Approved Cost Impact','From Allowance','Awaiting CO','To Contract','Revised Contract']
    .forEach((lab,i,arr)=>{
      ok(new RegExp('>'+lab+'<\\/div><div class="cb-val" id="cob-').test(card),
         '"'+lab+'" is a labelled figure, not a bare number');
      if(i) ok(card.indexOf(arr[i-1]) < card.indexOf(lab),
         'and it comes after "'+arr[i-1]+'", which is the order the money travels');
    });
  ok(/function renderCOs\(\)\{\s*\n\s*const all=allData\.co\|\|\[\], tb=document\.getElementById\('tbody-cos'\);\s*\n\s*updateCoBar\(all\);/.test(html),
     'and refreshed with the log, before the early return on an empty one');
}

console.log(bad ? `FAIL tools-test-cosummary.mjs — ${bad} of ${n}` : `ok   tools-test-cosummary.mjs — ${n} assertions`);
process.exit(bad?1:0);
