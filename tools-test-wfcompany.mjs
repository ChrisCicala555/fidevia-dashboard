// "Assign to should be by company really — so when we assign moore their entire
// team is notified when something is submitted."
//
// The code already leaned this way: review permission has been matched on the
// firm for a while, because one person's absence stopped a whole office. The
// assignment and the notify list never caught up — a step still resolved to
// exactly one address, so Bob Potter's inbox stood for all of Moore.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`allData.contacts=[
  {Name:'Bob Potter', Company:'Moore Engineering', Role:'Mech Engineer', Email:'bob@moore.com',
   'Notify - CO':'Yes', 'Notify - RFI':'Yes'},
  {Name:'Blake Strickler', Company:'Moore Engineering', Role:'Electrical Engineer', Email:'blake@moore.com',
   'Notify - CO':'Yes', 'Notify - RFI':''},
  {Name:'Quiet Quentin', Company:'Moore Engineering', Role:'Draftsman', Email:'quentin@moore.com',
   'Notify - CO':'', 'Notify - RFI':''},
  {Name:'Amanda Cook', Company:"Cook's Service Company", Role:'Asst PC', Email:'amanda@cooks.com',
   'Notify - CO':'Yes'}];`);
const mails=(st,field)=>P.run(`wfStepEmails(${JSON.stringify(st)}${field?','+JSON.stringify(field):''})`);

console.log('A step reaches the firm, not a desk');
{
  const all=mails({name:'Design Team Review', company:'Moore Engineering'});
  ok(all.length===3, 'everyone at the firm hears about it (got '+all.length+')');
  ok(all.includes('bob@moore.com') && all.includes('blake@moore.com') && all.includes('quentin@moore.com'),
     'by name, all three');
  ok(!all.includes('amanda@cooks.com'), 'and nobody at another firm does');
  ok(mails({name:'x', company:'moore ENGINEERING'}).length===3, 'matched however the name was cased');
}

console.log('The firm’s contact list is not its review team');
{
  const co=mails({company:'Moore Engineering'}, 'Notify - CO');
  ok(co.length===2 && !co.includes('quentin@moore.com'),
     'only the people carrying that module’s flag — a draughtsman on the contact sheet is not '
     +'somebody who reviews change orders');
  const rfi=mails({company:'Moore Engineering'}, 'Notify - RFI');
  ok(rfi.length===1 && rfi[0]==='bob@moore.com', 'and the flag is per module, not one switch');
}

console.log('A chain written before this still reaches somebody');
{
  // Steps used to name a person. Their firm is read off the contact sheet, so
  // an old chain widens by itself with nothing re-entered.
  ok(mails({name:'Design Team Review', person:'Bob Potter'}).length===3,
     'a step naming Bob reaches all of Moore, because his firm is on the contact sheet');
  // Nobody at the firm is down for this module: better one address than none.
  const only=mails({company:'Moore Engineering', person:'Bob Potter', email:'bob@moore.com'}, 'Notify - Submittal');
  ok(only.length===1 && only[0]==='bob@moore.com',
     'and where the flag leaves nobody, the address on the step still gets it — a step nobody is '
     +'told about is a step nobody answers');
  ok(mails({person:'Nobody At All'}).length===0, 'while a step naming somebody unknown reaches nobody, '
     +'rather than everybody');
  ok(mails({}).length===0 && mails(null).length===0, 'and an empty step is not a wildcard');
}

console.log('Nothing is sent twice');
{
  P.run(`allData.contacts.push({Name:'Bob Potter (2)', Company:'Moore Engineering', Email:'BOB@moore.com', 'Notify - CO':'Yes'});`);
  const all=mails({company:'Moore Engineering'});
  ok(all.filter(e=>e==='bob@moore.com').length===1,
     'one person on the sheet twice is one email, whatever case it was typed in');
}

console.log('The editor asks for a firm');
{
  const r=html.split('function wfStepRow')[1].split('function wfBlock')[0];
  ok(/class="wf-firm"/.test(r) && !/class="wf-person"/.test(r), 'the Assign to box takes a company');
  ok(/placeholder="Start typing a company/.test(r), 'and says so');
  ok(!/class="wf-co"/.test(r),
     'and the separate readonly Company column is gone \\u2014 it was derived from the person, and is now '
     +'the same field');
  ok(/const firm=String\(company\|\|''\)\.trim\(\) \|\| wfCompanyOf\(person\)/.test(r),
     'an existing step naming a person opens showing their firm, so nothing has to be re-entered');
  const g=html.split('function wfGather')[1].split('let WF_SCOPE')[0];
  ok(/company:\(r\.querySelector\('\.wf-firm'\)\.value\|\|''\)\.trim\(\)/.test(g), 'and that is what is saved');
  ok(/person:''/.test(g),
     'with nobody named: the signature records whoever actually pressed it, which is the part that '
     +'has to be exact');
  const ac=html.split('function wfShowAC')[1].split("document.addEventListener('click'")[0];
  ok(/const firms=wfCompanyList/.test(ac), 'the picker offers firms');
  ok(/p\.n\+' '\+\(p\.n===1\?'person':'people'\)/.test(ac),
     'each with how many people would hear about it, which is the number worth seeing before assigning');
}

console.log('And the chain tells the firms still owed');
{
  const a=html.split('function payAdvanceChain')[1].split('function payMidChainStatus')[0];
  ok(/wfStepEmails\(st, payNotifyFieldFor\(row\)\)/.test(a),
     'mid-chain, everyone at the firms still to act');
  ok(!/waiting\.map\(wfEmailOf\)/.test(a),
     'not the old lookup against a contact name, which found nobody once steps stopped naming people');
}

console.log('And the row reads by firm, not by desk')
{
  // "The awaiting review display — i just think we should remove the
  // individual." Right: the firm owes the step, permission is matched on the
  // firm, and naming a person read as though only that desk could answer.
  const w=html.split('function wfThreadHTML')[1]||html.slice(html.indexOf('Awaiting: ')-9000, html.indexOf('Awaiting: ')+3000);
  ok(/\+\(wfPartyLabel\(s\)\?'<span style="color:var\(--muted\);">/.test(w),
     'the step line names the firm');
  ok(!/esc\(s\.person\)\+\(wfCompanyOf\(s\.person\)/.test(w),
     'and no longer the person with the firm in brackets after them');
  ok(/const names=firmsOf\(grp\);/.test(w), 'Awaiting names firms');
  ok(/const others=firmsOf\(grp\.filter/.test(w), 'and so does the "you and…" form');
  ok(/if\(seen\.has\(k\)\) return false; seen\.add\(k\); return true;/.test(w),
     'deduplicated \u2014 two reviewers from one office is one office waiting, and reading it twice '
     +'suggests two things outstanding');
  ok(/Anyone at '\+esc\(wfPartyLabel\(steps\[gs\]\)\|\|'the assigned firm'\)\+' can advance this step/.test(w),
     'and the footnote says anyone there can advance it, which is what the permission check has '
     +'actually done for a while \u2014 the sentence was still describing the old rule');
  ok(!/Only the assigned reviewer can advance/.test(html), 'the old sentence is gone');
  ok(/stands in for the firm that owes it/.test(html),
     'and an override stands in for a firm rather than for a named reviewer');
}

console.log(bad ? `FAIL tools-test-wfcompany.mjs — ${bad} of ${n}` : `ok   tools-test-wfcompany.mjs — ${n} assertions`);
process.exit(bad?1:0);
