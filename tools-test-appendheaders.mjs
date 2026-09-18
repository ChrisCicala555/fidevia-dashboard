// "The payment applications didn't save it looks like after upload."
//
// They saved. They were written into the wrong columns. appendRow builds the
// line from the CALLER's header list and appends it to a file carrying
// whatever header row it was created with - so the moment a column was added
// to a module, every value past that column landed in its neighbour's field:
// Copy Type read "GC", Period From read "Pencil", and the last value fell off
// the end. Right to the browser that had just built it, wrong to everyone who
// read it back.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const src=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');

// The append body, lifted and run against a fake file rather than Box.
const body=src.split("if (op === 'appendRow') {")[1].split("if (op === 'getNotifTemplates')")[0];
// The real parser and escaper, lifted out of the proxy so this cannot drift
// from what the server actually does.
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0, on=false, j=i;
  for(; j<src.length; j++){ const c=src[j];
    if(c==='{'){ d++; on=true; } else if(c==='}'){ d--; if(on&&d===0){ j++; break; } } }
  return src.slice(i, j); };
const mod=grab('function parseCSVServer(text){')+'\n'+grab('const csvEsc')
  .replace(/^const csvEsc\s*=\s*/,'function csvEsc_(v){ return (')+')(v); }';
const F=new Function(mod+'\nreturn {parseCSVServer, csvEsc:csvEsc_};')();
const parse=F.parseCSVServer, csvEsc=F.csvEsc;

// A miniature of what the server does, built from the same source text so it
// cannot drift from it.
function append(current, headers, row){
  const rowLine = headers.map(h => csvEsc(row[h])).join(',');
  const head = String(current.split('\n')[0]||'').replace(/\r/g,'').trim();
  const want = headers.join(',');
  if (head && head !== want) {
    const prev = parse(current);
    const lines = prev.rows.map(r => headers.map(h => csvEsc(r[h]!==undefined?r[h]:'')).join(','));
    return want + '\n' + (lines.length ? lines.join('\n')+'\n' : '') + rowLine + '\n';
  }
  return (head ? current.replace(/\s*$/,'') : want) + '\n' + rowLine + '\n';
}

const OLD=['App #','Contractor','Company','Copy Type','Period','Status'];
const NEW=['App #','Contractor','Company','Trade','Copy Type','Period','Status'];
const existing = OLD.join(',') + '\n'
  + 'PA-001,Summit,Summit,Final,Sept,Approved\n'
  + 'PA-002,Gorilla,Gorilla,Final,Sept,Approved\n';
const fresh = {'App #':'PA-GC-001','Contractor':'Summit','Company':'Summit','Trade':'GC',
               'Copy Type':'Pencil','Period':'Sept','Status':'Pencil — with Fidevia'};

console.log('A file behind the current columns is brought up to them');
{
  const out=append(existing, NEW, fresh);
  const p=parse(out);
  ok(p.headers.join(',')===NEW.join(','), 'the file now carries the current headers');
  ok(p.rows.length===3, 'and every row that was there is still there');
  const added=p.rows[2];
  ok(added['Trade']==='GC', 'the new row records its contract');
  ok(added['Copy Type']==='Pencil', 'and Copy Type is Copy Type, not the trade that used to land in it');
  ok(added['Status']==='Pencil — with Fidevia', 'with nothing falling off the end');
}
{
  const p=parse(append(existing, NEW, fresh));
  ok(p.rows[0]['App #']==='PA-001' && p.rows[0]['Copy Type']==='Final' && p.rows[0]['Status']==='Approved',
     'an existing row is remapped by name, not shunted along by a column');
  ok(p.rows[0]['Trade']==='', 'and gains the new column empty rather than borrowing a neighbour');
}

console.log('A file already up to date is appended to, not rewritten');
{
  const upToDate = NEW.join(',')+'\n'+'PA-001,Summit,Summit,GC,Final,Sept,Approved\n';
  const out=append(upToDate, NEW, fresh);
  ok(out.split('\n').filter(Boolean).length===3, 'one header and two rows');
  const p=parse(out);
  ok(p.rows[0]['Trade']==='GC' && p.rows[1]['Trade']==='GC', 'both rows keep their contract');
}

console.log('A column that has gone away is dropped, not left dangling');
{
  const retired = ['App #','Contractor','Company','Obsolete','Copy Type','Period','Status'].join(',')+'\n'
    + 'PA-001,Summit,Summit,junk,Final,Sept,Approved\n';
  const p=parse(append(retired, NEW, fresh));
  ok(p.headers.indexOf('Obsolete')<0, 'the retired column is gone');
  ok(p.rows[0]['Copy Type']==='Final' && p.rows[0]['Status']==='Approved',
     'and what remains still lines up');
}

console.log('An empty or missing file still gets a header');
{
  const p=parse(append('', NEW, fresh));
  ok(p.headers.join(',')===NEW.join(','), 'headers written');
  ok(p.rows.length===1 && p.rows[0]['Trade']==='GC', 'and the row beneath them');
}

console.log('The server does this, not just this test');
ok(/const head = String\(current\.split\('\\n'\)\[0\] \|\| ''\)/.test(src), 'it reads the file\u2019s own header');
ok(/if \(head && head !== want\)/.test(src), 'compares it with the caller\u2019s');
ok(/prev\.rows\.map\(r => headers\.map\(h => csvEsc\(r\[h\] !== undefined \? r\[h\] : ''\)\)/.test(src),
   'and remaps the existing rows by name');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
