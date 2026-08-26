// The spec fixes three days a month: the contractor's pencil copy, the formal
// application, and the owner's payment. The payment falls in the month AFTER
// the other two, which is the whole reason this needs its own arithmetic.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

fs.writeFileSync('.bl.tmp.mjs', [
  "export let currentProject={config:{}};",
  "export function setCycle(b){ currentProject.config.billing=b; }",
  src.slice(src.indexOf('const BILLING_DEFAULT'), src.indexOf('function billingCycle')),
  grab('function billingCycle'), grab('function dayOfMonth'), grab('function billingDatesFor'),
  "export { billingCycle, dayOfMonth, billingDatesFor };"
].join('\n'));
const M = await import('./.bl.tmp.mjs');
const { billingCycle, dayOfMonth, billingDatesFor, setCycle } = M;

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

console.log('Defaults');
setCycle(undefined);
let c=billingCycle();
ok('falls back to 20 / 25 / 15', c.pencilDay===20 && c.formalDay===25 && c.ownerPayDay===15);
ok('reports itself as unconfigured', c.configured===false);
setCycle({pencilDay:10, formalDay:18, ownerPayDay:5});
c=billingCycle();
ok('reads a configured cycle', c.pencilDay===10 && c.formalDay===18 && c.ownerPayDay===5);
ok('reports itself as configured', c.configured===true);

console.log('Out-of-range values fall back rather than producing nonsense');
setCycle({pencilDay:0, formalDay:99, ownerPayDay:-3});
c=billingCycle();
ok('zero falls back',      c.pencilDay===20);
ok('above 31 falls back',  c.formalDay===25);
ok('negative falls back',  c.ownerPayDay===15);
setCycle({pencilDay:'12', formalDay:'20', ownerPayDay:'8'});
c=billingCycle();
ok('numeric strings are accepted', c.pencilDay===12 && c.formalDay===20 && c.ownerPayDay===8);

console.log('Short months');
// new Date(2026, 1, 31) silently becomes 3 March. It must clamp to 28 Feb.
ok('31 in February clamps to the 28th', iso(dayOfMonth(2026,1,31))==='2026-02-28');
ok('29 in a leap February is kept',     iso(dayOfMonth(2024,1,29))==='2024-02-29');
ok('31 in April clamps to the 30th',    iso(dayOfMonth(2026,3,31))==='2026-04-30');
ok('31 in a 31-day month is kept',      iso(dayOfMonth(2026,4,31))==='2026-05-31');
ok('a normal day is untouched',         iso(dayOfMonth(2026,7,15))==='2026-08-15');

console.log('The three dates for a period');
setCycle({pencilDay:20, formalDay:25, ownerPayDay:15});
let d=billingDatesFor(new Date(2026,7,8));           // any date inside August
ok('pencil lands in the billing month', iso(d.pencil)==='2026-08-20');
ok('formal lands in the billing month', iso(d.formal)==='2026-08-25');
// The one that is easy to get wrong.
ok('owner payment lands in the FOLLOWING month', iso(d.ownerPay)==='2026-09-15');

console.log('Year boundary');
d=billingDatesFor(new Date(2026,11,3));              // December
ok('December pencil stays in December', iso(d.pencil)==='2026-12-20');
ok('owner payment rolls into January of the next year', iso(d.ownerPay)==='2027-01-15');

console.log('Short-month payment');
setCycle({pencilDay:20, formalDay:25, ownerPayDay:31});
d=billingDatesFor(new Date(2026,0,10));              // January, paid in February
ok('a 31st payment day clamps in February', iso(d.ownerPay)==='2026-02-28');

console.log('Bad input');
ok('an unparseable date yields nothing', billingDatesFor('not a date')===null);
ok('an empty string yields nothing',     billingDatesFor('')===null);

console.log('Wiring');
ok('the strip exists',                  html.includes('id="billing-bar"'));
ok('the editor exists',                 html.includes('id="billing-backdrop"'));
ok('the editor is admin only',          /admin-only[^>]*onclick="openBilling\(\)"/.test(html));
ok('the wizard collects all three',     html.includes('id="np-pencil"') && html.includes('id="np-formal"') && html.includes('id="np-ownerpay"'));
ok('the wizard writes it to config',    /billing: \{ pencilDay:/.test(src));
ok('the pay app due date defaults from it', /billingDatesFor\(pd\.value\)/.test(src));
ok('a typed due date is not overwritten',   /du\.dataset\.touched/.test(src));
ok('the editor warns if formal precedes pencil', /formal application falls before the pencil copy/.test(src));

fs.rmSync('.bl.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
