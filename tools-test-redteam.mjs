// Red-team the read path: ask for every log the system knows about, as every
// external role, and assert the verdict. This exists because the old filter
// named the files to RESTRICT, so anything unnamed — the budget, the internal
// message board, the audit log — was served in full to any caller holding a
// project grant. A denylist also let a plural typo ('Submittal Log' vs
// 'Submittals Log') silently disable a control.
//
// If you add a module, add it here. A new log with no entry fails the test.
import { execSync } from 'child_process';
execSync('node tools-extract-filters.mjs', { cwd: process.cwd() });
const { filterCsvForCaller } = await import('./.filters.tmp.mjs');

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : (fail++, console.log('  FAIL: ' + name)); };

const CSV = 'Company,Contractor,Visible To,Secret\n'
          + 'Acme,Acme,External,ACMEROW\n'
          + 'Rival,Rival,External,RIVALROW\n'
          + 'Acme,Acme,Fidevia,INTERNALROW\n';

const ALL='all', OWN='own', NONE='none';
function verdict(file, role, company='Acme'){
  const out = filterCsvForCaller(file, CSV, false, company, role);
  const mine = out.includes('ACMEROW'), theirs = out.includes('RIVALROW');
  if (!mine && !theirs) return NONE;
  return theirs ? ALL : OWN;
}

// ── The matrix. Read this as the specification. ────────────────────────────
const EXPECT = {
  //                                contractor  A/E   owner
  'RFI Log.csv':                   [ALL,  ALL,  NONE],
  'Change Order Log.csv':          [ALL,  ALL,  ALL ],
  'Submittals Log.csv':            [ALL,  ALL,  NONE],
  'Job Contacts.csv':              [ALL,  ALL,  ALL ],
  'Payment Applications.csv':      [OWN,  ALL,  ALL ],
  'Contractor Daily Reports.csv':  [OWN,  ALL,  NONE],
  'Certified Payrolls.csv':        [OWN,  ALL,  NONE],
  // Internal to Fidevia. No external role reaches these in any circumstance.
  'Budget Tracker.csv':            [NONE, NONE, NONE],
  'Comments.csv':                  [NONE, NONE, NONE],
  'Daily Log Index.csv':           [NONE, NONE, NONE],
  'Meeting Minutes.csv':           [NONE, ALL,  ALL ],   // architect and owner attend OAC
  'Board Reports.csv':             [NONE, NONE, NONE],
  'Audit Log.csv':                 [NONE, NONE, NONE],
  // A log nobody has defined yet must be private, not public.
  'Some Future Module.csv':        [NONE, NONE, NONE],
  // The plural typo that used to defeat the owner block.
  'Submittal Log.csv':             [NONE, NONE, NONE]
};

const ROLES = ['contractor','architect-engineer','owner'];
console.log('Read matrix');
for (const [file, want] of Object.entries(EXPECT)) {
  ROLES.forEach((role,i)=>{
    const got = verdict(file, role);
    ok(`${file} as ${role}: expected ${want[i]}, got ${got}`, got === want[i]);
  });
}

console.log('Document visibility');
for (const f of ['Document Index.csv','Documents.csv']) {
  for (const role of ['contractor','architect-engineer']) {
    const out = filterCsvForCaller(f, CSV, false, 'Acme', role);
    ok(`${f} as ${role} withholds the Fidevia-only row`, !out.includes('INTERNALROW'));
    ok(`${f} as ${role} keeps externally visible rows`, out.includes('ACMEROW'));
  }
  ok(`${f} is withheld from an owner`, verdict(f,'owner') === NONE);
}

console.log('Admin passthrough');
for (const f of Object.keys(EXPECT)) {
  ok(`admin still reads ${f}`, filterCsvForCaller(f, CSV, true, '', '').includes('RIVALROW'));
}

console.log('Project configuration');
const CFG = JSON.stringify({
  contractors: [
    { name:'Acme',  contract:'1000000', allowance:'50000', active:true },
    { name:'Rival', contract:'9999999', allowance:'77000', active:true }
  ],
  workflowsByCompany: { Acme:{rfi:['a']}, Rival:{rfi:['r']} },
  projectAdmin: 'ccicala@fidevia.com'
});
const cfgFor = (company, role) => filterCsvForCaller('Project Info.json', CFG, false, company, role);

const mine = JSON.parse(cfgFor('Acme','contractor'));
ok('contractor keeps its own contract value', mine.contractors[0].contract === '1000000');
ok('contractor keeps its own allowance',      mine.contractors[0].allowance === '50000');
ok('contractor cannot read a rival contract', !mine.contractors[1].contract);
ok('contractor cannot read a rival allowance',!mine.contractors[1].allowance);
ok('contractor still sees rival name for labels', mine.contractors[1].name === 'Rival');
ok('contractor keeps its own workflow override', !!mine.workflowsByCompany.Acme);
ok('contractor cannot read a rival workflow',    !mine.workflowsByCompany.Rival);
ok('raw config never contains a rival figure',   !cfgFor('Acme','contractor').includes('9999999'));

for (const role of ['architect-engineer','owner']) {
  const c = JSON.parse(cfgFor('', role));
  ok(`${role} keeps every contract value`, c.contractors[1].contract === '9999999');
}
ok('admin config is untouched', filterCsvForCaller('Project Info.json', CFG, true, '', '').includes('9999999'));

const noCompany = cfgFor('', 'contractor');
ok('unassigned contractor gets no contract values',
   !noCompany.includes('1000000') && !noCompany.includes('9999999'));

console.log('Unknown file types');
for (const f of ['secrets.json','notes.txt','Project Info.JSON.bak','']) {
  ok(`${f || '(empty name)'} is withheld`,
     filterCsvForCaller(f, 'anything', false, 'Acme', 'contractor') === '');
}

console.log('Role fallback');
ok('garbage role cannot read the budget',    verdict('Budget Tracker.csv','superuser') === NONE);
ok('garbage role cannot read the audit log', verdict('Audit Log.csv','') === NONE);
ok('garbage role is scoped to one company',  verdict('Payment Applications.csv','wat') === OWN);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
