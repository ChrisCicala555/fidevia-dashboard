// Submittals follow the same assignment rule as RFIs.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/id="f-reviewer" readonly/.test(html), 'the submittal field reports rather than asks');
ok(/fillAssignedFirm\('sub','f-reviewer'\)/.test(html), 'filled from the submittal chain');
ok(/notifyFirms\(itemAssignedFirms\('sub', _sc\), 'Notify - Submittal'\)/.test(html),
   'every firm on the first review step is notified');
ok(!/find\(c=>\(c\['Name'\]\|\|''\)\.trim\(\)===\(newRow\['Reviewer'\]/.test(html),
   'the single named reviewer recipient is gone');
ok(/'Reviewer':\(itemAssignedFirms\('sub',_sc\)\[0\]\|\|''\)/.test(html),
   'and the stored value comes from the chain, not a form field');
ok(/const firm=assignedFirm\(r\['Reviewer'\]\)/.test(html), 'attention routes on the firm');
ok(/esc\(assignedFirm\(r\['Reviewer'\]\)\)/.test(html), 'the table shows the firm');
ok(/const raw=String\(\(r&&r\[field\]\)\|\|''\)\.trim\(\);\n  const f=assignedFirm\(raw\);/.test(html),
   'a row naming a person keeps the name under the firm');
ok(/assignedCell\('rfi', r, 'Assigned To'\)/.test(html) && /assignedCell\('sub', r, 'Reviewer'\)/.test(html),
   'and both modules render that column through the same helper');

// both modules now resolve the same way
{
  const uses=(html.match(/assignedFirm\(/g)||[]).length;
  ok(uses>=6, 'assignedFirm still resolves the firm for both modules (found '+uses+')');
}
ok(!/personIsOurs\(r\['Assigned To'\]\)/.test(html) && !/personIsOurs\(r\['Reviewer'\]\)/.test(html),
   'neither module routes attention on an individual any more');

console.log((bad?'FAIL ':'ok   ')+'tools-test-subfirm.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
