// "If I write text and drag my cursor across that text to the end, the box
// will disappear."
//
// Every dialog closed on a backdrop click, tested as `event.target===this`.
// But a click's target is the nearest common ancestor of mousedown and
// mouseup. Select text in a field and release a few pixels past the edge of
// the dialog and that ancestor IS the backdrop — so the dialog closed and took
// the half-filled form with it. Selecting text in order to retype it is
// exactly when this happens.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

let JSDOM;
try{ ({ JSDOM } = await import('jsdom')); }
catch(e){ console.log('SKIP tools-test-dragclose.mjs — jsdom not installed (npm i)'); process.exit(0); }

const dom = new JSDOM(`<!doctype html><body>
  <div class="modal-backdrop" id="bd-a"><div class="modal" id="dlg-a"><input id="f-a"></div></div>
  <div class="modal-backdrop" id="bd-b"><div class="modal" id="dlg-b"><input id="f-b"></div></div>
  </body>`);
const { window } = dom;
const grab = name => { const i=html.indexOf('function '+name+'('); return html.slice(i, html.indexOf('\n}', i)+2); };
const listener = html.slice(html.indexOf("let BACKDROP_DOWN=null;"),
                            html.indexOf("function backdropClick"));
window.backdropClick = new window.Function('document', `${listener}
  ${grab('backdropClick')}
  return backdropClick;`)(window.document);

const doc=window.document;
const bdA=doc.getElementById('bd-a'), dlgA=doc.getElementById('dlg-a'), fA=doc.getElementById('f-a');
let closed=0;
[bdA, doc.getElementById('bd-b')].forEach(bd=>{
  bd.addEventListener('click', e=>window.backdropClick(e, ()=>closed++));
});
const down=el=>el.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true}));
// A click dispatched on the common ancestor is what the browser actually does
// after a drag that starts and ends in different elements.
const click=el=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));

console.log('The report');
closed=0; down(fA); click(bdA);
ok(closed===0, 'a drag that starts in a field and ends on the backdrop does not close the dialog');

closed=0; down(dlgA); click(bdA);
ok(closed===0, 'nor one that starts anywhere else inside it');

console.log('What must still close');
closed=0; down(bdA); click(bdA);
ok(closed===1, 'a real click on the dark area still closes it');

closed=0; down(bdA); click(bdA); click(bdA);
ok(closed===1, 'and only once — a second click with no press behind it does nothing');

console.log('The dialog itself is never the backdrop');
closed=0; down(bdA); click(dlgA);
ok(closed===0, 'a click landing on the dialog does not close it, however the press began');
closed=0; down(fA); click(fA);
ok(closed===0, 'and clicking in a field certainly does not');

console.log('A press left standing from earlier');
{
  // Press the backdrop, release on the dialog: nothing closes, and nothing is
  // consumed either. That press must not still be there to authorise the next
  // drag out of a field.
  closed=0; down(bdA); click(dlgA);
  ok(closed===0, 'press the backdrop, release on the dialog, nothing closes');
  down(fA); click(bdA);
  ok(closed===0, 'and the earlier press does not authorise the drag that follows it');
}
{
  // A handler inside the dialog that stops propagation must not be able to
  // hide the press and leave a stale one behind.
  closed=0; down(bdA); click(dlgA);
  const stop=e=>e.stopPropagation();
  dlgA.addEventListener('mousedown', stop);
  down(fA); click(bdA);
  ok(closed===0, 'a press swallowed inside the dialog is still seen, because the listener captures');
  dlgA.removeEventListener('mousedown', stop);
}

console.log('One dialog cannot close another');
{
  const bdB=doc.getElementById('bd-b');
  closed=0; down(bdA); click(bdB);
  ok(closed===0, 'a press on one backdrop does not arm the other');
  closed=0; down(bdB); click(bdB);
  ok(closed===1, 'while its own press does');
}

console.log('Every dialog goes through it');
ok(!/onclick="if\(event\.target===this\)close/.test(html),
   'no backdrop still uses the bare target test');
// Counted rather than written out: dialogs get added, and a number in a test is
// a thing to update rather than a thing that checks anything. What matters is
// that every dismissible backdrop goes through the guard, which the sweep below
// asserts directly.
{
  const guarded=(html.match(/onclick="backdropClick\(event,/g)||[]).length;
  const backdrops=(html.match(/<div class="modal-backdrop"/g)||[]).length;
  ok(guarded===backdrops-1,
     'every backdrop but the session one is on the shared guard — '+guarded+' of '+backdrops);
}
{
  const bd=[...html.matchAll(/<div class="modal-backdrop"[^>]*id="([^"]+)"([^>]*)>/g)]
    .filter(m=>!/backdropClick/.test(m[2])).map(m=>m[1]);
  ok(bd.join()==='session-backdrop',
     'and the only one without it is the session dialog, which is not dismissible — got '+bd.join(','));
}
ok(/addEventListener\('mousedown'[\s\S]{0,200}?\}, true\);/.test(html),
   'the press is captured, so a handler inside the dialog cannot hide it and leave a stale one behind');
{
  const b=grab('backdropClick');
  ok(/BACKDROP_DOWN=null;/.test(b), 'and is consumed once used');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-dragclose.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
