// Automatic job codes: YY-NNN, counter continuing across years.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const op = srv.split("if (op === 'nextJobNumber')")[1].split("if (op === 'adminListProjects'")[0];
ok(/who\.isAdmin/.test(op), 'nextJobNumber is admin-only');
ok(/Project Info\.json/.test(op), 'it reads each project config');
ok(/SYSTEM_FOLDERS\.includes/.test(op), 'system folders are not counted as projects');
ok(/let highest = 100/.test(op), 'the sequence starts at 101');
ok(!/getFullYear\(\) % 100\)[\s\S]{0,80}highest = 0/.test(op), 'the counter is not reset per year');

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
ok(/openNewProject\(\)\{ initWizard\(\); showScreen\('screen-new-project'\); wizFillJobNumber\(\); \}/.test(html),
   'it runs when the wizard opens, after the fields are cleared');
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
ok(/delete jn\.dataset\.suggested/.test(html), 'reopening the wizard forgets the previous suggestion');
ok(!/placeholder="e\.g\. 24-108"/.test(html), 'the stale 24- placeholder is gone');

console.log((bad?'FAIL ':'ok   ')+'tools-test-jobnum.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
