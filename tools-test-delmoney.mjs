// Deleting a change order moves the contract. The person pressing Delete should
// be told by how much before they press it, not find out on the Financial
// Summary afterwards — and the four cases are genuinely different, so a single
// warning would be wrong three times out of four.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);
const setup = () => R(`
  currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'3000000',active:true}];
  allData.pay_apps=[];
  allData.co=[
   {'PCO #':'PCO-GC-001','Company':'Summit Builders','Approved Amount':'10000','Status':'Rolled into CO-GC-003','Rolled Into':'CO-GC-003'},
   {'PCO #':'PCO-GC-002','Company':'Summit Builders','Approved Amount':'5000','Status':'Rolled into CO-GC-003','Rolled Into':'CO-GC-003'},
   {'PCO #':'PCO-GC-004','Company':'Summit Builders','Approved Amount':'5000','Status':'Approved'},
   {'CO #':'CO-GC-003','Company':'Summit Builders','Approved Amount':'15000','Status':'Approved'}];`);
setup();
const eff = i => R(`coDeleteEffect(allData.co[${i}])`);

console.log('An executed change order');
{
  const t=eff(3);
  ok(/executed change order/.test(t), 'is named as one');
  ok(/from \$3,015,000 to \$3,000,000/.test(t),
     'with the contract before and after, not just the amount of the change order');
  ok(/PCO-GC-001, PCO-GC-002/.test(t), 'and the proposals it covered, by number');
  ok(/2 proposals it covered/.test(t) && / go back/.test(t) && /show as pending/.test(t),
     'reading as plural for two');
  ok(!/Summit Builders’s/.test(t),
     'and without a possessive on a name already ending in s');
}
{
  R(`allData.co[1]['Rolled Into']=''; allData.co[1]['Status']='Approved';`);
  const t=eff(3);
  ok(/1 proposal it covered/.test(t) && /goes back/.test(t) && /shows as pending/.test(t) && /picks it up/.test(t),
     'and as singular for one — four agreements, all of which read wrong if only the noun is switched');
  setup();
}

console.log('The other three cases say something different');
{
  const t=eff(2);
  ok(/no change order has picked up yet/.test(t), 'a pending proposal is named as one');
  ok(/the contract does not move/.test(t), 'and says the contract is unaffected');
  ok(/\$5,000 stops showing as pending/.test(t), 'while naming what does change');
}
{
  const t=eff(0);
  ok(/covered by CO-GC-003, which carries its value now/.test(t),
     'a covered proposal points at the change order holding its money');
  ok(/leaves CO-GC-003 as it is/.test(t), 'and says the change order is untouched');
  ok(!/has not been approved/.test(t),
     'rather than "not approved", which is true of the status field and misleading about the item');
}
{
  R(`allData.co.push({'PCO #':'PCO-GC-005','Company':'Summit Builders','Approved Amount':'900','Status':'Open'});`);
  ok(/the contract does not move/.test(R(`coDeleteEffect(allData.co[4])`)), 'an open proposal moves nothing');
  setup();
}
ok(R(`coDeleteEffect(null)`)==='' , 'and an absent row says nothing rather than throwing');
ok(R(`coDeleteEffect({'CO #':'X'})`)==='' , 'as does one with no company to price it against');

console.log('It reaches the prompt');
{
  const a = html.split('function askDelete(ev, key, i){')[1].split('\n}')[0];
  ok(/if\(key==='co'\)\{ try\{ _money=coDeleteEffect\(\(allData\.co\|\|\[\]\)\[i\]\) \}/.test(a.replace(/;\s*\}catch/,' }catch')),
     'change orders get the money sentence');
  ok(/catch\(e\)\{ _money=''; \}/.test(a),
     'and a failure to work it out loses the sentence rather than the ability to delete');
  ok(/\+\(_money\?\(_money\+'\\n\\n'\):''\)/.test(a), 'it goes above the rest of the prompt');
  ok(/It cannot be undone here/.test(a), 'which still says the row does not come back');
  ok(/moved to the module/.test(a), 'and that the documents are kept');
}
ok(!/coDeleteEffect/.test(html.split("function askDelete")[0].split('function coDeleteEffect')[0]),
   'nothing else calls it, so the wording lives in one place');

console.log('One definition of the contract base');
{
  ok(/function contractBaseFor\(name\)\{/.test(html), 'there is a helper for it');
  const f = html.split('function renderFinancials')[1].split('\n}')[0];
  ok(/const contract = contractBaseFor\(c\.name\);/.test(f),
     'the financial summary uses it, so the figure in the prompt is the figure on the page');
  ok(!/pa && num\(pa\['Contract Amount'\]\)/.test(f),
     'and no longer works it out a second way');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-delmoney.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
