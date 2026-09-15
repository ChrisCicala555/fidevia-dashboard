// "Owner should not see any payment application until it becomes a final copy."
//
// A pencil copy is a draft: the contractor and Fidevia work it out between them
// and the architect marks it up. The owner is the party being asked to pay, and
// should not see a figure until it is the figure being asked for.
//
// The owner's grant lets them read the whole payment applications log, so
// hiding the rows in the browser would leave them in the payload. This is the
// server's copy of the rule.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const srv = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const html = fs.readFileSync('index.html','utf8');

console.log('The rule exists, server-side');
{
  ok(/const PENCIL_HIDDEN_FROM = \{ 'Payment Applications\.csv': ROLE_OWNER \}/.test(srv),
     'pencil copies are withheld from the owner, and only the owner');
  ok(/function rowIsPencil/.test(srv), 'with one place deciding what counts as a pencil');
  ok(/rows = rows\.filter\(x => !rowIsPencil\(x\['Copy Type'\]\)\)/.test(srv),
     'and the rows are dropped from the payload rather than hidden on screen');
}

console.log('It runs even when nothing else filters that file');
{
  const f=srv.slice(srv.indexOf('const priv = PRIVATE_CSV[filename];'));
  const body=f.slice(0, f.indexOf('return toCSVServer')+40);
  ok(/if \(!priv && !vis && !hidePencil\) return text;/.test(body),
     'the early return accounts for it, or the filter below would never run');
  ok(body.indexOf('hidePencil = PENCIL_HIDDEN_FROM')>=0 ||
     srv.indexOf('const hidePencil = PENCIL_HIDDEN_FROM[filename] === r0;')>=0,
     'and it is decided from the caller’s role');
}

console.log('What counts as a pencil');
{
  // Extracted and run, since the wording of the column is what the whole rule
  // turns on.
  const src=srv.slice(srv.indexOf('function rowIsPencil'), srv.indexOf('\n}', srv.indexOf('function rowIsPencil'))+2);
  const rowIsPencil=new Function(src+'\nreturn rowIsPencil;')();
  ok(rowIsPencil('Pencil')===true, 'Pencil');
  ok(rowIsPencil('pencil')===true, 'in any case');
  ok(rowIsPencil('  Pencil  ')===true, 'and with stray spacing');
  ok(rowIsPencil('Final')===false, 'a final is not');
  ok(rowIsPencil('')===false, 'and neither is a blank');
  ok(rowIsPencil(undefined)===false, 'nor an absent column');
  ok(rowIsPencil(null)===false, 'nor a null');
}

console.log('Rows filed before any of this');
{
  const src=srv.slice(srv.indexOf('function rowIsPencil'), srv.indexOf('\n}', srv.indexOf('function rowIsPencil'))+2);
  const rowIsPencil=new Function(src+'\nreturn rowIsPencil;')();
  ok(rowIsPencil(undefined)===false,
     'an application filed before the pencil cycle has no copy type and is treated as a final, '
     +'so nothing already submitted disappears from the owner');
}

console.log('The column exists to be filtered on');
{
  const m=html.match(/pay_apps: \{folder:'09 - Payment Applications'[^\n]*headers:\[([^\]]*)\]/);
  ok(!!m, 'the module declares its headers');
  const hs=m[1].split(',').map(x=>x.trim().replace(/^'|'$/g,''));
  ok(hs.includes('Copy Type'), 'including Copy Type');
  ok(hs.indexOf('Copy Type')<hs.indexOf('Period'), 'early in the row, beside who it is from');
  ok(hs.includes('App #') && hs.includes('Contractor'), 'and nothing was displaced');
}

console.log('Nobody else is affected');
{
  ok(!/PENCIL_HIDDEN_FROM\[[^\]]*\] === ROLE_CONTRACTOR/.test(srv), 'contractors still see their own pencils');
  const keys=(srv.match(/const PENCIL_HIDDEN_FROM = \{([^}]*)\}/)||['',''])[1];
  ok(keys.split(',').length===1, 'one file is covered, not a sweeping rule — got '+keys.trim());
  ok(!/Contractor Daily Reports\.csv': ROLE_OWNER/.test(keys), 'and not the daily reports');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-pencilowner.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
