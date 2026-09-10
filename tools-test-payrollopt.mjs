// A payroll number is an index, not the record. A subcontractor filing through
// a GC often has none of their own, and a batch of files shares one form — so
// the number is blank on every copy but the first anyway. Refusing the
// document over it would be refusing the record for the sake of the index.
//
// Two things beside it were wrong. The form said Company * and nothing checked
// it, while the daily report form next to it did. And Week Ending, left blank,
// filed the document under this month while the row claimed no date at all.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const form = k => { const i=html.indexOf('  '+k+':{'); return html.slice(i, html.indexOf('`},', i)); };
const branch = k => html.split("} else if(currentModal==='"+k+"'){")[1].split('} else if(currentModal===')[0];

console.log('The number is optional, and says so');
{
  const f = form('payroll');
  ok(/<label>Payroll #<\/label>/.test(f) && !/<label>Payroll #\s*\*/.test(f),
     'no asterisk on the label');
  ok(/Optional \\u2014 leave blank if the payroll is unnumbered/.test(f),
     'and it says so in words — an absent asterisk is a weak signal to read a form by');
  ok(!/id="f-num"[^>]*\brequired\b/.test(f), 'the browser does not enforce one either');
}
ok(!/Payroll # is required|Payroll number is required/.test(html),
   'and nothing anywhere refuses a submission for want of one');
{
  const b = branch('payroll');
  ok(/'Payroll #':v\('f-num'\)/.test(b), 'whatever was typed is stored as it is');
  ok(!/f-num'\)\s*\|\|/.test(b), 'with nothing invented to fill the gap');
}
ok(/if\(headers\.includes\('Payroll #'\)\) _r\['Payroll #'\]=''/.test(html),
   'and a batch leaves it blank on the copies, since one number cannot describe several payrolls');

console.log('Company, which is required, is now actually checked');
{
  const b = branch('payroll');
  ok(/if\(!_comp\) throw new Error\('Company is required\.'\)/.test(b),
     'the form said Company * and nothing checked it');
  ok(/<label>Company \*<\/label>/.test(form('payroll')), 'the label claims it');
  // A blank company files at the module root instead of the company folder,
  // and viewerFilter hides the row from the contractor who sent it.
  ok(/viewerFilter\(allData\.payrolls\|\|\[\],'Company'\)/.test(html),
     'because a row with no company is one the contractor who filed it cannot see');
}
ok(/if\(!_comp\) throw new Error\('Company is required\.'\)/.test(branch('cdaily')),
   'matching the daily report form beside it, which always did');

console.log('Week ending agrees with the folder the file went into');
{
  const b = branch('payroll');
  ok(/'Week Ending':\(v\('f-week'\)\|\|etToday\(\)\)/.test(b),
     'a blank week ending records today rather than nothing');
  // The month folder falls back to today when the form gives no date. If the
  // row recorded nothing, the log and Box disagreed about the same payroll:
  // filed under September, listed under "No date recorded".
  ok(/const _mf = monthFolderName\(ymOf\(v\('f-date-sub'\) \|\| v\('f-week'\) \|\| etToday\(\)\)/.test(html),
     'which is the same fallback the month folder uses');
  ok(/'Date':\(v\('f-date-sub'\)\|\|etToday\(\)\)/.test(branch('cdaily')),
     'as the daily report does');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-payrollopt.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
