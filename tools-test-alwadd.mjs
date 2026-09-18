// "The add allowances button isn't working for some reason."
//
// It was doing nothing, on every contractor. The boxes are keyed on the
// CONTRACT - company and trade - because a firm holding the mechanical and the
// plumbing primes has two of them. The button handed over the company alone,
// the lookup found no element, and the function returned without a word.
//
// The same half-done rename was in three more places, and those were worse:
// alwGather returns its results keyed by contract, and the wizard read them
// back by company. So a draft saved no allowances, and the create path built a
// project carrying none of what had been typed in.
//
// "Add allowances for Cook is not working." The second round of the same bug,
// and narrower: the button carried the company name and a URI-encoded copy of
// the contract line through an HTML attribute, and encodeURIComponent leaves an
// apostrophe alone. "Cook's Service Company" closed the argument early, the
// browser discarded the handler as unparseable, and the button did nothing \u2014
// for that firm only, with nothing in the console to say so. It now carries a
// position and looks the contract up on this side.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);

// One firm with two primes, which is the case that forced the contract key.
const LINES=[{name:'LA Building Contractors', role:'GC'},
             {name:'Garden Spot Mechanical', role:'MC'},
             {name:'Garden Spot Mechanical', role:'PC'},
             {name:"Cook's Service Company", role:'EC'}];
const seed=()=>P.run(`alwRenderAll('np','np-allowances',${JSON.stringify(LINES)}); 1;`);
const view=()=>P.run("document.getElementById('np-allowances').innerHTML");
const rowsIn=(key)=>P.run(`(document.getElementById('np-alw-'+${JSON.stringify(key)})||{innerHTML:''}).innerHTML.split('alw-row').length-1`);
const keyOf=(i)=>P.run(`alwLineKey(${JSON.stringify(LINES[i])})`);

console.log('Each contract has boxes of its own');
seed();
{
  const keys=LINES.map((_,i)=>keyOf(i));
  ok(new Set(keys).size===4, 'four contracts, four keys — the two Garden Spot primes do not collide');
  keys.forEach((k,i)=>ok(view().indexOf('id="np-alw-'+k+'"')>=0,
    'the boxes for '+LINES[i].name+' '+LINES[i].role+' are on the page'));
}

console.log('The button adds a row to the right contract');
{
  // The keys the buttons actually carry, in order.
  const carried=[...view().matchAll(/alwAdd\('np',(\d+)\)/g)].map(m=>Number(m[1]));
  ok(carried.length===4, 'a button for each contract');
  ok(carried.join()==='0,1,2,3', 'each addressing its own position in the list on screen');
  // A position is only worth anything if it resolves to the right contract.
  const resolved=carried.map(i=>P.run(`alwLineKey(ALW_LINES['np'][${i}])`));
  ok(resolved.join()===LINES.map((_,i)=>keyOf(i)).join(),
     'and each position resolves to its own contract key, not the company\u2019s');
  ok(resolved[1]!==resolved[2],
     'so the two Garden Spot primes resolve differently \u2014 the whole reason for the key');
  ok(resolved.every(k=>view().indexOf('id="np-alw-'+k+'"')>=0),
     'and every key names a container that is actually on the page');
}
P.run(`alwAdd('np',1)`);
ok(rowsIn(keyOf(1))===1, 'a row appears under the mechanical contract');
ok(rowsIn(keyOf(2))===0, 'and not under the plumbing one');
P.run(`alwAdd('np',2)`);
ok(rowsIn(keyOf(2))===1, 'the plumbing contract takes its own');
ok(rowsIn(keyOf(1))===1, 'without touching the mechanical');
P.run(`alwAdd('np',0)`);
ok(rowsIn(keyOf(0))===1, 'a single-prime contractor works the same way');
P.run(`alwAdd('np',3)`);
ok(rowsIn(keyOf(3))===1, "and so does the firm with an apostrophe in its name");
{
  const before=LINES.map((_,i)=>rowsIn(keyOf(i))).join();
  let threw=false; try{ P.run(`alwAdd('np',99)`); }catch(e){ threw=true; }
  ok(!threw, 'a position with no contract behind it does not throw');
  ok(LINES.map((_,i)=>rowsIn(keyOf(i))).join()===before, 'and adds a row to nobody');
}

console.log('Rows keep piling into the one asked for');
P.run(`alwAdd('np',0); alwAdd('np',0)`);
ok(rowsIn(keyOf(0))===3, 'three under the GC');
ok(rowsIn(keyOf(1))===1, 'and the other contract is still on one');
// The letters A, B, C are worked out from querySelectorAll('.alw-row'), which
// this harness cannot answer — innerHTML here is a string, not a node tree.
// alwGather reads the same way, so what is typed in cannot be read back here
// either. Both are covered by the wiring assertions below instead.

console.log("A quote in the name does not break the button");
{
  // The failure was invisible: the markup looked right, and the handler was
  // thrown away by the parser. So the attribute is parsed here, as JavaScript.
  const attrs=[...view().matchAll(/onclick="(alwAdd[^"]*)"/g)].map(m=>m[1]);
  ok(attrs.length===4, 'four handlers to check');
  attrs.forEach((a,i)=>{
    // The browser decodes entities in the attribute before running it.
    const js=a.replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&');
    let parsed=true; try{ new Function(js); }catch(e){ parsed=false; }
    ok(parsed, 'the handler for '+LINES[i].name+' is valid JavaScript');
  });
  const cook=attrs[3]||'';
  ok(!/Cook/.test(cook), "the company name is not written into the attribute at all");
  ok(/^alwAdd\('np',3\)$/.test(cook), 'it carries a prefix and a position, and nothing that needs escaping');
}

console.log('And it survives the save and the build');
{
  // Every reader of alwGather keys on the contract. Reading back by company
  // returned nothing, so a draft and a new project both carried no allowances.
  const readers=html.split('alwGather(').slice(1)
    .map(x=>x.slice(0, 400))
    .filter(x=>/allowances:/.test(x));
  ok(readers.length>=3, 'there are several places that read them back ('+readers.length+')');
  const byName=readers.filter(x=>/\[c\.name\]/.test(x));
  ok(byName.length===0, 'and none of them looks them up by company name');
  ok(readers.filter(x=>/alwLineKey\(/.test(x)).length===readers.length,
     'they all look them up by contract');
}
ok(!/held\[c\.name\]/.test(html), 'including the one that redraws the step after a change');
{
  const save=html.split('async function saveAllowances')[1].slice(0,900);
  ok(/const k=alwLineKey\(rec\)/.test(save),
     'and Settings writes each set back against the contract it was typed under');
  ok(!/got\[rec\.name\]|got\[c\.name\]/.test(save), 'never against the company');
}

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
