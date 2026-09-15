// "Everyone should be able to see archived documents in the various tabs — I
// just think it helps remove some visual clutter up top."
//
// That is the bargain archiving makes: the live log gets shorter, and nothing
// becomes unreachable. So the Past panel has to be for every role, not a
// Fidevia view of what Fidevia tidied away. This checks it against a real DOM,
// because the harness's stub cannot append the panel to its section and would
// report it missing for everybody.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

let JSDOM;
try{ ({ JSDOM } = await import('jsdom')); }
catch(e){ console.log('SKIP tools-test-pastvisible.mjs — jsdom not installed (npm i)'); process.exit(0); }

const grab = name => { const i=html.indexOf('function '+name+'('); return html.slice(i, html.indexOf('\n}', i)+2); };
const src = ['renderPastPanel','pastByCompany','togglePast'].map(grab).join('\n');

const mk = () => {
  const { window } = new JSDOM('<!doctype html><body><div id="section-rfis"></div></body>');
  const esc=x=>String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const api = new window.Function('document','esc','rowCompany', src+'\nreturn {renderPastPanel,togglePast};')
    (window.document, esc, r=>String((r&&r['Company'])||'').trim());
  return { window, api };
};
const rows=[{r:{'RFI #':'R2','Subject':'answered','Company':'Summit Builders'},idx:1},
            {r:{'RFI #':'R3','Subject':'also answered','Company':'Delaney Mechanical'},idx:2}];
const rowHtml=e=>'<tr class="pr"><td>'+e.r['RFI #']+'</td></tr>';

console.log('The panel is built for whoever is reading');
{
  const {window, api}=mk();
  api.renderPastPanel('rfi','section-rfis','Past RFIs', rows, 9, rowHtml);
  const panel=window.document.getElementById('past-rfi');
  ok(!!panel, 'the panel is created');
  ok(panel.style.display!=='none', 'and shown');
  ok(!/admin-only/.test(panel.className+' '+panel.innerHTML),
     'with nothing marking it admin-only, so it is not hidden from an external reader');
  ok(!/hide-external/.test(panel.innerHTML), 'nor hidden from an external reader by class');
  ok((panel.innerHTML.match(/class="pr"/g)||[]).length===2, 'both archived rows are in it');
  ok(/2 archived/.test(panel.innerHTML), 'and the count is stated');
}

console.log('Two firms are banded, one is not');
{
  const {window, api}=mk();
  api.renderPastPanel('rfi','section-rfis','Past RFIs', rows, 9, rowHtml);
  const h=window.document.getElementById('past-rfi').innerHTML;
  ok(/Delaney Mechanical/.test(h) && /Summit Builders/.test(h), 'each firm gets a band');
  const {window:w2, api:a2}=mk();
  a2.renderPastPanel('rfi','section-rfis','Past RFIs', [rows[0]], 9, rowHtml);
  ok(!/cd-band/.test(w2.document.getElementById('past-rfi').innerHTML),
     'one firm alone is not banded');
}

console.log('It starts folded, which is the point of it');
{
  const {window, api}=mk();
  api.renderPastPanel('rfi','section-rfis','Past RFIs', rows, 9, rowHtml);
  const body=window.document.getElementById('past-body-rfi');
  ok(body.style.display==='none', 'the archived rows start collapsed, so the clutter really is gone');
  api.togglePast('rfi');
  ok(body.style.display==='block', 'and open on a press');
  api.togglePast('rfi');
  ok(body.style.display==='none', 'and close again');
}

console.log('Nothing archived, nothing shown');
{
  const {window, api}=mk();
  api.renderPastPanel('rfi','section-rfis','Past RFIs', [], 9, rowHtml);
  ok(!window.document.getElementById('past-rfi'), 'no panel at all when nothing is archived');
  api.renderPastPanel('rfi','section-rfis','Past RFIs', rows, 9, rowHtml);
  ok(!!window.document.getElementById('past-rfi'), 'and it appears once something is');
  api.renderPastPanel('rfi','section-rfis','Past RFIs', [], 9, rowHtml);
  ok(window.document.getElementById('past-rfi').style.display==='none',
     'and hides again if the last one is restored, rather than leaving an empty panel');
}

console.log('Every log that archives has one');
for(const [key,sec,title] of [['rfi','section-rfis','Past RFIs'],
                              ['sub','section-submittals','Past Submittals'],
                              ['co','section-cos','Past Change Orders']]){
  ok(html.indexOf("renderPastPanel('"+key+"','"+sec+"','"+title+"'")>=0,
     key+' files its archived rows into a panel of its own');
}
{
  // The call sites are unconditional — a role check there would hide the
  // archive from the people the clutter was removed for.
  for(const key of ['rfi','sub','co']){
    const i=html.indexOf("renderPastPanel('"+key+"'");
    const before=html.slice(Math.max(0,i-160), i);
    ok(!/if\s*\(\s*IS_ADMIN/.test(before) && !/viewingAsExternal\(\)\s*\)\s*\{?\s*$/.test(before),
       'the '+key+' panel is drawn for every role, not gated on admin');
  }
}

console.log((bad?'FAIL':'ok  ')+' tools-test-pastvisible.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
