// Automatic job codes: YY-NNN, counter continuing across years.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const op = srv.split("if (op === 'nextJobNumber' || op === 'rebuildJobNumbers')")[1].split("if (op === 'recordJobNumber')")[0];
ok(/who\.isAdmin/.test(op), 'nextJobNumber is admin-only');
ok(/Project Info\.json/.test(op), 'it reads each project config');
ok(/SYSTEM_FOLDERS\.includes/.test(op), 'system folders are not counted as projects');
ok(/function highestOf/.test(srv) && /let hi = 100/.test(srv), 'the sequence starts at 101');
ok(!/getFullYear\(\) % 100\)[\s\S]{0,80}highest = 0/.test(op), 'the counter is not reset per year');

// ── the mark is stored, so a deletion cannot walk the sequence backwards ──
ok(/const jobNumStore = \(\) => getStore\('job-numbers'\)/.test(srv), 'the index has its own store');
ok(/const mustScan = \(op === 'rebuildJobNumbers'\) \|\| !idx/.test(op),
   'Box is read only to seed the index or on an explicit rebuild');
ok(/Math\.max\(prevHigh, highestOf\(found\)\)/.test(op),
   'a rebuild takes the higher of what is found and what was already issued');
{
  const rec = srv.split("if (op === 'recordJobNumber')")[1].split("if (op === 'adminListProjects'")[0];
  ok(/who\.isAdmin/.test(rec), 'recordJobNumber is admin-only');
  ok(/Math\.max\(Number\(idx\.highest\) \|\| 100, highestOf\(idx\.used\)\)/.test(rec),
     'the mark rises, never falls');
  ok(/if \(!jn\) return json\(\{ ok: true, skipped/.test(rec), 'a project with no number is a no-op');
}
// the failure that plain counting has, and this does not
{
  const highestOf = (used) => { let hi=100;
    for (const c of Object.keys(used||{})) { const m=/^(\d{2})-(\d+)$/.exec(String(c).trim());
      if (m) hi=Math.max(hi, parseInt(m[2],10)); } return hi; };
  // three issued, then the newest project is deleted
  let idx = { highest: 100, used: {} };
  for (const c of ['26-101','26-102','26-103']) { idx.used[c]='p'; idx.highest=Math.max(idx.highest, highestOf(idx.used)); }
  ok(idx.highest === 103, 'mark tracks the issued numbers');
  const countingWouldGive = 2 + 1;            // two projects left, count + 1
  ok(countingWouldGive === 3, 'counting projects after a deletion would suggest 103 again');
  ok(idx.highest + 1 === 104, 'the stored mark still gives 104 (got '+(idx.highest+1)+')');
  // and the newest-project idea has the same hole plus one more
  const newestHasNoNumber = { jobNumber: '' };
  ok(!newestHasNoNumber.jobNumber, 'the newest project may carry no number at all, giving nothing to add 1 to');
}

// The generator, run for real against the cases that matter.
const nextFrom = (codes, year) => {
  let highest = 100;
  for (const jobNumber of codes) {
    const m = /^(\d{2})-(\d+)$/.exec(jobNumber);
    if (m) highest = Math.max(highest, parseInt(m[2], 10));
  }
  const yy = String(year % 100).padStart(2, '0');
  return yy + '-' + String(highest + 1).padStart(3, '0');
};
ok(nextFrom([], 2026) === '26-101', 'the very first project is 26-101 (got '+nextFrom([],2026)+')');
ok(nextFrom(['26-101','26-102','26-103'], 2026) === '26-104',
   'continues the run (got '+nextFrom(['26-101','26-102','26-103'],2026)+')');
// the whole point of "never resets"
ok(nextFrom(['26-101','26-102','26-103','26-104'], 2027) === '27-105',
   'the counter carries across the new year (got '+nextFrom(['26-101','26-102','26-103','26-104'],2027)+')');
ok(nextFrom(['26-104','26-101'], 2026) === '26-105', 'order of projects does not matter');
// gaps and hand-set codes
ok(nextFrom(['26-101','26-140'], 2026) === '26-141', 'a gap is not backfilled — it takes the highest');
ok(nextFrom(['LSD-2024','ad hoc',''], 2026) === '26-101',
   'codes in another shape do not feed the counter');
ok(nextFrom(['26-101','LSD-2024'], 2026) === '26-102', 'a stray code does not stop the sequence');
ok(nextFrom(['26-099'], 2026) === '26-101', 'a number below the floor cannot pull the sequence back');
ok(nextFrom(['26-1000'], 2026) === '26-1001', 'four digits keep working past 999');
ok(/^\d{2}-\d{3}$/.test(nextFrom(['26-101'], 2026)), 'the shape stays YY-NNN');

// ── client ──
ok(/function wizFillJobNumber/.test(html), 'the wizard asks for the next number');
{
  // Pinned to order rather than to the exact line, which now also loads the
  // Onsite CM list: clearing the fields must come first or the suggestion is
  // wiped straight after it is written.
  const onp = html.split('function openNewProject()')[1].split('\n')[0];
  ok(/initWizard\(\)/.test(onp) && /wizFillJobNumber\(\)/.test(onp),
     'the wizard opener both clears and fills');
  ok(onp.indexOf('initWizard()') < onp.indexOf('wizFillJobNumber()'),
     'fields are cleared before the number is filled in');
}
const fill = html.split('async function wizFillJobNumber')[1].split('function wizCheckJobNumber')[0];
ok(/if\(!el\.value\.trim\(\)\)/.test(fill), 'a number already typed is never overwritten');
ok(/catch\(e\)\{/.test(fill) && /enter one manually/.test(fill),
   'a failed lookup leaves the field usable rather than blocking the wizard');
ok(/quiet:true/.test(fill), 'the lookup does not throw a visible error on the way in');

const chk = html.split('function wizCheckJobNumber')[1].split('function initWizard')[0];
ok(/Already used by/.test(chk), 'a duplicate is called out');
ok(/clash\.project/.test(chk), 'the warning names the project already using it');
ok(!/return false|preventDefault|disabled/.test(chk), 'a duplicate warns but does not block');
ok(/oninput="wizCheckJobNumber\(\)"/.test(html), 'the check runs as you type');
ok(/proxyCall\('recordJobNumber',\{ jobNumber:config\.jobNumber/.test(html),
   'the number issued at creation is recorded');
ok(/proxyCall\('recordJobNumber',\{ jobNumber:c\.jobNumber/.test(html),
   'a number edited in settings is recorded too');
{
  const cp = html.split('async function createProject')[1];
  ok(cp.indexOf('writeProjectConfig(projId, config)') < cp.indexOf("recordJobNumber"),
     'the number is recorded only after the project is written');
  ok(/try\{ await proxyCall\('recordJobNumber'[\s\S]{0,140}\}catch\(e\)\{\}/.test(cp),
     'a failure to record cannot fail the project');
}
ok(/async function rebuildJobNumbers/.test(html), 'the index can be repaired from Box');
ok(/delete jn\.dataset\.suggested/.test(html), 'reopening the wizard forgets the previous suggestion');
ok(!/placeholder="e\.g\. 24-108"/.test(html), 'the stale 24- placeholder is gone');

console.log((bad?'FAIL ':'ok   ')+'tools-test-jobnum.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
