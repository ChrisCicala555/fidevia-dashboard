// Three things Christopher asked for together:
//   "look at what is in Box first before numbering"
//   "the first one should be PA #01, and if it's deleted we still name the
//    next file PA #01"
//   "folder by payment application — PA #01 holds the pencil, the revisions and
//    the final"
//
// The three are one problem. Reusing a number is only safe if Box has let go of
// it, and a per-application folder is what Box is holding.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

const boot=(entries, rows)=>{
  const P=bootPage(); P.run(SEED);
  P.run(`
    IS_ADMIN=true; EXTERNAL=false;
    currentProject.folders.pay_apps='PAFID';
    allData.pay_apps=${JSON.stringify(rows||[])};
    LISTED=[]; MADE=[];
    boxList=async(id)=>{ LISTED.push(id); return ${JSON.stringify(entries||[])}; };
    findOrCreateFolder=async(name,parent)=>{ MADE.push(name+'<'+parent); return 'F:'+name; };
    proxyCall=async(op,a)=>{ if(op==='ensureFolder'){ MADE.push(a.name+'<'+a.parentId); return {id:'F:'+a.name}; } return {}; };
  `);
  return P;
};

console.log('The first one is PA-001');
{
  const P=boot([], []);
  ok(await P.run(`payNextNumber('Summit Builders','PAFID')`)==='PA-001_Summit Builders',
     'an empty log and an empty folder give 001');
}

console.log('A deleted one comes back');
{
  // The row is gone from the log and its folder has moved to the Deleted bin,
  // so the module folder is clear.
  const P=boot([], []);
  ok(await P.run(`payNextNumber('Summit Builders','PAFID')`)==='PA-001_Summit Builders',
     'so 001 is issued again rather than skipping to 002');
  ok(P.run(`NUMBER_REUSED_AFTER_DELETE.pay_apps`)===true, 'pay app numbers are reused by design');
  ok(await P.run(`retireItemNumber('pay_apps',{'App #':'PA-001_Summit Builders','Contractor':'Summit Builders'})`)===false,
     'and deleting one retires nothing');
}
{
  // Every other module still retires, because an RFI number has been seen
  // outside the dashboard under that number.
  const P=boot([], []);
  P.run(`writeProjectConfig=async(id,c)=>{ SAVED=c; }; SAVED=null; allData.rfi=[];`);
  ok(await P.run(`retireItemNumber('rfi',{'RFI #':'RFI-GC-004','Company':'Summit Builders'})`)===true,
     'an RFI number is still retired on delete');
}

console.log('A mark left over from the old rule does not hold it back');
{
  // The bug Christopher saw: PA-004 on a log holding none. Stopping the writing
  // of retirement marks was not enough — the ones written earlier, under the
  // rule that retired pay app numbers, were still being read.
  const P=boot([], []);
  P.run(`currentProject.config.retiredNumbers={'pay_apps:summit builders':3};`);
  ok(P.run(`nextItemNumber('pay_apps','Summit Builders')`)==='PA-001_Summit Builders',
     'an empty log gives 001 even where a stale mark says three were issued');
  ok(await P.run(`payNextNumber('Summit Builders','PAFID')`)==='PA-001_Summit Builders',
     'and so does the number actually handed out');
}
{
  const P=boot([], [{'App #':'PA-002_Summit Builders','Contractor':'Summit Builders','Company':'Summit Builders'}]);
  P.run(`currentProject.config.retiredNumbers={'pay_apps:summit builders':9};`);
  ok(P.run(`nextItemNumber('pay_apps','Summit Builders')`)==='PA-003_Summit Builders',
     'the log decides, not the mark — 003 rather than 010');
}
{
  // Every other module still honours its marks, which is the whole point of
  // them: an RFI number has been seen outside under that number.
  const P=boot([], []);
  P.run(`currentProject.config.retiredNumbers={'rfi:GC':4}; allData.rfi=[];
         currentProject.config.contractors=[{name:'Summit Builders',role:'GC',active:true}];`);
  ok(P.run(`nextItemNumber('rfi','Summit Builders')`)==='RFI-GC-005',
     'a retired RFI number is still not reissued');
}

console.log('Unless Box is still holding it');
{
  // A delete that failed halfway leaves the folder in the module root. Handing
  // the number out again would file the new application into the old one.
  const P=boot([{type:'folder', name:'Pay App #PA-001_Summit Builders'}], []);
  ok(await P.run(`payNumberFloor('Summit Builders','PAFID')`)===1, 'the leftover folder sets a floor');
  ok(await P.run(`payNextNumber('Summit Builders','PAFID')`)==='PA-002_Summit Builders',
     'so the next number clears it rather than landing in it');
}
{
  // Listed highest first, so taking the last one seen would give the wrong floor.
  const P=boot([{type:'folder', name:'Pay App #PA-007_Summit Builders'},
                {type:'folder', name:'Pay App #PA-001_Summit Builders'}], []);
  ok(await P.run(`payNumberFloor('Summit Builders','PAFID')`)===7,
     'the highest leftover is the floor, whatever order Box lists them in');
  ok(await P.run(`payNextNumber('Summit Builders','PAFID')`)==='PA-008_Summit Builders',
     'and the next number clears it');
}
{
  // Only item folders count. A month folder or a stray folder with digits in
  // its name is not an application and must not push the numbering.
  const P=boot([{type:'folder', name:'2026-09 September'},
                {type:'folder', name:'PA-014_Summit Builders'},
                {type:'folder', name:'Pay App #PA-002_Summit Builders'}], []);
  const seen=await P.run(`numbersInBox('pay_apps','PAFID')`);
  ok(seen.join()==='PA-002_Summit Builders',
     'only folders named as applications are read — got '+seen.join(' | '));
  ok(await P.run(`payNumberFloor('Summit Builders','PAFID')`)===2,
     'so a folder that merely contains a number sets no floor');
}
{
  // The log ahead of Box: both are consulted, and the higher wins.
  const P=boot([{type:'folder', name:'Pay App #PA-002_Summit Builders'}],
               [{'App #':'PA-004_Summit Builders','Contractor':'Summit Builders'}]);
  ok(await P.run(`payNumberFloor('Summit Builders','PAFID')`)===2, 'Box holds a lower one');
  ok(await P.run(`payNextNumber('Summit Builders','PAFID')`)==='PA-005_Summit Builders',
     'and the log carries the day rather than the number dropping back to 003');
}
{
  // Another firm's folders must not push this contractor's numbering along.
  const P=boot([{type:'folder', name:'Pay App #PA-009_Delaney Mechanical'}], []);
  ok(await P.run(`payNumberFloor('Summit Builders','PAFID')`)===0,
     "another contractor's leftovers are not this one's floor");
  ok(await P.run(`payNextNumber('Summit Builders','PAFID')`)==='PA-001_Summit Builders',
     'so this one still starts at 001');
}
{
  const P=boot([{type:'file', name:'Pay App #PA-005_Summit Builders'},
                {type:'folder', name:'Summit Builders'},
                {type:'folder', name:'Deleted Payment Applications'}], []);
  ok(await P.run(`payNumberFloor('Summit Builders','PAFID')`)===0,
     'a file is not an item folder, and neither is the company folder or the bin');
}
{
  const P=boot([], [{'App #':'PA-004_Summit Builders','Contractor':'Summit Builders'}]);
  ok(await P.run(`payNextNumber('Summit Builders','PAFID')`)==='PA-005_Summit Builders',
     'the log still drives the number when it is ahead of Box');
}
{
  // Box unreachable must not stop somebody filing an application.
  const P=boot([], []);
  P.run(`boxList=async()=>{ throw new Error('Box down'); };`);
  ok(await P.run(`payNumberFloor('Summit Builders','PAFID')`)===0, 'a failed listing is no floor');
  ok(await P.run(`payNextNumber('Summit Builders','PAFID')`)==='PA-001_Summit Builders',
     'and the number still comes from the log');
}

console.log('One folder per application');
{
  const P=boot([], []);
  const id=await P.run(`payAppFolder({'App #':'PA-001_Summit Builders','Contractor':'Summit Builders'})`);
  const made=P.run(`MADE`);
  ok(made[0]==='Summit Builders<PAFID', 'the company folder comes first — got '+made[0]);
  ok(made[1]==='Pay App #PA-001_Summit Builders<F:Summit Builders',
     'and the application folder inside it — got '+made[1]);
  ok(String(id).indexOf('Pay App #PA-001')>=0, 'and that is where the documents go');
}
{
  const P=boot([], []);
  const a=await P.run(`payAppFolder({'App #':'PA-001_X','Contractor':'X'})`);
  const b=await P.run(`payAppFolder({'App #':'PA-001_X','Contractor':'X'})`);
  ok(a===b, 'the same application resolves to the same folder every time — pencil, revision and final together');
}
{
  const P=boot([], []);
  const id=await P.run(`payAppFolder({'Contractor':'Summit Builders'})`);
  ok(String(id)==='F:Summit Builders',
     'an application with no number yet stops at the company folder rather than making one called nothing');
  const id2=await P.run(`payAppFolder({})`);
  ok(id2==='PAFID', 'and one with neither falls back to the module folder');
}

console.log('Every path that files one agrees');
{
  ok(!/itemFolderId\('pay_apps',\s*fid/.test(html),
     'no path builds a pay app folder straight under the module any more');
  ok((html.match(/await payAppFolder\(/g)||[]).length>=2,
     'the final submission and the signed copy both go through the one helper');
  ok(/key==='pay_apps' && _num && uploadFolderId/.test(html),
     'and the contractor’s upload files into the application folder rather than loose in the company one');
  const u=html.slice(html.indexOf("if(key==='pay_apps' && _num && uploadFolderId)"));
  ok(/itemFolderId\(key, uploadFolderId, _num\)/.test(u.slice(0,300)),
     'under the company folder, which is where that contractor’s billing already lives');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-paynumfolder.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
