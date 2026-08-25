// The presentation helpers behind the RFI / CO / Submittal tables.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

fs.writeFileSync('.ts.tmp.mjs', [
  "const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');",
  "let allData={contacts:[{Name:'Sarah Draper',Company:'Draper & Associates'},{Name:'Aisha Rahman',Company:'Keystone Engineering'}]};",
  grab('function twoLine'), grab('function firmOf'), grab('function specParts'),
  grab('function fileKind'),
  "export { twoLine, firmOf, specParts, fileKind };"
].join('\n'));
const { twoLine, firmOf, specParts, fileKind } = await import('./.ts.tmp.mjs');

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('Two-line cells');
ok('shows both lines',           twoLine('SUB-002','Fidevia').includes('cell-sub') && twoLine('SUB-002','Fidevia').includes('Fidevia'));
ok('omits an empty second line', !twoLine('SUB-002','').includes('cell-sub'));
ok('omits a null second line',   !twoLine('SUB-002',null).includes('cell-sub'));
// Repeating the same value twice is noise, not information.
ok('omits a duplicate second line', !twoLine('Fidevia','Fidevia').includes('cell-sub'));
ok('duplicate check ignores case',  !twoLine('Fidevia','fidevia').includes('cell-sub'));
ok('blank primary shows a dash',    twoLine('','Acme').includes('—'));
ok('escapes the primary',           twoLine('<b>x</b>','').includes('&lt;b&gt;'));
ok('escapes the secondary',         twoLine('a','<img>').includes('&lt;img&gt;'));

console.log('Firm lookup');
ok('finds a known contact',      firmOf('Sarah Draper')==='Draper & Associates');
ok('is case insensitive',        firmOf('sarah draper')==='Draper & Associates');
ok('tolerates padding',          firmOf('  Sarah Draper  ')==='Draper & Associates');
ok('unknown name yields blank',  firmOf('Nobody At All')==='');
ok('empty name yields blank',    firmOf('')==='');
ok('null name yields blank',     firmOf(null)==='');

console.log('Spec sections');
const eq=(n,a,b)=>ok(n+'  (got '+JSON.stringify(a)+')', JSON.stringify(a)===JSON.stringify(b));
eq('spaced code and name',   specParts('09 51 00 Acoustical Ceilings'), {code:'09 51 00', name:'Acoustical Ceilings'});
eq('hyphen separator',       specParts('32 90 00 - Planting'),          {code:'32 90 00', name:'Planting'});
eq('en dash separator',      specParts('02 41 00 – Demolition'),   {code:'02 41 00', name:'Demolition'});
eq('colon separator',        specParts('23 09 00: Controls'),           {code:'23 09 00', name:'Controls'});
eq('code only',              specParts('08 71 00'),                     {code:'08 71 00', name:''});
eq('unparseable stays whole',specParts('Division 9 stuff'),             {code:'Division 9 stuff', name:''});
eq('empty is safe',          specParts(''),                             {code:'', name:''});
eq('null is safe',           specParts(null),                           {code:'', name:''});

console.log('File icons');
ok('pdf',           fileKind('SUB-003 - document.pdf')==='pdf');
ok('uppercase PDF', fileKind('REPORT.PDF')==='pdf');
ok('png is image',  fileKind('images.png')==='img');
ok('jpg is image',  fileKind('site.JPG')==='img');
ok('heic is image', fileKind('photo.heic')==='img');
ok('docx is doc',   fileKind('notes.docx')==='doc');
ok('no extension',  fileKind('README')==='doc');
ok('empty is doc',  fileKind('')==='doc');
ok('dots in name',  fileKind('Notes on Dashboard 7-27-26.pdf')==='pdf');

console.log('Wiring');
for(const id of ['RFI-count','changeorder-count','submittal-count']) ok(id+' exists', html.includes('id="'+id+'"'));
ok('RFIs report their count',       /countFooter\(live\.length, all\.length, 'RFI'\)/.test(src));
ok('submittals report their count', /countFooter\(live\.length, all\.length, 'submittal'\)/.test(src));
ok('empty logs still report',       (src.match(/countFooter\(0,/g)||[]).length===3);
ok('actions stayed inline',         src.includes("archiveBtn('sub',i,r)+delBtn('sub',i)"));

fs.rmSync('.ts.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
