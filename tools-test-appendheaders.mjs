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

import { execSync } from 'child_process';
execSync('node tools-extract-filters.mjs', { cwd: process.cwd() });
const S = await import('./.filters.tmp.mjs');
// The server's own function, not a copy of it. An earlier version of this test
// reimplemented the logic and then asserted against the copy — so mutating the
// server changed nothing and two faults went unnoticed.
const append = S.csvAppend;
const parse = (t)=>{ const lines=String(t).replace(/\r/g,'').split('\n').filter(l=>l.length);
  const cut=(l)=>{ const out=[]; let cur='', q=false;
    for(let i=0;i<l.length;i++){ const c=l[i];
      if(c==='"'){ if(q&&l[i+1]==='"'){cur+='"';i++;} else q=!q; }
      else if(c===','&&!q){ out.push(cur.trim()); cur=''; } else cur+=c; }
  out.push(cur.trim()); return out; };
  const headers=cut(lines[0]||'');
  return { headers, rows: lines.slice(1).map(l=>{ const v=cut(l), o={};
    headers.forEach((h,k)=>o[h]=v[k]!==undefined?v[k]:''); return o; }) }; };

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

console.log('A file written with Windows line endings is not rewritten every time');
{
  // Box hands back whatever was uploaded. A stray carriage return on the header
  // made it compare unequal to the caller's, so every append rewrote the whole
  // file - correct output, but the entire log rewritten on each submission.
  const crlf = NEW.join(',')+'\r\n'+'PA-001,Summit,Summit,GC,Final,Sept,Approved\r\n';
  const out=append(crlf, NEW, fresh);
  // The discriminator: appending leaves the file's own bytes alone, so the
  // carriage returns survive. Rewriting normalises them away, which is how you
  // can tell the whole log was rebuilt when it did not need to be.
  ok(out.indexOf('\r')>=0, 'the file\u2019s own line endings survive, so it was appended to, not rebuilt');
  ok(out.indexOf(NEW.join(','))===0, 'and the header is where it was');
  ok((out.match(/PA-001/g)||[]).length===1, 'the existing row appears once, not rewritten and re-added');
  const p=parse(out);
  ok(p.rows.length===2, 'two rows');
  ok(p.rows[1]['Trade']==='GC', 'and the new one still records its contract');
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

console.log('And the op uses it, rather than a second copy of it');
ok(/out = csvAppend\(cr\.ok \? await cr\.text\(\) : '', headers, row\);/.test(src),
   'appending to a file that exists goes through csvAppend');
ok(/out = csvAppend\('', headers, row\);/.test(src), 'and so does creating one');
ok((src.match(/function csvAppend/g)||[]).length===1, 'there is one implementation of it');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
