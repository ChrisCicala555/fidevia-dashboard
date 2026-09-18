// "Submitted by - please make the submissions (company above submitter) change..
//  similar to what we did in the other tabs"
//
// The four logs show the firm on the first line and the person underneath,
// because a log is read by company. The Activity Feed, which gathers all four,
// was still flattening the stored value to a single string — so it printed a
// bare signup address, and for change orders printed nothing at all.
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P=bootPage('index.html'); P.run(SEED);

const feed = () => P.run(`(function(){ renderOverview();
  return document.getElementById('tbody-feed').innerHTML; })()`);

console.log('The feed uses the same cell as the logs');
{
  const h=feed();
  ok(/Summit Builders/.test(h), 'the firm is named');
  ok(/class="cell-sub"/.test(h), 'and the person sits under it on a second line');
  // The firm must be the line above, not the line below.
  const rows=h.split('<tr').filter(x=>/Summit Builders/.test(x));
  ok(rows.length>=3, 'on every kind of row');
  rows.forEach(r=>{
    const cell=(r.match(/<td>((?:(?!<\/td>).)*cell-sub(?:(?!<\/td>).)*)<\/td>/)||[])[1];
    if(!cell) return;
    ok(cell.indexOf('Summit Builders') < cell.indexOf('cell-sub'),
       'the company is above the submitter, not under them');
  });
}

console.log('A change order names its firm now');
{
  const h=feed();
  const co=h.split('<tr').find(x=>/Change Order/.test(x))||'';
  ok(/Change Order/.test(co), 'the change order is in the feed');
  ok(/Summit Builders/.test(co), 'and says who raised it — the column was blank for change orders before');
}

console.log('A bare signup address resolves to the person');
{
  const h=P.run(`(function(){
    allData.sub[0]['Submitted By (Sub)']='d@s.test';
    renderOverview();
    return document.getElementById('tbody-feed').innerHTML; })()`);
  const row=h.split('<tr').find(x=>/SUB-GC-001/.test(x))||'';
  ok(/Summit Builders/.test(row), 'the firm still leads');
  ok(/Dave Chen/.test(row), 'and the directory turns the address into a name');
  ok(!/d@s\.test/.test(row), 'the address itself is not what the project reads');
  P.run(`allData.sub[0]['Submitted By (Sub)']='Dave';`);
}

console.log('The firm comes off the row, not out of the name');
{
  // Half the log records "Person (Firm)" and half records the person alone with
  // the company in its own field. The feed has to carry the row to read the
  // second kind at all.
  const h=P.run(`(function(){
    allData.rfi[0]['Submitted By']='Dave';
    allData.rfi[0]['Company']='Summit Builders';
    renderOverview();
    return document.getElementById('tbody-feed').innerHTML; })()`);
  const row=h.split('<tr').find(x=>/RFI-GC-001/.test(x))||'';
  ok(/Summit Builders/.test(row),
     'a name with no company in brackets still shows the firm, from the row\'s own Company field');
  ok(/cell-sub">Dave</.test(row), 'with the person underneath');
  P.run(`allData.rfi[0]['Submitted By']='Dave (Summit Builders)';`);
}

console.log('A row with no firm on it degrades, it does not break');
{
  const h=P.run(`(function(){
    allData.rfi[0]['Company']=''; allData.rfi[0]['Submitted By']='Solo Person';
    renderOverview();
    return document.getElementById('tbody-feed').innerHTML; })()`);
  const row=h.split('<tr').find(x=>/RFI-GC-001/.test(x))||'';
  ok(/Solo Person/.test(row), 'the one name there is takes the first line');
  ok(!/Solo Person<\/div>/.test(row), 'and is not repeated underneath itself');
  P.run(`allData.rfi[0]['Company']='Summit Builders'; allData.rfi[0]['Submitted By']='Dave (Summit Builders)';`);
}

console.log('The same name twice is printed once');
{
  // What stops "Solo Person / Solo Person" is twoLine's own guard, so it is
  // checked where it lives rather than only through the feed.
  const t=(a,b)=>P.run(`twoLine(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
  ok(!/cell-sub/.test(t('Summit Builders','Summit Builders')), 'an exact repeat gets one line');
  ok(!/cell-sub/.test(t('Summit Builders','summit builders')), 'and so does a repeat in another case');
  ok(/cell-sub/.test(t('Summit Builders','Dave')), 'two different things get two lines');
}

console.log('Nothing else about the row moved');
{
  const h=feed();
  ok(/RFI-GC-001/.test(h) && /PCO-GC-001/.test(h) && /SUB-GC-001/.test(h) && /PA-001/.test(h),
     'all four kinds are listed, and a proposal shows its PCO number rather than a dash with nothing before it');
  ok(/Beam clearance/.test(h), 'the item column is untouched');
  ok(/navTo\('rfis'\)/.test(h), 'and a row still opens its log');
  const cols=(h.split('<tr')[1]||'').split('<td').length-1;
  ok(cols===5, 'five columns, as the header promises');
}

console.log(bad?`\n${bad}/${n} failed`:`\n${n} checks passed`);
process.exit(bad?1:0);
