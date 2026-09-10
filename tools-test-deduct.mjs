// A change order can go down as well as up: a deduct returns money to the
// owner. Three things stopped it, and the worst of them gave a wrong number
// rather than an error.
//
//  1. The money field stripped the minus sign on every keystroke, so a deduct
//     could not be typed at all.
//  2. coContractImpact clamped at zero, so a credit that did get in counted as
//     nothing — it vanished from the financials instead of reducing anything.
//  3. coAllowanceDraw is Math.min(applied, approved). Against -8,400 that
//     returned a NEGATIVE draw, crediting money back into the allowance.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);

console.log('Typing a deduct');
R(`EL={value:''}`);
R(`EL.value='-8400'; fmtMoneyInput(EL, true)`);
ok(R(`EL.value`)==='-8,400', 'a leading minus survives, and the thousands still group');
R(`EL.value='-'; fmtMoneyInput(EL, true)`);
ok(R(`EL.value`)==='-', 'the bare sign survives mid-typing, before any digits are there');
R(`EL.value='8400'; fmtMoneyInput(EL, true)`);
ok(R(`EL.value`)==='8,400', 'a positive is unchanged');
R(`EL.value='-8400'; fmtMoneyInput(EL, false)`);
ok(R(`EL.value`)==='8,400', 'and a field that may not go negative still strips it');
R(`EL.value='84-00'; fmtMoneyInput(EL, true)`);
ok(R(`EL.value`)==='8,400', 'only a LEADING minus counts — one typed mid-number is not a sign');
R(`EL.value='-1234.567'; fmtMoneyInput(EL, true)`);
ok(R(`EL.value`)==='-1,234.56', 'and the two-decimal cap still applies');
ok(R(`JSON.stringify(NEGATIVE_OK)`)==='["f-cost"]',
   'only Cost Impact may go below zero — an allowance draw or a billed amount cannot');
{
  const w = html.split('function wireMoneyInputs(){')[1].split('\n}')[0];
  ok(/const negOk=NEGATIVE_OK\.includes\(id\)/.test(w), 'the wiring asks which field it is');
  ok(/if\(el\.value==='-'\) el\.value=''/.test(w),
     'and a field left holding only a minus is cleared on blur rather than saved as one');
}

console.log('What a deduct does to the contract');
const CO = (amt, allow) => `({'Status':'Approved','Company':'Summit Builders','Approved Amount':'${amt}','Applied to Allowance':'${allow||''}'})`;
ok(R(`coApprovedAmount(${CO(-8400)})`)===-8400, 'the amount reads back negative');
ok(R(`coIsDeduct(${CO(-8400)})`)===true && R(`coIsDeduct(${CO(8400)})`)===false, 'and is recognised as a deduct');
ok(R(`coContractImpact(${CO(-8400)})`)===-8400,
   'it lands on the contract in full and reduces it — clamping at zero made a credit disappear');
ok(R(`coContractImpact(${CO(8400)})`)===8400, 'while an addition is unchanged');
ok(R(`coContractImpact(${CO(8400,'3000')})`)===5400,
   'and an addition part-funded by an allowance still only adds the excess');

console.log('A deduct draws nothing from an allowance');
ok(R(`coAllowanceDraw(${CO(-8400)})`)===0,
   'Math.min against a negative returned a negative draw, which credited the allowance back');
ok(R(`coAllowanceDraw(${CO(-8400,'3000')})`)===0, 'even if a draw was recorded on the row');
ok(R(`coAllowanceDraw(${CO(8400,'3000')})`)===3000, 'a normal draw is untouched');
ok(R(`coAllowanceDraw(${CO(8400,'99999')})`)===8400, 'and is still capped at what the change order is worth');
ok(R(`coAllowanceDraw(${CO(8400,'-500')})`)===0, 'a negative draw recorded by hand is refused, not honoured');
{
  R(`allData.co=[{'Status':'Approved','Company':'Summit Builders','Approved Amount':'-8400'}]`);
  ok(R(`allowanceUsedBy('Summit Builders')`)===0,
     'so a contract with a deduct on it shows no allowance consumed');
}

console.log('Netting to zero is an answer, not an absence');
{
  R(`allData.co=[{'Status':'Approved','Company':'Summit Builders','Approved Amount':'5000'},
                 {'Status':'Approved','Company':'Summit Builders','Approved Amount':'-5000'}]`);
  ok(R(`coContractImpactFor('Summit Builders')`)===0, 'an addition and a matching deduct cancel');
  ok(R(`coHasApproved('Summit Builders')`)===true,
     'but the log still says something is on it');
  R(`allData.co=[]`);
  ok(R(`coHasApproved('Summit Builders')`)===false, 'and an empty log says nothing is');
  // `coFromLog || payApp` read a net of zero as "nothing on file" and
  // substituted the pay application's figure — a different number, silently.
  ok(/const co = coHasApproved\(c\.name\) \? coFromLog : \(pa \? num\(pa\['Approved Change Orders'\]\) : 0\)/.test(html),
     'so the summary asks whether there is a log, not whether the total is truthy');
}

console.log('The generated document agrees with the dashboard');
{
  const m = html.split('function coContractMathFor(r, rolled){')[1].split('\n}')[0];
  ok(/const drawOf=e=>\(e\.amount<0\) \? 0/.test(m), 'the document draws nothing on a deduct either');
  ok(/const impactOf=e=>\(e\.amount<0\) \? e\.amount :/.test(m),
     'and carries the deduct through to the contract rather than clamping it');
  ok(/fmtMoney\(gross<0\?gross:Math\.max\(0,gross-amt\)\)/.test(html),
     'and the running note in the generator says the same');
}

console.log('The allowance controls switch off on a deduct');
{
  const g = html.split('function coGenAllowNote(){')[1].split('\n}')[0];
  ok(/if\(coIsDeduct\(r\)\)\{/.test(g), 'a deduct disables them');
  ok(/sel\.disabled=true/.test(g) && /amt\.disabled=true/.test(g),
     'rather than leaving a live field whose value would then be ignored');
  ok(/r\['Allowance'\]=''; r\['Applied to Allowance'\]='';/.test(g),
     'and clears anything already recorded, so the row cannot keep a draw it no longer makes');
  ok(/It reduces the contract and does not draw on an allowance/.test(g), 'and says why');
  ok(/if\(sel\) sel\.disabled=false; if\(amt\) amt\.disabled=false;/.test(g),
     'while a positive change order re-enables them — a disabled field must not stick');
}

console.log('It says so on the form');
{
  const f = html.split('  co:{title:')[1].split('`},')[0];
  ok(/Enter a deduct as a negative, e\.g\. -8400/.test(f), 'the cost field explains the convention');
  ok(/cannot draw on an allowance/.test(f), 'and what a deduct will not do');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-deduct.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
