// Submittals follow the same assignment rule as RFIs.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/id="f-reviewer"><\/select><p class="file-hint"[^>]*>Everyone there with submittal notifications on is told/.test(html)
   || /<label>Assigned firm<\/label><select autocomplete="off" id="f-reviewer">/.test(html),
   'the submittal field asks for a firm');
ok(/document\.getElementById\('f-reviewer'\); if\(sel&&sel\.tagName==='SELECT'\) sel\.innerHTML=firmOptions\(''\)/.test(html),
   'and is filled with firms, not contacts');
ok(/Notify - Submittal'\]\|\|''\)\.toLowerCase\(\)!=='yes'/.test(html),
   'everyone at that firm who asked for submittal notices is added');
ok(/Same rule as the RFI: the reviewing office, not one person in it/.test(html),
   'the parity with RFIs is recorded');
ok(!/find\(c=>\(c\['Name'\]\|\|''\)\.trim\(\)===\(newRow\['Reviewer'\]/.test(html),
   'the single named reviewer recipient is gone');
ok(/const firm=assignedFirm\(r\['Reviewer'\]\)/.test(html), 'attention routes on the firm');
ok(/esc\(assignedFirm\(r\['Reviewer'\]\)\)/.test(html), 'the table shows the firm');
ok(/const f=assignedFirm\(r\['Reviewer'\]\), raw=String\(r\['Reviewer'\]\|\|''\)\.trim\(\)/.test(html),
   'a submittal naming a person keeps the name under the firm');

// both modules now resolve the same way
{
  const uses=(html.match(/assignedFirm\(/g)||[]).length;
  ok(uses>=8, 'assignedFirm is used across both modules (found '+uses+')');
}
ok(!/personIsOurs\(r\['Assigned To'\]\)/.test(html) && !/personIsOurs\(r\['Reviewer'\]\)/.test(html),
   'neither module routes attention on an individual any more');

console.log((bad?'FAIL ':'ok   ')+'tools-test-subfirm.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
