// "This CO is tied to PCO-1... I don't believe there is a CO-1. For numbering,
// wouldn't it make sense for it to be CO-1?"
//
// Yes. Proposals and change orders shared one run: the next number was the
// highest seen across PCO # and CO # together, so raising PCO-GC-001 meant the
// first change order executed on that contract came out CO-GC-002 and CO-GC-001
// never existed. Proposals are numbered as they are raised; change orders as
// they are executed, and CO-001 is routinely the execution of PCO-004.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

const R=(o)=>Object.assign({'PCO #':'','CO #':'','Company':'Summit Builders','Status':'Open',
  'Cost Impact':'1000','Approved Amount':''}, o);
const boot=(cos, retired)=>{
  const P=bootPage(); P.run(SEED);
  P.run(`
    IS_ADMIN=true; EXTERNAL=false;
    currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'2000000',active:true},
                                       {name:'Delaney Mechanical',role:'MC',contract:'500000',active:true}];
    currentProject.config.retiredNumbers=${JSON.stringify(retired||{})};
    allData.co=${JSON.stringify(cos||[])};
    SAVED=null; writeProjectConfig=async(id,c)=>{ SAVED=JSON.parse(JSON.stringify(c)); };
  `);
  return P;
};

console.log('The report');
{
  const P=boot([R({'PCO #':'PCO-GC-001'})]);
  ok(P.run(`nextItemNumber('co','Summit Builders','co')`)==='CO-GC-001',
     'a proposal on the log does not consume a change order number');
  ok(P.run(`nextItemNumber('co','Summit Builders','pco')`)==='PCO-GC-002',
     'while the proposal register carries on from it');
}
{
  // The mirror: change orders must not consume proposal numbers either.
  const P=boot([R({'CO #':'CO-GC-001','Status':'Approved'}),R({'CO #':'CO-GC-002','Status':'Approved'})]);
  ok(P.run(`nextItemNumber('co','Summit Builders','pco')`)==='PCO-GC-001',
     'two change orders leave the proposal register untouched');
  ok(P.run(`nextItemNumber('co','Summit Builders','co')`)==='CO-GC-003', 'and their own run continues');
}
{
  // The two registers run independently, which is the whole point.
  const P=boot([R({'PCO #':'PCO-GC-001'}),R({'PCO #':'PCO-GC-002'}),R({'PCO #':'PCO-GC-003'}),
                R({'CO #':'CO-GC-001','Status':'Approved'})]);
  ok(P.run(`nextItemNumber('co','Summit Builders','pco')`)==='PCO-GC-004', 'four proposals in');
  ok(P.run(`nextItemNumber('co','Summit Builders','co')`)==='CO-GC-002',
     'and the second change order is 002 however many proposals preceded it');
}
{
  // A row carrying both counts once in each register.
  const P=boot([R({'PCO #':'PCO-GC-001','CO #':'CO-GC-001','Status':'Approved'})]);
  ok(P.run(`nextItemNumber('co','Summit Builders','pco')`)==='PCO-GC-002', 'the proposal register moves on');
  ok(P.run(`nextItemNumber('co','Summit Builders','co')`)==='CO-GC-002', 'and so does the change order register');
  ok(P.run(`duplicateItemNumbers('co').length`)===0,
     'and PCO-GC-001 beside CO-GC-001 is not a duplicate — they are different registers');
}
{
  const P=boot([R({'PCO #':'PCO-GC-001'}),R({'PCO #':'PCO-GC-001'})]);
  ok(P.run(`duplicateItemNumbers('co').length`)===1, 'a repeat inside one register still is');
  const P2=boot([R({'CO #':'CO-GC-001','Status':'Approved'}),R({'CO #':'CO-GC-001','Status':'Approved'})]);
  ok(P2.run(`duplicateItemNumbers('co')[0].num`)==='co-gc-001', 'in either register');
}

console.log('Defaults and other modules');
{
  const P=boot([R({'PCO #':'PCO-GC-001'})]);
  ok(P.run(`nextItemNumber('co','Summit Builders')`)==='CO-GC-001',
     'no run named means the change order register — the one an executed CO comes from');
  // The seed carries one of each already, so these prove the other modules
  // still count their own rows rather than proving nothing.
  ok(P.run(`nextItemNumber('rfi','Summit Builders')`)==='RFI-GC-002', 'RFIs are unaffected');
  ok(P.run(`nextItemNumber('sub','Summit Builders')`)==='SUB-GC-002', 'and submittals');
  ok(P.run(`nextItemNumber('co','Delaney Mechanical','co')`)==='CO-MC-001',
     'and each trade still has its own run');
}

console.log('Retirement, per register');
{
  const P=boot([R({'PCO #':'PCO-GC-004','CO #':'CO-GC-002','Status':'Approved'})]);
  ok(await P.run(`retireItemNumber('co', allData.co[0])`)===true, 'deleting a row with both numbers retires');
  P.run(`currentProject.config=SAVED; allData.co=[];`);
  ok(P.run(`currentProject.config.retiredNumbers['pco:GC']`)===4, 'the proposal number');
  ok(P.run(`currentProject.config.retiredNumbers['co:GC']`)===2, 'and the change order number, separately');
  ok(P.run(`nextItemNumber('co','Summit Builders','pco')`)==='PCO-GC-005', 'neither comes back: proposals');
  ok(P.run(`nextItemNumber('co','Summit Builders','co')`)==='CO-GC-003', 'nor change orders');
}
{
  const P=boot([R({'PCO #':'PCO-GC-002'})]);
  await P.run(`retireItemNumber('co', allData.co[0])`);
  P.run(`currentProject.config=SAVED; allData.co=[];`);
  ok(P.run(`currentProject.config.retiredNumbers['pco:GC']`)===2, 'a proposal-only row retires a proposal number');
  ok(P.run(`(currentProject.config.retiredNumbers['co:GC']||0)`)===0,
     'and does not retire a change order number it never held');
  ok(P.run(`nextItemNumber('co','Summit Builders','co')`)==='CO-GC-001',
     'so the change order register still starts at 001');
}
{
  // Marks written while the runs were shared are filed under co:CODE. Both
  // registers must still honour them, or splitting hands back a number that
  // has already been out of the building.
  const P=boot([], {'co:GC':7});
  ok(P.run(`nextItemNumber('co','Summit Builders','co')`)==='CO-GC-008', 'the old shared mark binds change orders');
  ok(P.run(`nextItemNumber('co','Summit Builders','pco')`)==='PCO-GC-008', 'and proposals');
  ok(P.run(`nextItemNumber('co','Delaney Mechanical','pco')`)==='PCO-MC-001', "but only its own trade's");
}

console.log('Raising one of each through the form');
{
  const src=html.slice(html.indexOf("} else if(currentModal==='co'){"));
  const body=src.slice(0, src.indexOf('sendItemNotif'));
  ok(/nextItemNumber\('co', _cc, 'pco'\)/.test(body), 'the New PCO form draws from the proposal register');
  ok(/_appr \? nextItemNumber\('co', _cc, 'co'\) : ''/.test(body),
     'and takes a change order number as well only when it arrived already approved');
  ok(!/replace\(\/\^CO\/,'PCO'\)/.test(body),
     'rather than spelling one number two ways, which is what tied the registers together');
  ok(/'PCO #':_pnum,'CO #':_cnum/.test(body), 'each column gets its own register’s number');
}
ok(/PRE_NUM = nextItemNumber\(key, _pc, key==='co' \? 'pco' : undefined\)/.test(html),
   'and the number reserved before the form is filled is a proposal number');

console.log((bad?'FAIL':'ok  ')+' tools-test-corun.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
