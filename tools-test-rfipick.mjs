// The Linked RFI field on a new PCO used to be a bare text box with the
// placeholder "RFI-001". The contractor had to leave the form, find the RFI
// tab, read the number off and come back — which is how a proposal ends up
// linked to the wrong RFI, or to none.
//
// This runs the picker against a real DOM rather than reading its source: the
// bugs that have got through twice on this codebase (allowId, `notes`) were
// undeclared names, which only evaluation can see.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

let JSDOM;
try{ ({ JSDOM } = await import('jsdom')); }
catch(e){ console.log('SKIP tools-test-rfipick.mjs — jsdom not installed (npm i)'); process.exit(0); }

const dom = new JSDOM(`<!doctype html><body>
  <div class="field"><input id="f-linked"><p id="f-linked-note"></p></div></body>`);
const { window } = dom;
const grab = name => { const i=html.indexOf('function '+name); return html.slice(i, html.indexOf('\n}', i)+2); };
const parts = ['rfiNumKey','linkedRfiChoices','rfiMatches','rfiCloseAC','rfiShowAC','rfiLinkNote'].map(grab).join('\n');

const RFIS = [
  {'RFI #':'RFI-001','Subject':'Beam clearance at Gridline C4','Company':'Summit Builders','Status':'Closed','Date Submitted':'2026-06-02'},
  {'RFI #':'RFI-007','Subject':'Slab edge detail','Company':'Summit Builders','Status':'Open','Date Submitted':'2026-09-01'},
  {'RFI #':'RFI-017','Subject':'Louver sizing','Company':'Summit Builders','Status':'Open','Date Submitted':'2026-08-04'},
  {'RFI #':'RFI-022','Subject':'Curtain wall anchor','Company':'Delaney Mechanical','Status':'Open','Date Submitted':'2026-09-05'},
  {'RFI #':'','Subject':'Never numbered','Company':'Summit Builders','Status':'Open','Date Submitted':'2026-09-06'},
  {'RFI #':'RFI-007','Subject':'A duplicate row','Company':'Summit Builders','Status':'Open','Date Submitted':'2026-09-01'}
];

const mk = (me) => new window.Function('document','allData','myCompany','rowCompany','esc', `
  ${parts}
  return {rfiNumKey,linkedRfiChoices,rfiMatches,rfiShowAC,rfiLinkNote};
`)(window.document, {rfi:RFIS}, ()=>me,
   r=>String((r&&(r['Company']||r['Contractor']))||'').trim(),
   s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'));

const F = mk('Summit Builders');

// ── the number somebody types is not the number in the log ──
ok(F.rfiNumKey('7')===F.rfiNumKey('RFI-007'), '7 and RFI-007 are the same RFI');
ok(F.rfiNumKey('rfi 007')===F.rfiNumKey('RFI-007'), 'and so is "rfi 007"');
ok(F.rfiNumKey('7')!==F.rfiNumKey('RFI-017'), 'but 7 is not 017');

// ── what gets offered ──
const all = F.linkedRfiChoices();
ok(all.length===4, 'one entry per RFI number, the blank and the duplicate dropped — got '+all.length);
ok(all.filter(x=>x.num==='RFI-007').length===1, 'the duplicate number appears once');
ok(!all.some(x=>!x.num), 'an RFI with no number is not offered, since it cannot be linked to');
ok(all[all.length-1].num==='RFI-022', "another firm's RFI sorts below the reader's own");
ok(all[0].num==='RFI-007', "and the reader's own are newest first");
const asOther = mk('Delaney Mechanical').linkedRfiChoices();
ok(asOther[0].num==='RFI-022', 'read by the other firm, theirs comes first instead');
ok(asOther.length===4, 'without hiding anything — the proxy decides what is readable, not this');

// ── typing ──
ok(F.rfiMatches('7').map(x=>x.num).join()==='RFI-007', 'typing 7 finds RFI-007 and not RFI-017');
ok(F.rfiMatches('01').map(x=>x.num).sort().join()==='RFI-001,RFI-017', 'typing 01 finds both numbers starting 01');
ok(F.rfiMatches('beam').map(x=>x.num).join()==='RFI-001', 'and the subject is searchable — "the beam clearance one"');
ok(F.rfiMatches('CLEARANCE').length===1, 'case-insensitively');
ok(F.rfiMatches('rfi-00').map(x=>x.num).sort().join()==='RFI-001,RFI-007',
   'typing the written form offers everything it could still become');
ok(F.rfiMatches('RFI-022').map(x=>x.num).join()==='RFI-022', 'and typing one out in full finds just it');
ok(F.rfiMatches('').length===4, 'an empty field offers the list rather than nothing');
ok(F.rfiMatches('zzz').length===0, 'and a query matching nothing offers nothing');

// ── the dropdown ──
const inp=window.document.getElementById('f-linked');
const note=window.document.getElementById('f-linked-note');
inp.value=''; F.rfiShowAC(inp);
let items=[...window.document.querySelectorAll('.rfi-ac-item')];
ok(items.length===4, 'focusing the empty field drops the list down');
ok(/Beam clearance at Gridline C4/.test(items.map(i=>i.innerHTML).join('')), 'each row shows the subject, not just a number');
inp.value='beam'; F.rfiShowAC(inp);
items=[...window.document.querySelectorAll('.rfi-ac-item')];
ok(items.length===1, 'typing narrows it');
ok([...window.document.querySelectorAll('.rfi-ac')].length===1, 'and does not stack a second list on top of the first');
ok(items[0].getAttribute('data-num')==='RFI-001', 'the row carries the number it will fill in');
items[0].dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true}));
ok(inp.value==='RFI-001', 'picking a row fills the field with the RFI number');
ok(window.document.querySelectorAll('.rfi-ac').length===0, 'and closes the list');
ok(/Beam clearance at Gridline C4/.test(note.innerHTML), 'and confirms underneath which RFI that was');
// Typing has to keep the note current on its own — nothing else calls it.
inp.value='7'; F.rfiShowAC(inp);
ok(/Slab edge detail/.test(note.innerHTML), 'and typing a number alone updates the note, without picking anything');
inp.value='zzz'; F.rfiShowAC(inp);
ok(window.document.querySelectorAll('.rfi-ac').length===0, 'nothing to offer means no empty box hanging under the field');

// ── the note, which is what catches a wrong digit ──
inp.value='RFI-001'; F.rfiLinkNote(inp);
ok(/Beam clearance at Gridline C4/.test(note.innerHTML), 'a matched number names the RFI it is');
inp.value='7'; F.rfiLinkNote(inp);
ok(/Slab edge detail/.test(note.innerHTML), 'and resolves a loosely typed number to the right one');
inp.value='RFI-999'; F.rfiLinkNote(inp);
ok(/No RFI with that number/.test(note.innerHTML), 'an unknown number says so');
ok(/saved as typed/.test(note.innerHTML), 'but is still accepted — an RFI can live outside the dashboard');
inp.value=''; F.rfiLinkNote(inp);
ok(/Start typing/.test(note.innerHTML), 'an empty field says the list is there');

// A project with no RFIs yet must not invite them to type into an empty list.
const Fnone = new window.Function('document','allData','myCompany','rowCompany','esc',
  `${parts}\nreturn {rfiLinkNote,rfiShowAC};`)(window.document,{rfi:[]},()=>'Summit Builders',()=>'',s=>String(s));
inp.value=''; Fnone.rfiLinkNote(inp);
ok(note.innerHTML==='', 'with no RFIs on the project the field says nothing at all');

// ── the wiring, which no amount of unit testing reaches ──
ok(/id="f-linked"[^>]*oninput="rfiShowAC\(this\)"/.test(html), 'the field calls the picker as it is typed in');
ok(/id="f-linked"[^>]*onfocus="rfiShowAC\(this\)"/.test(html), 'and on focus, so the list is discoverable');
ok(/id="f-linked-note"/.test(html), 'the note element exists in the form');
ok(/if\(type==='co'\)\{ rfiLinkNote\(/.test(html), 'and the note is primed when the PCO form opens');
ok(!/id="f-linked"[^>]*placeholder="RFI-001"/.test(html), 'the placeholder no longer implies typing a number from memory');

console.log((bad?'FAIL':'ok  ')+' tools-test-rfipick.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
