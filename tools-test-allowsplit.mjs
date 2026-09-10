// One change order, several allowances. A closeout reconciling three at once is
// one piece of paper, not three; work funded partly from two allowances is one
// change order. The row carried a single Allowance / Applied to Allowance pair,
// so it could only ever name one.
//
// The storage is a list, and every piece of arithmetic goes through one
// accessor — coAllowanceSplits — so the format lives in a single place and rows
// written before this still read.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
P.run(`currentProject.config.contractors=[{name:'Summit Builders',contract:'2000000',active:true,
  allowances:[{id:'A',name:'Floor leveler',amount:'60000'},{id:'B',name:'Hardware',amount:'20000'},
              {id:'C',name:'Paint',amount:'15000'}]}]`);
const R = e => P.run(e);
const splitRow = (amt, pairs) => JSON.stringify({'Status':'Approved','Company':'Summit Builders',
  'Approved Amount':String(amt), 'Allowance Splits':JSON.stringify(pairs)});
const set = js => R(`allData.co=${js}`);
const now = id => R(`allowancesFor('Summit Builders').find(x=>x.id==='${id}').amount`);
const used = id => R(`allowanceUsedById('Summit Builders','${id}')`);
const contract = () => R(`coContractImpactFor('Summit Builders')`);

console.log('Reading the list back');
ok(R(`JSON.stringify(coAllowanceSplits({'Allowance Splits':'[{"id":"A","amount":10000},{"id":"B","amount":5000}]'}))`)
   === JSON.stringify([{id:'A',amount:10000},{id:'B',amount:5000}]), 'a list reads as a list');
ok(R(`JSON.stringify(coAllowanceSplits({'Allowance':'A','Applied to Allowance':'9000'}))`)
   === JSON.stringify([{id:'A',amount:9000}]),
   'a row written before this, carrying the single pair, reads as a list of one');
ok(R(`coAllowanceSplits({}).length`)===0 && R(`coAllowanceSplits(null).length`)===0, 'and an empty row as none');
ok(R(`coAllowanceSplits({'Allowance Splits':'not json'}).length`)===0,
   'corrupt JSON yields nothing rather than throwing');
ok(R(`JSON.stringify(coAllowanceSplits({'Allowance Splits':'[{"id":"a","amount":"5000"}]'}))`)
   === JSON.stringify([{id:'A',amount:5000}]), 'ids are normalised');
ok(R(`coAllowanceSplits({'Allowance Splits':'[{"id":"A","amount":-5000}]'}).length`)===0,
   'and a negative line is dropped rather than read as either a draw or a write-down — the change order carries the sign, so a negative line is bad data and guessing at it would be worse than ignoring it');
ok(R(`JSON.stringify(coAllowanceSplits({'Allowance Splits':'[{"id":"A","amount":1000},{"id":"A","amount":500}]'}))`)
   === JSON.stringify([{id:'A',amount:1500}]), 'the same allowance twice is one line, summed');
ok(R(`JSON.stringify(coAllowanceSplits({'Allowance Splits':'[{"id":"","amount":100},{"id":"B","amount":0}]'}))`)
   === JSON.stringify([]), 'a line with no allowance, or no amount, is not a line');
ok(R(`coAllowanceAmountFor({'Allowance Splits':'[{"id":"A","amount":10000},{"id":"B","amount":5000}]'},'b')`)===5000,
   'and one allowance can be asked for by name');
{
  // Two things the single pair left implicit, which a list has to say out loud.
  ok(R(`JSON.stringify(coAllowanceSplits({'Applied to Allowance':'4000'}))`)
     === JSON.stringify([{id:'A',amount:4000}]),
     'a draw recorded before allowances were named belonged to the only allowance there was, which is A');
  ok(R(`JSON.stringify(coAllowanceSplits({'Allowance':'B','Approved Amount':'-7000'}))`)
     === JSON.stringify([{id:'B',amount:7000}]),
     'and a deduct naming an allowance with no amount wrote it down by its own value, which is now filled in');
  ok(R(`coAllowanceSplits({'Allowance':'B','Approved Amount':'7000'}).length`)===0,
     'while a positive change order naming an allowance with no amount draws nothing — it never did');
}
{
  // A deduct's lines are write-downs, never draws. The scaling is what does it:
  // the draw is zero on a deduct, so its lines contribute nothing to the spend.
  set(`[${splitRow(-30000,[{id:'A',amount:10000}])}]`);
  ok(used('A')===0, 'a deduct adds nothing to what an allowance has been spent on');
  ok(now('A')===50000, 'it comes off the face amount instead');
}

console.log('Christopher’s case: one deduct settling three allowances');
set(`[${splitRow(65000,[{id:'A',amount:50000},{id:'B',amount:15000}])},
      ${splitRow(-30000,[{id:'A',amount:10000},{id:'B',amount:5000},{id:'C',amount:15000}])}]`);
ok(now('A')===50000 && now('B')===15000 && now('C')===0,
   'all three are written down by the one change order');
ok(used('A')===50000 && used('B')===15000, 'the spend against each is unchanged');
ok(R(`allowanceRemainingById('Summit Builders','A')`)===0
   && R(`allowanceRemainingById('Summit Builders','B')`)===0,
   'and nothing remains on the two that were reconciled');
ok(contract()===-30000, 'while the contract falls by the whole credit, once');

console.log('One change order drawing on two allowances');
set(`[${splitRow(65000,[{id:'A',amount:50000},{id:'B',amount:15000}])}]`);
ok(used('A')===50000 && used('B')===15000, 'each allowance takes its own share');
ok(contract()===0, 'and nothing reaches the contract, the whole change order being funded');
set(`[${splitRow(70000,[{id:'A',amount:50000},{id:'B',amount:15000}])}]`);
ok(contract()===5000, 'only the excess above the draws lands on the contract');

console.log('Lines cannot exceed the change order');
set(`[${splitRow(10000,[{id:'A',amount:40000},{id:'B',amount:40000}])}]`);
ok(R(`coAllowanceDraw(allData.co[0])`)===10000,
   'a draw is still capped at what the change order is worth');
ok(used('A')+used('B')===10000,
   'and the cap is shared between the lines rather than applied to each — otherwise 10,000 of work would consume 20,000 of allowance');
ok(Math.round(used('A'))===5000, 'each taking its proportion');
set(`[${splitRow(-10000,[{id:'A',amount:40000},{id:'B',amount:40000}])}]`);
ok(Math.round(60000-now('A'))===5000 && Math.round(20000-now('B'))===5000,
   'a write-down is scaled the same way, so a deduct cannot erase more allowance than it returns');

console.log('A deduct naming no allowance');
set(`[${JSON.stringify({'Status':'Approved','Company':'Summit Builders','Approved Amount':'-9000'})}]`);
ok(now('A')===60000 && now('B')===20000 && now('C')===15000,
   'writes none of them down — it is a plain contract credit');
ok(contract()===-9000, 'and still comes off the contract');

console.log('Writing the list back to a row');
{
  R(`ROW={}`);
  R(`coSetAllowanceSplits(ROW, [{id:'A',amount:10000},{id:'B',amount:5000}])`);
  ok(R(`ROW['Allowance Splits']`)==='[{"id":"A","amount":10000},{"id":"B","amount":5000}]',
     'several lines are stored as the list');
  ok(R(`ROW['Allowance']`)==='A+B' && R(`ROW['Applied to Allowance']`)==='15000',
     'and the single pair is kept in step, so an older export or a spreadsheet is not silently wrong');
  R(`coSetAllowanceSplits(ROW, [{id:'A',amount:9000}])`);
  ok(R(`ROW['Allowance Splits']`)==='' && R(`ROW['Allowance']`)==='A' && R(`ROW['Applied to Allowance']`)==='9000',
     'one line stays in the old shape, so nothing gains a JSON column it does not need');
  R(`coSetAllowanceSplits(ROW, [])`);
  ok(R(`ROW['Allowance']`)==='' && R(`ROW['Applied to Allowance']`)==='' && R(`ROW['Allowance Splits']`)==='',
     'and clearing it clears all three');
  R(`coSetAllowanceSplits(ROW, [{id:'A',amount:1000},{id:'a',amount:500},{id:'',amount:99}])`);
  ok(R(`ROW['Allowance']`)==='A' && R(`ROW['Applied to Allowance']`)==='1500',
     'duplicates merge and blanks are dropped on the way in, not only on the way out');
}
ok(/'Cost Impact','Approved Amount','Applied to Allowance','Allowance','Allowance Splits',/.test(html),
   'and the column exists in the log');

console.log('Every reader goes through the accessor');
{
  // The point of one accessor is that no arithmetic reads the raw fields. If
  // one does, it will be the one that misses a split.
  const body = html.split('function coAllowanceSplits')[1];
  const readers = ['function coAllowanceDraw','function allowanceUsedById','function allowanceReducedById'];
  readers.forEach(fn=>{
    const f = html.split(fn)[1].split('\n}')[0];
    ok(!/\['Applied to Allowance'\]/.test(f),
       fn.replace('function ','')+' does not read the single pair directly');
  });
  const cm = html.split('function coContractMathFor')[1].split('\n}')[0];
  ok(!/\['Applied to Allowance'\]/.test(cm), 'nor does the generator’s own maths');
}

console.log('The dialogs offer more than one line');
{
  ok(/id="cg-allow-rows"/.test(html) && /id="nc-allow-rows"/.test(html),
     'both dialogs hold a list of rows');
  ok(/\+ Another allowance/.test(html), 'with a way to add one');
  ok((html.match(/\+ Another allowance/g)||[]).length===2, 'in each of them');
  ok(/onclick="allowRowRemove\(this/.test(html), 'and to remove one');
  const rm = html.split('function allowRowRemove')[1].split('\n}')[0];
  ok(/if\(box && !box\.children\.length\)/.test(rm),
     'removing the last line leaves an empty one, so there is always somewhere to type');
  ok(/coSetAllowanceSplits\(r, allowRowsRead\('cg'\)\)/.test(html), 'the generator saves what was typed');
  ok(/coSetAllowanceSplits\(row, allowSplits\)/.test(html), 'and so does issuing one directly');
}
{
  const g = html.split('function coGenAllowNote(){')[1].split('\n}')[0];
  ok(/The same allowance is on two lines/.test(g), 'two lines for one allowance is refused, not summed silently');
  ok(/The lines write off '\+fmtMoney\(total\)\+' but the change order is only worth/.test(g),
     'lines writing off more than the change order returns are refused');
  ok(/The lines draw '\+fmtMoney\(total\)\+' but the change order is only worth/.test(g),
     'and so are draws above what is being paid');
  ok(/is a plain contract credit/.test(g),
     'a deduct larger than the allowances it settles says where the rest goes');
  ok(/const before=\(a\?a\.amount:0\) \+ coAllowanceAmountFor\(r, x\.id\)/.test(g),
     'each line is measured against its own allowance before this change order');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-allowsplit.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
