// A project's owner and the directory's record for the same body will drift:
// somebody types "Ithaca Admin" while the directory holds "Ithaca Housing
// Project". Reporting that as an error and sending the reader to a settings
// field two screens away is how it stays broken. The dashboard knows both names
// — it can offer the fix where the problem appears.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);
R(`PROJECT_ORGS={
 'ithaca housing project':{name:'Ithaca Housing Project',line1:'953 Danby Road',city:'Ithaca',state:'NY',zip:'14850',complete:true},
 'lincoln school district':{name:'Lincoln School District',line1:'123 Lincoln St',city:'Lititz',state:'PA',zip:'17543',complete:true},
 'summit builders':{name:'Summit Builders',line1:'1 Main',city:'Lititz',state:'PA',zip:'17543',complete:true},
 'gorilla construction':{name:'Gorilla Construction',line1:'113 Clarenton',city:'Mooresville',state:'NC',zip:'17543',complete:true}};`);
const sug = v => JSON.parse(R(`JSON.stringify(orgSuggestFor(${JSON.stringify(v)}).map(o=>o.name))`));

console.log('Finding the name that was meant');
ok(sug('Ithaca Admin').join()==='Ithaca Housing Project',
   'the case that started this: a shared word carries it');
ok(sug('ithaca').join()==='Ithaca Housing Project', 'case and length do not matter');
ok(sug('Sumit Builders').join()==='Summit Builders', 'a misspelling of a two-word name');
ok(sug('Gorila Construction').join()==='Gorilla Construction', 'and of a longer one');
ok(sug('Lincoln').join()==='Lincoln School District', 'a short name inside a long one');

console.log('And not offering nonsense');
ok(sug('Totally Unrelated Co').length===0, 'nothing in common, nothing offered');
ok(sug('Ithaca Housing Project').length===0,
   'a name that already matches needs no suggestion — there is nothing to fix');
ok(sug('Admin').length===0,
   'a word that carries no identity on its own does not match everything that contains it');
ok(sug('').length===0 && sug('   ').length===0, 'and an empty name suggests nothing');
{
  // Words like "the", "inc" and "group" appear across half a directory. Left in,
  // every organization would be a near-miss for every other.
  R(`PROJECT_ORGS['acme group inc']={name:'Acme Group Inc',line1:'1',city:'a',state:'b',zip:'1',complete:true};
     PROJECT_ORGS['beta group inc']={name:'Beta Group Inc',line1:'1',city:'a',state:'b',zip:'1',complete:true};`);
  ok(sug('Gamma Group Inc').length===0, 'shared filler words alone are not a match');
  ok(sug('Acme Holdings').join()==='Acme Group Inc', 'while the word carrying the identity still is');
  R(`delete PROJECT_ORGS['acme group inc']; delete PROJECT_ORGS['beta group inc'];`);
}
ok(R(`orgNameScore('Ithaca Housing Project','Ithaca Housing Project')`)===1, 'an exact name scores full');
ok(R(`orgNameScore('','x')`)===0 && R(`orgNameScore('x','')`)===0, 'and an absent one scores nothing');
// A name made only of words that carry no identity has nothing left to compare
// once they are dropped, so it needs answering before that happens.
ok(R(`orgNameScore('The Group','The Group')`)===1,
   'including one built entirely from filler words, which otherwise compares to nothing and scores zero');
{
  // A single-word organization, which is the only shape the character
  // comparison applies to — a two-word name matches on the shared word instead.
  R(`PROJECT_ORGS['gorilla']={name:'Gorilla',line1:'1',city:'a',state:'b',zip:'1',complete:true};`);
  ok(sug('Gorila').join()==='Gorilla',
     'a misspelled one-word name is caught by comparing characters, which nothing else here would do');
  ok(sug('Gorillazzzz').length===0,
     'while a weak partial match is left alone — 60% of a prefix is a coincidence, not a near miss');
  R(`delete PROJECT_ORGS['gorilla'];`);
}

console.log('Offered on the owner field');
{
  R(`document.getElementById('ps-owner').value='Ithaca Admin'; ownerMatchNote('ps-owner','ps-owner-note');`);
  const t=R(`document.getElementById('ps-owner-note').innerHTML`);
  ok(/No organization called <strong>Ithaca Admin<\/strong> is on file/.test(t), 'the miss is still reported');
  ok(/Did you mean/.test(t) && /Ithaca Housing Project/.test(t), 'with the likely record named');
  ok(/onclick="ownerAdopt\(/.test(t), 'and a way to take it in one click');
{
  // A firm called O'Brien or "The Bay" Co has to survive being written into a
  // double-quoted attribute. esc turns JSON's quotes into entities the parser
  // hands back, and the apostrophe with them.
  R(`PROJECT_ORGS["o'brien sons"]={name:"O'Brien Sons",line1:'1',city:'a',state:'b',zip:'1',complete:true};
     document.getElementById('ps-owner').value="OBrien Sons"; ownerMatchNote('ps-owner','ps-owner-note');`);
  const h=R(`document.getElementById('ps-owner-note').innerHTML`);
  const handler=(h.match(/onclick="[^"]*"/)||[''])[0];
  ok(/&quot;O&#39;Brien Sons&quot;/.test(handler),
     'a name with an apostrophe is escaped into the handler rather than breaking it');
  ok((handler.match(/"/g)||[]).length===2,
     'with the attribute still holding exactly its own two quotes');
  R(`delete PROJECT_ORGS["o'brien sons"];
     document.getElementById('ps-owner').value='Ithaca Admin'; ownerMatchNote('ps-owner','ps-owner-note');`);
}
  R(`document.getElementById('ps-owner').value='Totally Unrelated Co'; ownerMatchNote('ps-owner','ps-owner-note');`);
  ok(!/Did you mean/.test(R(`document.getElementById('ps-owner-note').innerHTML`)),
     'and nothing offered when there is no near miss, rather than a wrong guess');
}
{
  R(`document.getElementById('ps-owner').value='Ithaca Admin'; ownerAdopt('Ithaca Housing Project','ps-owner','ps-owner-note');`);
  ok(R(`document.getElementById('ps-owner').value`)==='Ithaca Housing Project',
     'adopting puts the organization’s own name in the field, keeping the good record and dropping the typed one');
  ok(/Matches <strong>Ithaca Housing Project<\/strong>/.test(R(`document.getElementById('ps-owner-note').innerHTML`)),
     'and the note updates to say it now matches');
}

console.log('Offered again where it actually blocks you');
{
  R(`currentProject.config.owner='Ithaca Admin';`);
  const m=JSON.parse(R(`JSON.stringify(coDocumentReadiness('Summit Builders').missing)`));
  ok(m.some(x=>/did you mean Ithaca Housing Project\?/.test(x)),
     'the generator’s reason names the likely record rather than only the gap');
  const h=R(`coReadinessHTML('Summit Builders')`);
  ok(/onclick="coGenAdoptOwner\(/.test(h), 'and the checklist offers to adopt it from there');
  ok(/Ithaca Housing Project/.test(h), 'by name');
}
{
  const f = html.split('async function coGenAdoptOwner(name){')[1].split('\n}')[0];
  ok(/await writeProjectConfig\(currentProject\.folderId, currentProject\.config\)/.test(f),
     'adopting from the generator SAVES the project, rather than leaving it in a field somebody must remember to save');
  ok(/currentProject\.config\.owner=before;/.test(f),
     'and puts the old value back if the save fails, so a failed write does not leave the page disagreeing with Box');
  ok(/if\(COGEN_IDX>=0\) openCoGen\(COGEN_IDX\)/.test(f),
     'then redraws the generator, which is where the reader is looking');
  ok(/await loadProjectOrgs\(\)/.test(f), 'after refreshing the organizations the checklist reads from');
}

console.log('The merge tool is still the answer for two real records');
ok(/id="og-merge"/.test(html) && /Conform to/.test(html),
   'two organizations that are genuinely one firm are still merged, not renamed');
ok(!/id="og-name"/.test(html),
   'and an organization still cannot be renamed here, since the name comes from the profiles that mention it');

console.log((bad?'FAIL ':'ok   ')+'tools-test-orgconform.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
