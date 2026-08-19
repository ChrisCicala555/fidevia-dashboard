// Verifies row-level filtering: what an external contractor is allowed to receive.
// Extracts the pure filter helpers straight out of box-proxy.mjs so the test
// always runs against the real code rather than a copy that can drift.
import { execSync } from 'child_process';
import fs from 'fs';
execSync('node tools-extract-filters.mjs');
const { filterCsvForCaller, fileIdsInRow } = await import('./.filters.tmp.mjs');

let pass=0, fail=0;
const check=(n,c,x='')=>{ (c?pass++:fail++); console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:'')); };

// --- Drawings: internal-only rows must not reach an external caller ---
const docs = [
 'Document Name,Category,Version,Date,Visible To,File ID,File Name',
 'Architectural Set,Drawings,4,2026-08-03,Fidevia + External,111111111,arch.pdf',
 'Internal Budget Backup,Drawings,1,2026-08-03,Fidevia,999999999,secret.pdf',
 'Prime Contract,Contracts,1,2026-06-01,Internal + Prime,222222222,contract.pdf'
].join('\n')+'\n';

const extDocs = filterCsvForCaller('Document Index.csv', docs, false, '');
check('external keeps externally-visible drawing', extDocs.includes('111111111'));
check('external CANNOT see internal-only row', !extDocs.includes('999999999'), '<-- the leak');
check('external keeps Internal + Prime row', extDocs.includes('222222222'));
check('admin sees everything', filterCsvForCaller('Document Index.csv', docs, true, '').includes('999999999'));

// --- Pay apps: company isolation (the Big Bear stress test) ---
const pay = [
 'App #,Contractor,Requested Amount,Attachment File ID,Signed File ID',
 'PA-001,Summit Builders,50000,333333333,444444444',
 'PA-001,Voltage Electric,75000,555555555,'
].join('\n')+'\n';
const summit = filterCsvForCaller('Payment Applications.csv', pay, false, 'Summit Builders');
check('Summit sees own pay app', summit.includes('333333333'));
check('Summit CANNOT see Voltage pay app', !summit.includes('555555555'), '<-- the leak');
const bigbear = filterCsvForCaller('Payment Applications.csv', pay, false, 'Big Bear Construction');
check('company not on project sees no rows', !bigbear.includes('333333333') && !bigbear.includes('555555555'));

// --- File id extraction drives the download guard, so it must be complete ---
const idsA = fileIdsInRow({'Attachment File ID':'333333333','Signed File ID':'444444444'});
check('picks up attachment and signed ids', idsA.includes('333333333') && idsA.includes('444444444'));
const idsB = fileIdsInRow({'File ID':'111111111','Version History':'v1|2026-01-01|888888888;v2|2026-02-01|777777777'});
check('picks up ids inside version history', idsB.includes('888888888') && idsB.includes('777777777'),
      '(missing these would block legitimate old-version downloads)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
