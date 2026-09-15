// "Can we preserve indenting here? I submitted with a full line of spacing
// between the bullets... also just make sure text can keep going — if someone
// submits paragraphs of text I want it all to show up. Maybe we could even make
// it collapsible if it's above a certain number of lines."
//
// HTML collapses every run of whitespace and drops newlines entirely, so the
// layout of what somebody wrote was thrown away at the point of display. The
// record kept it; nobody could see it.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
const lt=(t,o)=>P.run('longTextHTML('+JSON.stringify(t)+(o?','+JSON.stringify(o):'')+')');
const many=k=>Array.from({length:k},(_,i)=>'line '+i).join('\n');

console.log('What was typed is what is shown');
{
  const t='Items to address:\n\n  - First point\n\n  - Second point\n\nThanks.';
  const h=lt(t);
  ok(/class="lt[ "]/.test(h), 'the text is marked as submitted text');
  ok(h.indexOf('\n\n')>=0, 'the blank line between the bullets survives');
  ok(h.indexOf('  - First point')>=0, 'and so does the indent in front of each one');
  ok(!/&ldquo;/.test(h), 'and it is not wrapped in quote marks it never had');
}
{
  const h=lt('a\r\nb\r\n\r\nc');
  ok(h.indexOf('\r')<0, 'a Windows line ending does not leave a stray carriage return');
  ok(h.indexOf('a\nb\n\nc')>=0, 'while the blank line it meant is kept');
}
{
  ok(/&lt;script&gt;/.test(lt('<script>alert(1)</script>')),
     'preserving the layout does not stop it being escaped');
  ok(/&amp;/.test(lt('Ampersand & co')), 'and an ampersand is still an entity');
}

console.log('Nothing is cut off');
{
  const long=many(60);
  const h=lt(long);
  ok(h.indexOf('line 59')>=0, 'the last line of a long answer is in the markup, not truncated away');
  ok(h.indexOf('line 0')>=0, 'as is the first');
  ok(!/…|\.\.\./.test(h), 'and there is no ellipsis, because nothing was dropped');
}

console.log('A tall one is folded, not shortened');
{
  ok(!/lt-clip/.test(lt(many(4))), 'a short note is shown whole, with no control');
  ok(!/lt-more/.test(lt(many(4))), 'and nothing to press');
  ok(/lt-clip/.test(lt(many(40))), 'a tall one is clipped');
  ok(/lt-more/.test(lt(many(40))), 'with a control to open it');
  ok(/Show more/.test(lt(many(40))), 'labelled for what it does');
  ok(/lt-clip/.test(lt(many(11))) && !/lt-clip/.test(lt(many(10))),
     'the line where it starts folding is ten');
  ok(/lt-clip/.test(lt(many(4),{lines:3})), 'and a caller can set its own threshold');
  // A single very long line wraps into many, and the browser knows the width
  // when we do not — so it is estimated rather than ignored.
  ok(/lt-clip/.test(lt('x'.repeat(4000))), 'one enormous line counts as tall');
  ok(!/lt-clip/.test(lt('x'.repeat(50))), 'while a short one does not');
}
{
  // Each note gets its own control, or the first one opens all of them.
  const a=lt(many(40)), b=lt(many(40));
  const idA=(a.match(/id="(lt\d+)"/)||[])[1], idB=(b.match(/id="(lt\d+)"/)||[])[1];
  ok(idA && idB && idA!==idB, 'two notes on one page have different ids — got '+idA+' and '+idB);
  ok(a.indexOf("ltToggle(event,'"+idA+"')")>=0, 'and each control points at its own');
}
{
  ok(lt('')==='', 'nothing at all renders nothing');
  ok(lt('   \n  \n')==='', 'and so does whitespace pretending to be an answer');
  ok(lt(null)==='', 'and a missing value');
}

console.log('Opening one');
// The harness's DOM stub does not parse markup, and this is about what happens
// to a real element, so jsdom does the second half.
let JSDOM;
try{ ({ JSDOM } = await import('jsdom')); }catch(e){ JSDOM=null; }
if(!JSDOM){ console.log('  (skipping the DOM half — jsdom not installed)'); }
else {
  const { window } = new JSDOM('<!doctype html><body></body>');
  const src = html.slice(html.indexOf('function ltToggle(e, id){'));
  const toggle = new window.Function('document', src.slice(0, src.indexOf('\n}')+2)+'\nreturn ltToggle;')(window.document);
  window.document.body.innerHTML = lt(many(40));
  const el = window.document.querySelector('.lt');
  const btn = window.document.querySelector('.lt-more');
  ok(!!el && !!btn, 'the markup parses into a block and a control');
  ok(el.className.indexOf('lt-clip')>=0, 'it starts clipped');
  const ev=()=>({preventDefault(){this.p=true;}, stopPropagation(){this.s=true;}, currentTarget:btn});
  toggle(ev(), el.id);
  ok(el.className.indexOf('lt-open')>=0, 'pressing it opens');
  ok(btn.textContent==='Show less', 'and the control says so');
  toggle(ev(), el.id);
  ok(el.className.indexOf('lt-open')<0, 'and closes again');
  ok(btn.textContent==='Show more', 'with the label back');

  // The row underneath listens for clicks; opening a note must not fold the
  // item away as well.
  const e1=ev(); toggle(e1, el.id);
  ok(e1.s===true, 'the click is stopped from reaching the row behind it');
  ok(e1.p===true, 'and the button does not act as a link');
  let threw=false; try{ toggle(null, 'missing'); }catch(x){ threw=true; }
  ok(!threw, 'a control pointing at nothing does not throw');

  // Two notes open independently.
  window.document.body.innerHTML = lt(many(40)) + lt(many(40));
  const els=[...window.document.querySelectorAll('.lt')];
  const btns=[...window.document.querySelectorAll('.lt-more')];
  toggle({preventDefault(){},stopPropagation(){},currentTarget:btns[0]}, els[0].id);
  ok(els[0].className.indexOf('lt-open')>=0, 'opening one opens it');
  ok(els[1].className.indexOf('lt-open')<0, 'and leaves the other alone');
}

console.log('Where it is used');
{
  const v=html.slice(html.indexOf('function verThreadRows'), html.indexOf('function toggleThread'));
  ok(/longTextHTML\(v\.note\)/.test(v), 'version notes — what a reviewer actually writes');
  ok(!/esc\(v\.note\)/.test(v), 'and no longer flattened through esc alone');
  ok(/longTextHTML\(resp\)/.test(v), 'and the older free-text response on file');
  ok(/--lt-bg:var\(--khaki-50/.test(v) && /--lt-bg:var\(--white\)/.test(v),
     'each with the background its fade has to blend into');
}
ok(/\.lt\{white-space:pre-wrap;overflow-wrap:anywhere;\}/.test(html),
   'the whitespace is preserved in CSS, and a pasted URL still wraps rather than widening the table');
ok(/\.lt-clip\.lt-open\{max-height:none;\}/.test(html), 'an opened one has no height limit at all');
ok(/pointer-events:none/.test(html.slice(html.indexOf('.lt-clip::after'))),
   'and the fade over the clip does not swallow clicks on the text under it');

console.log((bad?'FAIL':'ok  ')+' tools-test-longtext.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
