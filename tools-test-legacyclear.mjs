// Run the real op against a stand-in Box, so the destructive path is exercised
// somewhere it cannot destroy anything.
// Clearing the folder-per-company tree touches production Box, so the
// destructive path is exercised here against a stand-in that records what it
// was asked to do. What matters is not that it deletes, but what it refuses to.
import fs from 'fs';
const src = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const body = src.slice(src.indexOf("if (op === 'docsRemoveLegacy')"), src.indexOf("if (op === 'docsList')"));

// A tiny Box: folders, files, and the two verbs the op uses.
const mk = () => ({
  '1':   [{id:'12',name:'12 - Documents',type:'folder'}],
  '12':  [{id:'s',name:'Schedules',type:'folder'},{id:'t',name:'Testing',type:'folder'},
          {id:'fi',name:'Fidevia Internal',type:'folder'},
          {id:'A',name:'Architect 2',type:'folder'},{id:'B',name:'Summit Builders',type:'folder'},
          {id:'C',name:'Gorilla Construction',type:'folder'},{id:'D',name:'Project Files',type:'folder'}],
  's':   [], 't':  [], 'fi': [],
  'A':   [],                                              // empty
  'B':   [{id:'Bs',name:'Schedules',type:'folder'}],       // only schedules
  'Bs':  [{id:'f1',name:'Aug 2026.pdf',type:'file'}],
  'C':   [{id:'Cx',name:'Old',type:'folder'}],             // a folder of empty folders
  'Cx':  [],
  'D':   [{id:'f2',name:'contract.pdf',type:'file'}]       // real work
});

function makeFetch(box, log){
  return async (url, opts) => {
    const m = String(url).match(/folders\/([^/?]+)\/items/);
    if (m) return { ok:true, json: async()=>({entries: box[m[1]]||[]}) };
    const del = String(url).match(/folders\/([^/?]+)\?recursive=true/);
    if (del && opts && opts.method==='DELETE'){ log.push('DELETE '+del[1]); delete box[del[1]]; return {ok:true,status:204}; }
    const mv = String(url).match(/files\/([^/?]+)$/);
    if (mv && opts && opts.method==='PUT'){
      const b=JSON.parse(opts.body); const id=mv[1];
      // A move takes the file out of where it was. The first version of this
      // stub only logged, which made the op look like it refused to delete a
      // folder it had just emptied.
      for(const k of Object.keys(box)) box[k]=box[k].filter(e=>e.id!==id);
      box[b.parent.id].push({id, name:b.name, type:'file'});
      log.push('MOVE '+id+' -> '+b.parent.id+' as '+b.name); return {ok:true,status:200};
    }
    return {ok:false,status:404};
  };
}

async function run(apply){
  const box = mk(), log = [];
  let out=null;
  const fn = new Function('body','who','H','boxFetch','json','DOCS_PREFIX','DOCS_FOLDERS',
    'return (async()=>{ ' + body.replace(/^\s*if \(op === 'docsRemoveLegacy'\) \{/, '') .replace(/\}\s*$/,'') + ' })();');
  out = await fn({projectId:'1', apply}, {isAdmin:true}, {}, makeFetch(box,log),
    (o)=>o, '12',
    ['Testing','ASIs','Inspections','Punch List','Meeting Minutes','Closeout','Drawings and Specifications','Schedules','Fidevia Internal']);
  return {out, log, left: Object.keys(box)};
}

let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const dry = await run(false);
ok(dry.log.length===0, 'a preview touches nothing at all');
ok(dry.out.dryRun===true, 'and says it was a preview');
ok(dry.out.kept.join()==='Project Files',
   'a folder still holding a file is named as untouchable, not quietly emptied');
ok(dry.out.removed.includes('Architect 2'), 'an empty folder is offered for removal');
ok(dry.out.removed.includes('Gorilla Construction'),
   'so is one holding nothing but empty folders');
ok(dry.out.movedSchedules.length===1, 'a schedule is rescued rather than deleted with its folder');
ok(/Summit Builders - Aug 2026\.pdf/.test(dry.out.movedSchedules[0]),
   'and renamed so the monthly check can still tell whose it is');

const real = await run(true);
ok(real.out.removed.includes('Summit Builders'),
   'once its schedule has moved, the emptied folder goes');
ok(real.out.kept.join()==='Project Files', 'and the one with real work is still left alone');
ok(!real.log.some(a=>/DELETE D/.test(a)), 'nothing deletes the folder holding a file');
ok(real.log.indexOf('MOVE f1 -> s as Summit Builders - Aug 2026.pdf') < real.log.indexOf('DELETE B'),
   'the schedule is moved before its folder is removed, never after');
// The standard folders are not legacy and must never be swept up.
['Schedules','Testing','Fidevia Internal'].forEach(f=>
  ok(!real.out.removed.includes(f) && !real.out.kept.includes(f),
     f+' is a standard folder and is not considered for removal'));

console.log((bad?'FAIL':'ok  '),' tools-test-legacyclear.mjs —',n,'assertions');
process.exit(bad?1:0);
