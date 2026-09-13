// "I don't see Ithaca Admin here... so if the address wasn't close to a
// previously known entity, how would I change/add the address?"
//
// The organizations list was built only from companies people are recorded
// under. An owner named on a project that nobody on the dashboard works for
// therefore had no record, nowhere to keep an address, and no way to make one
// — while the change order that needs that address refused to generate. Two
// ways in: the name is filed when the project names it, and a button here.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

let JSDOM;
try{ ({ JSDOM } = await import('jsdom')); }
catch(e){ console.log('SKIP tools-test-orgadd.mjs — jsdom not installed (npm i)'); process.exit(0); }

const dom = new JSDOM(`<!doctype html><body>
  <div id="org-addform" style="display:none"></div>
  <input id="org-add-name"><select id="org-add-cat"><option value=""></option><option value="owner">Owner</option></select>
  <p id="org-add-note"></p><span id="org-add-status"></span><button id="org-add-btn"></button>
  </body>`);
const { window } = dom;
// `async function foo` starts five characters before `function foo`, and
// slicing from the wrong one produces a body with a top-level await in it.
const grab = name => {
  let i=html.indexOf('function '+name+'(');
  if(html.slice(i-6,i)==='async ') i-=6;
  return html.slice(i, html.indexOf('\n}', i)+2);
};
const parts = ['orgAddOpen','orgAddClose','orgAddNote','orgAddSubmit','orgEnsure','orgNameScore','orgSuggestFor']
  .map(grab).join('\n');

const ORGS_SEED = [
  {key:'summit builders', name:'Summit Builders', category:'contractor', line1:'123 W Church', city:'Lititz', state:'PA', zip:'17543', complete:true},
  {key:'ithaca housing project', name:'Ithaca Housing Project', category:'owner', line1:'953 Danby', city:'Ithaca', state:'NY', zip:'14850', complete:true}
];

function mk(){
  const calls=[]; const opened=[];
  let ORGS=ORGS_SEED.slice();
  const PROJECT_ORGS={}; ORGS.forEach(o=>PROJECT_ORGS[o.key]=o);
  const env = new window.Function(
    'document','ORGS','PROJECT_ORGS','proxyCall','loadOrgs','openOrg','showStatus','esc','orgKeyOf','ctx', `
    ${parts}
    return {orgAddOpen,orgAddClose,orgAddNote,orgAddSubmit,orgEnsure,
            get ORGS(){ return ORGS; }};
  `);
  const orgKeyOf = x => String(x||'').trim().toLowerCase().replace(/[.,]/g,'').replace(/\s+/g,' ');
  const api = env(window.document, ORGS, PROJECT_ORGS,
    async (op,args)=>{ calls.push({op,args}); if(op==='saveCompany'){ ORGS.push({key:orgKeyOf(args.name), name:args.name, category:args.category||'', complete:false}); } return {}; },
    async ()=>{},
    k=>opened.push(k),
    ()=>{},
    s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
    orgKeyOf, {});
  return {api, calls, opened, ORGS, PROJECT_ORGS, orgKeyOf};
}

const name=window.document.getElementById('org-add-name');
const note=window.document.getElementById('org-add-note');
const form=window.document.getElementById('org-addform');

// ── the form ──
let t=mk();
name.value='left over from last time'; form.style.display='none';
t.api.orgAddOpen();
ok(form.style.display!=='none', 'the add form opens');
ok(name.value==='', 'empty, not holding what was typed and abandoned last time');
t.api.orgAddClose();
ok(form.style.display==='none', 'and closes again');

// ── a name already on file must not become a second record ──
t=mk();
name.value='Summit Builders'; t.api.orgAddNote();
ok(/already here/.test(note.innerHTML), 'a name already on file says so before anything is created');
await t.api.orgAddSubmit();
ok(t.calls.length===0, 'and adding it creates nothing');
ok(t.opened.join()==='summit builders', 'it opens the record that exists instead');

t=mk();
name.value='summit  builders.'; t.api.orgAddNote();
ok(/already here/.test(note.innerHTML), 'matched past spacing and punctuation, as the server keys it');

// ── a near miss is a warning, not a refusal ──
t=mk();
name.value='Ithaca Admin'; t.api.orgAddNote();
ok(/Ithaca Housing Project/.test(note.innerHTML), 'a close existing name is named');
ok(/different firm/.test(note.innerHTML), 'as a caution, since it may genuinely be a different firm');
await t.api.orgAddSubmit();
ok(t.calls.length===1 && t.calls[0].op==='saveCompany', 'and it can still be added — the caution does not block it');

// ── the point of the whole thing ──
t=mk();
name.value='Ithaca Admin'; window.document.getElementById('org-add-cat').value='owner';
await t.api.orgAddSubmit();
ok(t.calls[0].args.name==='Ithaca Admin', 'the typed name is what gets filed');
ok(t.calls[0].args.category==='owner', 'with the category chosen');
ok(t.opened.join()==='ithaca admin', 'and the new record opens straight away, since the address is the point');
ok(form.style.display==='none', 'the add form closes behind it');

t=mk();
name.value='   '; await t.api.orgAddSubmit();
ok(t.calls.length===0, 'a blank name files nothing');
name.value=''; t.api.orgAddNote();
ok(note.innerHTML==='', 'and says nothing about it until something is typed');

// ── orgEnsure: only ever creates ──
t=mk();
ok(await t.api.orgEnsure('Summit Builders','contractor')===false, 'a company already on file is left alone');
ok(t.calls.length===0, 'with no write at all — an address already entered must not be blanked');
ok(await t.api.orgEnsure('Ithaca Admin','owner')===true, 'one that is missing is created');
ok(t.calls[0].args.category==='owner', 'under the category the caller knows it by');
ok(await t.api.orgEnsure('','owner')===false, 'and an empty name is not a company');
ok(await t.api.orgEnsure('  ','owner')===false, 'nor is a space');

// ── the wiring ──
ok(/onclick="orgAddOpen\(\)"/.test(html), 'the directory has a button that opens the form');
ok(/if\(await orgEnsure\(c\.owner,'owner'\)\)/.test(html),
   'saving project settings files the owner, so a name the dashboard uses is never absent');
ok(html.indexOf("await orgEnsure(c.owner,'owner')") > html.indexOf('await writeProjectConfig(currentProject.folderId, c);'),
   'after the project itself is saved, not instead of it');
ok(/async function coGenAddOwnerOrg/.test(html) && /openOrg\(made\.key\)/.test(html),
   'the handler creates the record and opens it, rather than naming a tab to go find');
{
  // The blocked generator's own checklist, run. Asserting the function merely
  // exists somewhere in the file would pass with the link pointing anywhere.
  const esc=x=>String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const orgs=ORGS_SEED.slice();
  const readiness=(owner)=>new window.Function('currentProject','orgRecordFor','ORG_ADDR_FIELDS','orgSuggestFor','esc',
    `${grab('coReadinessHTML')}\nreturn coReadinessHTML('Summit Builders');`)(
      {config:{owner}},
      nm=>orgs.find(o=>o.key===String(nm||'').trim().toLowerCase())||null,
      [['line1','a street address'],['city','a city'],['state','a state'],['zip','a ZIP code']],
      nm=>orgs.filter(o=>/ithaca/i.test(nm) && /ithaca/i.test(o.name)),
      esc);

  const far=readiness('Beach Bums R Us');
  ok(/coGenAddOwnerOrg\(/.test(far), 'an owner nothing resembles is offered as something to add');
  ok(far.indexOf('Beach Bums R Us')>=0, 'by name');
  ok(/Not on file anywhere/.test(far), 'said plainly, since there is nothing to conform it to');
  ok(/enter its address/.test(far), 'and the address is named as the reason');
  ok(!/coGenAdoptOwner\(/.test(far), 'with no "did you mean" offered, because nothing is close');

  const near=readiness('Ithaca Admin');
  ok(/coGenAdoptOwner\(/.test(near), 'a close name still offers the record it probably meant first');
  ok(/coGenAddOwnerOrg\(/.test(near), 'and adding it outright as well, since it may be a genuinely new firm');
  ok(near.indexOf('coGenAdoptOwner(')<near.indexOf('coGenAddOwnerOrg('), 'in that order');

  const fine=readiness('Ithaca Housing Project');
  ok(!/coGenAddOwnerOrg\(/.test(fine), 'an owner already on file is offered neither');
  ok(!/coGenAdoptOwner\(/.test(fine), 'and not asked to conform to itself');
}
{
  // Typing the address has to reach the checklist that asked for it.
  const save=html.slice(html.indexOf('async function saveOrg()'));
  const end=save.indexOf('\n}');
  ok(/await loadProjectOrgs\(\)/.test(save.slice(0,end)), 'saving an address refreshes what the generator reads');
  ok(/openCoGen\(COGEN_IDX\)/.test(save.slice(0,end)), 'and redraws the generator underneath it');
  ok(/bk\.classList\.contains\('open'\)/.test(save.slice(0,end)), 'only when it is actually open');
}
ok(!/Every company that appears on someone&rsquo;s profile shows up here/.test(html),
   'the description no longer claims profiles are the only way in');

console.log((bad?'FAIL':'ok  ')+' tools-test-orgadd.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
