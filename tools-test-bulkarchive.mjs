// "Once RFIs are closed / submittals / COs / PCOs etc, there should be a way to
// archive all of the ones that are resolved. And maybe they are archived by
// contractor."
//
// Archiving was one row at a time. On a job that has run a year that is a
// hundred presses, so nobody does it and the live log carries every RFI ever
// answered. And change orders could be archived with nowhere to go: the row
// stayed in the live log, so the button appeared to do nothing.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

const R=(o)=>Object.assign({'RFI #':'','Subject':'','Company':'Summit Builders','Status':'Open',
  'Date Submitted':'2026-09-01','Archived':'','Archived By':'','Archived Date':''}, o);
const boot=(rfis)=>{
  const P=bootPage(); P.run(SEED);
  P.run(`
    IS_ADMIN=true; EXTERNAL=false; DATA_READY=true;
    ME_NAME='Christopher Cicala'; ME_EMAIL='cc@fidevia.com';
    allData.rfi=${JSON.stringify(rfis)};
    CALLS=[]; SAVED=null;
    findFile=async()=>({id:'log'}); boxGetText=async()=>'';
    parseCSV=()=>({headers:MODULES.rfi.headers, rows:JSON.parse(JSON.stringify(allData.rfi))});
    boxUploadText=async(nm,txt)=>{ CALLS.push('save'); SAVED=txt; return {}; };
    toCSV=(h,rows)=>JSON.stringify(rows);
    resolveMe=async()=>{}; renderAll=()=>{}; auditLog=(a,k,r,d)=>{ AUDIT=a+'|'+d; }; AUDIT='';
    confirm=()=>true; alert=(m)=>{ ALERTED=m; }; ALERTED='';
  `);
  return P;
};

console.log('Which are settled');
{
  const P=boot([R({'RFI #':'R1','Status':'Closed'}),
                R({'RFI #':'R2','Status':'Open'}),
                R({'RFI #':'R3','Status':'Closed','Archived':'Yes'}),
                R({'RFI #':'R4','Status':'Closed','Company':'Delaney Mechanical'})]);
  ok(P.run(`archivableIdx('rfi')`).join()==='0,3',
     'the closed ones that are not already archived — got '+P.run(`archivableIdx('rfi')`).join());
  ok(P.run(`archiveAllBtnHTML('rfi')`).indexOf('>Archive (2)<')>=0, 'and the button says how many');
  ok(/Nothing is deleted/.test(P.run(`archiveAllBtnHTML('rfi')`)), 'and that nothing is lost by pressing it');
}
{
  const P=boot([R({'RFI #':'R1','Status':'Open'})]);
  ok(P.run(`archiveAllBtnHTML('rfi')`)==='', 'with nothing settled there is no button at all');
}
{
  const P=boot([R({'RFI #':'R1','Status':'Closed'})]);
  P.run(`EXTERNAL=true;`);
  ok(P.run(`archiveAllBtnHTML('rfi')`)==='', 'and a contractor is not offered one');
  P.run(`EXTERNAL=false; IS_ADMIN=false;`);
  ok(P.run(`archiveAllBtnHTML('rfi')`)==='', 'nor a non-admin');
}

console.log('Archiving them');
{
  const P=boot([R({'RFI #':'R1','Status':'Closed'}),
                R({'RFI #':'R2','Status':'Open'}),
                R({'RFI #':'R3','Status':'Closed'})]);
  await P.run(`archiveResolved('rfi')`);
  ok(P.run(`CALLS`).join()==='save', 'one write for all of them, not one per row');
  ok(P.run(`allData.rfi[0]['Archived']`)==='Yes' && P.run(`allData.rfi[2]['Archived']`)==='Yes',
     'both settled ones are archived');
  ok(P.run(`allData.rfi[1]['Archived']`)==='', 'and the open one is left alone');
  ok(P.run(`allData.rfi[0]['Archived By']`)==='Christopher Cicala', 'stamped with who did it');
  ok(!!P.run(`allData.rfi[0]['Archived Date']`), 'and when');
  ok(/Archived 2 settled rfis/.test(P.run(`AUDIT`)), 'the audit log records the count');
  ok(/R1, R3/.test(P.run(`AUDIT`)), 'and names them, so the act can be undone deliberately');
}
{
  const P=boot([R({'RFI #':'R1','Status':'Closed'})]);
  await P.run(`archiveResolved('rfi')`);
  ok(/Archived 1 settled RFI\|/.test(P.run(`AUDIT`)),
     'one of something gets its own word, since MODULE_LABEL is already plural');
}
{
  const P=boot([R({'RFI #':'R1','Status':'Open'})]);
  await P.run(`archiveResolved('rfi')`);
  ok(P.run(`CALLS`).length===0, 'nothing settled writes nothing');
  ok(/Nothing is settled yet/.test(P.run(`ALERTED`)), 'and says so');
}
{
  const P=boot([R({'RFI #':'R1','Status':'Closed'})]);
  P.run(`confirm=()=>false;`);
  await P.run(`archiveResolved('rfi')`);
  ok(P.run(`CALLS`).length===0, 'declining the confirmation writes nothing');
  ok(P.run(`allData.rfi[0]['Archived']`)==='', 'and archives nothing');
}
{
  // The page may be stale. What gets archived is decided against Box.
  const P=boot([R({'RFI #':'R1','Status':'Open'})]);
  P.run(`parseCSV=()=>({headers:MODULES.rfi.headers,
    rows:[{'RFI #':'R1','Subject':'','Company':'Summit Builders','Status':'Closed','Archived':'','Archived By':'','Archived Date':''}]});`);
  await P.run(`archiveResolved('rfi')`);
  ok(P.run(`CALLS`).join()==='save',
     'an item closed by somebody else since this page was drawn is still caught');
}
{
  const P=boot([R({'RFI #':'R1','Status':'Closed'})]);
  P.run(`EXTERNAL=true;`);
  await P.run(`archiveResolved('rfi')`);
  ok(P.run(`CALLS`).length===0, 'a contractor reaching the handler another way writes nothing');
  ok(/Only Fidevia/.test(P.run(`ALERTED`)), 'and is told why');
}

console.log('Archived by contractor');
{
  const P=boot([]);
  const rows=[{r:{'Company':'Summit Builders'},idx:0},
              {r:{'Company':'Delaney Mechanical'},idx:1},
              {r:{'Company':'Summit Builders'},idx:2},
              {r:{'Company':''},idx:3}];
  const out=P.run(`pastByCompany(${JSON.stringify(rows)}, 9, e=>'<tr class="x">'+e.idx+'</tr>')`);
  const bands=[...out.matchAll(/cdb-key[^>]*>([^<]*)</g)].map(m=>m[1]);
  ok(bands.join(' | ')==='Delaney Mechanical | Summit Builders | No company recorded',
     'banded by firm, alphabetically, with the unattributed ones last — got '+bands.join(' | '));
  ok(out.indexOf('<span class="cdb-n">2</span>')>=0, 'each band counts its own');
  ok((out.match(/class="x"/g)||[]).length===4, 'and every row is still there');
  ok(out.indexOf('class="x">0<')<out.indexOf('class="x">2<'), 'rows stay in order within a firm');
}
{
  const P=boot([]);
  const one=[{r:{'Company':'Summit Builders'},idx:0},{r:{'Company':'Summit Builders'},idx:1}];
  const out=P.run(`pastByCompany(${JSON.stringify(one)}, 9, e=>'<tr class="x">'+e.idx+'</tr>')`);
  ok(out.indexOf('cd-band')<0, 'one firm on the project is not banded — the heading would say nothing');
  ok((out.match(/class="x"/g)||[]).length===2, 'while the rows are all shown');
}

console.log('Change orders now have somewhere to go');
{
  const c=html.slice(html.indexOf('function renderCOs()'), html.indexOf('function renderSubmittals'));
  ok(/splitByArchived\(all,'Date Submitted'\)/.test(c), 'the change order log splits archived out');
  // Anchored to the start of the line: a mutant that wrapped the call in a
  // condition would still satisfy a bare substring match.
  ok(/\n  renderPastPanel\('co','section-cos','Past Change Orders', past, 10,/.test(c),
     'into a Past panel of its own, unconditionally');
  ok(/countFooter\(live\.length, all\.length, 'change order'\)/.test(c),
     'and the count reads "1 of 3" rather than counting the archived as live');
  ok(/archiveBtn\('co',idx,r\)/.test(c), 'with a restore control on each archived row');
}

console.log('Where the button appears, and that it stays there');
{
  // The title row is space-between, so it spreads however many children it is
  // given. Dropping the Archive button in beside + New RFI made three, and the
  // two buttons flew to opposite ends with New RFI stranded in the middle.
  ok(/\.pt-actions\{display:inline-flex/.test(html),
     'the controls at the end of a title row are grouped');
  const titleRows=[...html.matchAll(/<div class="page-title-row"[^>]*>([\s\S]*?)\n\s*<\/div>/g)].map(m=>m[1]);
  titleRows.forEach(row=>{
    if(row.indexOf('arch-all-')<0) return;
    // Count top-level children: a wrapper, or an existing flex group, but never
    // a loose button and a loose span side by side.
    const loose = /<\/button><span id="arch-all-/.test(row) && row.indexOf('pt-actions')<0
                  && !/display:flex/.test(row);
    ok(!loose, 'and no title row leaves the Archive button as a bare third child');
  });
}
console.log('Where the button appears');
for(const [key,sec] of [['rfi','section-rfis'],['co','section-cos'],['sub','section-submittals']]){
  const i=html.indexOf('id="'+sec+'"');
  const j=html.indexOf('<div class="panel"', i);
  ok(html.slice(i,j).indexOf('id="arch-all-'+key+'"')>=0, key+' has a slot in its heading row');
  ok(html.indexOf("arch-all-"+key+"'); if(b) b.innerHTML=archiveAllBtnHTML('"+key+"')")>=0,
     'and it is filled as the log is drawn, so the count follows the data');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-bulkarchive.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
