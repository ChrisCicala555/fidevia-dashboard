// One press records one approval; the settings pane stays in settings; headings
// read as headings.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── the settings pane escaped its section ──
// Counted rather than parsed, so the suite needs no DOM library: walk from the
// opening tag and find the line where the div depth returns to zero. Anything
// after that line is outside the section however it looks in the source.
const lines = html.split('\n');
function sectionSpan(id){
  const start = lines.findIndex(l => l.includes('id="'+id+'"'));
  if(start < 0) return null;
  let depth = 0;
  for(let i=start; i<lines.length; i++){
    depth += (lines[i].match(/<div\b/g)||[]).length - (lines[i].match(/<\/div>/g)||[]).length;
    if(depth <= 0) return [start+1, i+1];
  }
  return [start+1, lines.length];
}
const span = sectionSpan('section-settings');
ok(!!span, 'the settings section exists');
const lineOf = needle => lines.findIndex(l => l.includes(needle)) + 1;
['set-pane-notifs','set-pane-workflows','set-pane-dates','nt-rfi-subject','rem-schedules',
 'nlog-body','org-gap-note'].forEach(id=>{
  const at = lineOf('id="'+id+'"');
  ok(at > span[0] && at < span[1],
     id+' is inside the settings section, not loose in the page');
});
// The stray closing tag that caused this closed the section 60 lines early.
ok(span[1] - span[0] > 100, 'the section spans all of its panes rather than ending at the first');
// No section may open before another has closed.
{
  const opens = lines.map((l,i)=>l.includes('class="section"')?i+1:0).filter(Boolean);
  let overlap = false;
  opens.forEach(o=>{
    const id=(lines[o-1].match(/id="([^"]+)"/)||[])[1];
    if(!id) return;
    const sp=sectionSpan(id); if(!sp) return;
    if(opens.some(p=>p>sp[0] && p<sp[1])) overlap=true;
  });
  ok(!overlap, 'and no section is nested inside another, which is what let one leak into the rest');
}

// ── the parallel group ──
{
  const c = html.split('const needsAll=steps.slice(gs,ge+1).some(st=>st&&st.requireAll);')[1].split('const next=ge+1;')[0];
  ok(!/\|\| IS_ADMIN\)\{ if\(!doneIdx\.includes\(n\)\) doneIdx\.push\(n\); \}/.test(c),
     'an administrator no longer signs every step in the group at once');
  // Whose approval it is is worked out for every group now, not only the ones
  // that require everybody — a parallel review group advancing on one person
  // was the case that still drew a tick against all of them.
  ok(/const mine=wfMyStepsIn\(steps,gs,ge\);/.test(c), 'the caller signs the steps they are named on');
  ok(/if\(!IS_ADMIN\) return;/.test(c), 'and a non-admin named on none signs nothing');
  ok(/You are not on this step\. Record /.test(c),
     'recording one outstanding approval on someone else’s behalf is confirmed by name');
  ok(/prompt\('Override — whose approval are you recording\?/.test(c),
     'and with several outstanding, whose it is has to be chosen');
  ok(/toSign=\[pending\[k-1\]\]/.test(c), 'one at a time');
  ok(/Each party is recorded separately/.test(c), 'which the prompt says out loud');
  ok(/wfMarkSigned\(row, n,/.test(c), 'and the approval is recorded against a name');
}
// ── and the same on the server, which is the copy that matters ──
{
  const c = srv.split('const groupNeedsAll =')[1].split('const groupSatisfied =')[0];
  ok(!/An administrator completing on someone's behalf closes the group/.test(c),
     'the server no longer closes the whole group for an admin');
  ok(/if \(\(direct && direct === me\) \|\| \(viaName && viaName === me\)\) mine\.push\(n\);/.test(c),
     'it records the steps the caller is named on');
  ok(/parseInt\(body\.stepIndex, 10\)/.test(c), 'an admin acting for someone must name the step');
  ok(/asked >= gs && asked <= ge/.test(c), 'and it has to be inside the current group');
  ok(/Say whose approval this is/.test(c), 'otherwise it refuses and says why');
  ok(/, 400\)/.test(c), 'with a refusal, not a silent success');
}
ok(/groupSatisfied = !groupNeedsAll/.test(srv), 'the group still only advances when everyone has signed');

// ── headings ──
{
  const c = html.split('.modal-header h3{')[1].split('}')[0];
  ok(/Helvetica/.test(c), 'the dialog title is the sans used elsewhere');
  ok(/text-transform:uppercase/.test(c), 'in caps');
  // 'sans-serif' contains 'serif', so this looks for the serif families by name.
  ok(!/Times|Georgia/.test(c) && !/[^-]\bserif\b/.test(c.replace('sans-serif','')),
     'and not the brand serif it was');
}
ok(/h2\.page-title\{[^}]*text-transform:uppercase/.test(html), 'page titles are in caps');
ok(/\.page-title-row h2\{[^}]*text-transform:uppercase/.test(html),
   'including the ones sharing a row with a button, which is most of them');

console.log((bad?'FAIL':'ok  '),' tools-test-parallel.mjs —',n,'assertions');
process.exit(bad?1:0);
