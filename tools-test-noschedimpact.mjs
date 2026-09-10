// Schedule impact in days came off the change order at Christopher's request:
// out of the dialog that issues one, and out of the document it generates.
// Same treatment as Cause before it — gone from the interface, kept in the CSV
// so change orders that recorded a figure do not lose it.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

console.log('Gone from the dialog');
ok(!/id="nc-days"/.test(html), 'no field');
ok(!/Schedule impact \(days\)/.test(html), 'and no label left behind');
ok(!/'nc-days'/.test(html), 'nothing clears or reads it');
{
  const row = (html.match(/<label>Date issued<\/label>[\s\S]{0,600}?<\/div>\s*<\/div>/)||[''])[0];
  ok(/Amount \(\$\)/.test(row),
     'Date issued pairs with Amount instead — dropping the field would otherwise leave one half-empty row above another');
  ok(!/<div class="field" style="flex:1;"><\/div>/.test(row),
     'and the spacer that held the empty half is gone with it');
}

console.log('Gone from the generated document');
ok(!/Contract time adjustment/.test(html), 'the time adjustment line is not printed');
ok(!/\+' days',9\.5,true\)/.test(html), 'nor the figure it carried');
{
  const line = (html.match(/lbl\(M,y,'Substantial completion'\);[^\n]*/)||[''])[0];
  ok(line.length>0, 'substantial completion moves to the margin');
  ok(/val\(M\+112,y,opts\.subComp/.test(line),
     'with its value beside it, rather than staying at the middle of a line whose left half is now empty');
}
ok(!/M\+250\+112/.test(html), 'and nothing is still positioned against the label that was removed');

console.log('Kept where removing it would destroy something');
{
  const hdr = html.split("co:       {folder:'02 - Change Orders'")[1].split(']}')[0];
  ok(/'Schedule Impact \(Days\)'/.test(hdr), 'the column stays in the log');
}
ok(/row\['Schedule Impact \(Days\)'\]='';/.test(html),
   'a newly issued change order writes it blank rather than omitting the key');
ok(/'Schedule Impact \(Days\)':''/.test(html), 'and so does a new proposal');
ok(/'Cause' and 'Schedule\s*\n\/\/ Impact \(Days\)' are here without being anywhere in the interface/.test(html),
   'with the reason recorded beside the headers, so neither column reads as an oversight later');

console.log((bad?'FAIL ':'ok   ')+'tools-test-noschedimpact.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
