// When one allowance became a list, two places kept reading the variables that
// had held the single pair — allowId and allowAmt — which no longer existed.
// Reading an undeclared identifier throws, so BOTH change order paths failed at
// the first touch: generating the document, and issuing a new change order.
//
// Every test on those functions passed, because they all read the source rather
// than running it. This one runs them. It is the same lesson the harness itself
// was written for.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

console.log('No function reads a name that no longer exists');
ok(!/\ballowAmt\b/.test(html), 'allowAmt is gone from every path, not just the ones that were rewritten');
ok(!/\ballowId\b/.test(html), 'and so is allowId');

const boot = () => {
  const P = bootPage(); P.run(SEED);
  P.run(`
    IS_ADMIN=true; EXTERNAL=false;
    currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'2000000',active:true,
      allowances:[{id:'A',name:'Materials',amount:'50000'}]}];
    currentProject.config.orgs={'Summit Builders':{category:'Contractor',city:'Ithaca',
      address1:'1 Main St',state:'NY',zip:'14850'}};
    allData.co=[];
    // Everything that would reach Box or Auth0, answered locally.
    CALLS=[];
    findFile=async()=>({id:'log'});
    boxGetText=async()=>'';
    boxUploadText=async(...a)=>{ CALLS.push('uploadText'); return {}; };
    boxUploadBinary=async()=>({entries:[{id:'f1'}]});
    itemFolderId=async()=>'99';
    parseCSV=(t)=>({headers:MODULES.co.headers, rows:[]});
    auditLog=async()=>{}; sendItemNotif=()=>{}; notifyContacts=()=>{};
    resolveMe=async()=>{}; renderAll=()=>{};
    auth0Client={getUser:async()=>({name:'Christopher Cicala',email:'cc@fidevia.com'})};
    showStatus=(id,t,k)=>{ STATUS={id,t,k}; };
    closeNewCo=()=>{ CLOSED=true; }; openCoGen=(i)=>{ OPENED=i; };
    STATUS=null; CLOSED=false; OPENED=null;
  `);
  return P;
};

console.log('Issuing a change order runs to the end');
{
  const P = boot();
  P.run(`
    document.getElementById('nc-company').value='Summit Builders';
    document.getElementById('nc-desc').value='Structural revisions per ASI-004';
    document.getElementById('nc-amount').value='5000';
    document.getElementById('nc-date').value='2026-09-10';
  `);
  let threw='';
  try{ await P.run(`submitNewCo()`); }catch(e){ threw=String(e&&e.message||e); }
  ok(!threw, 'no error reaches the caller'+(threw?(' — '+threw):''));
  const st = JSON.parse(P.run(`JSON.stringify(STATUS)`)||'null');
  ok(st && st.k!=='error', 'and nothing is reported as an error'+(st&&st.k==='error'?(' — '+st.t):''));
  ok(P.run(`(allData.co||[]).length`)===1, 'the change order is on the log');
  ok(P.run(`String((allData.co[0]||{})['Approved Amount'])`)==='5000',
     'carrying the amount that was typed, since no proposal supplied one');
  ok(P.run(`CALLS.indexOf('uploadText')>=0`), 'and the log was written');
}

console.log('With no document, the generator is opened on the new row');
{
  const P = boot();
  P.run(`
    document.getElementById('nc-company').value='Summit Builders';
    document.getElementById('nc-desc').value='Owner-requested addition';
    document.getElementById('nc-amount').value='2500';
  `);
  await P.run(`submitNewCo()`);
  // The hand-off is on a timer so the dialog can close first; the value it will
  // be given is what matters.
  ok(P.run(`(allData.co||[]).length`)===1, 'the row exists to be generated from');
  ok(P.run(`allData.co.length-1`)===0, 'and the index handed over is the one just added');
}

console.log('An allowance line with no allowance is refused, not thrown at');
{
  const P = boot();
  P.run(`
    document.getElementById('nc-company').value='Summit Builders';
    document.getElementById('nc-desc').value='x';
    document.getElementById('nc-amount').value='5000';
    allowRowsRead=()=>[{id:'', amount:1000}];
  `);
  let threw='';
  try{ await P.run(`submitNewCo()`); }catch(e){ threw=String(e&&e.message||e); }
  ok(!threw, 'no error is thrown');
  ok(/Choose which allowance each line comes from/.test(P.run(`String(STATUS&&STATUS.t)`)),
     'it is reported as something to fix');
  ok(P.run(`(allData.co||[]).length`)===0, 'and nothing is filed');
}
{
  const P = boot();
  P.run(`
    document.getElementById('nc-company').value='Summit Builders';
    document.getElementById('nc-desc').value='x';
    document.getElementById('nc-amount').value='1000';
    allowRowsRead=()=>[{id:'A', amount:9000}];
  `);
  await P.run(`submitNewCo()`);
  ok(/come to more than the change order is worth/.test(P.run(`String(STATUS&&STATUS.t)`)),
     'and lines totalling more than the change order are refused too');
  ok(P.run(`(allData.co||[]).length`)===0, 'with nothing filed');
}

console.log('A standalone change order with no amount is still refused');
{
  const P = boot();
  P.run(`
    document.getElementById('nc-company').value='Summit Builders';
    document.getElementById('nc-desc').value='x';
  `);
  await P.run(`submitNewCo()`);
  ok(/Give the change order an amount/.test(P.run(`String(STATUS&&STATUS.t)`)), 'said plainly');
  ok(P.run(`(allData.co||[]).length`)===0, 'and nothing filed');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-corunnable.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
