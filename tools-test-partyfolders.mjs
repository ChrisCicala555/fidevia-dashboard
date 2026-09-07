// Every party's folder starts with a standard set.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/const PARTY_FOLDERS=\['Schedules'\]/.test(html), 'the set starts with Schedules');
ok(/Add to this list as real use asks for it/.test(html), 'and is meant to grow from use');
ok(/function docsCreatePartyFolders/.test(html), 'they can be created on demand');
{
  const cf = html.split('async function docsCreatePartyFolders')[1].split('// The precon structure')[0];
  ok(/missing=PARTY_FOLDERS\.filter/.test(cf), 'only the missing ones are created');
  ok(/already here/.test(cf), 'and it says so when there are none');
  ok(/confirm\(/.test(cf), 'listing them before creating');
  ok(/missing\.length===1\?'this folder':'these folders'/.test(cf), 'reading correctly for one');
}

// seeded when the party folder is made
{
  const sp = html.split('async function docsSetupParties')[1].split('// What every party')[0];
  ok(/for\(const sub of PARTY_FOLDERS\)/.test(sp), 'a new party folder is seeded');
  ok(/parentId:d\.id, name:sub/.test(sp), 'inside the folder just created');
  ok(/finds a structure rather than an empty room/.test(sp), 'and why');
  ok(/if\(d && d\.id\)/.test(sp), 'only when the folder was actually created');
}

// the offer, and who gets it
{
  // display='none' appears in an earlier branch too, so anchor on the block.
  const nt = html.split('const inFidevia = ')[1].split('const folders=')[0];
  ok(/const inFidevia = DOCS_PATH\.length===1/.test(html), "Fidevia's own folder is told apart");
  ok(/IS_ADMIN && !viewingAsExternal\(\) && inFidevia && !hasAll\(PRECON_FOLDERS\)/.test(nt),
     'precon stays Fidevia only, in their folder');
  ok(/else if\(DOCS_PATH\.length===1 && !inFidevia && !hasAll\(PARTY_FOLDERS\)\)/.test(nt),
     'the standard set is offered in any other party folder');
  ok(!/IS_ADMIN/.test(nt.split('else if(DOCS_PATH.length===1 && !inFidevia')[1]||''),
     'and to the contractor standing in it, not only to Fidevia');
  ok(/You can add your own alongside them/.test(nt), 'without implying the list is a cage');
  ok(/DOCS_PATH\.length===1/.test(nt), 'only one level down, not in every subfolder');
}

// behaviour
{
  const PARTY=['Schedules'];
  const missing=(entries)=>{
    const have=new Set(entries.map(e=>e.toLowerCase()));
    return PARTY.filter(x=>!have.has(x.toLowerCase()));
  };
  ok(missing([]).length===1, 'an empty folder is missing all of them');
  ok(missing(['Schedules']).length===0, 'a folder that has it is missing none');
  ok(missing(['schedules']).length===0, 'matching ignores case');
  ok(missing(['Photos','Schedules']).length===0, 'extra folders of their own do not matter');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-partyfolders.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
