// Phone formatting. The important property is that anything unrecognised is
// left ALONE — mangling an international number or an extension is worse than
// leaving it unformatted.
function fmtPhone(v){
  const raw=String(v==null?'':v).trim();
  if(!raw) return '';
  if(/[a-zA-Z]/.test(raw)) return raw;
  const d=raw.replace(/[^0-9]/g,'');
  if(raw.trim().startsWith('+') && d.length>11) return raw;
  if(d.length===10) return '('+d.slice(0,3)+') '+d.slice(3,6)+'-'+d.slice(6);
  if(d.length===11 && d[0]==='1') return '('+d.slice(1,4)+') '+d.slice(4,7)+'-'+d.slice(7);
  if(d.length===7) return d.slice(0,3)+'-'+d.slice(3);
  return raw;
}
let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

ck('bare 10 digits', fmtPhone('7173140606')==='(717) 314-0606', fmtPhone('7173140606')+'  <-- the case reported');
ck('dashed', fmtPhone('717-314-0606')==='(717) 314-0606');
ck('dotted', fmtPhone('717.314.0606')==='(717) 314-0606');
ck('spaced', fmtPhone('717 314 0606')==='(717) 314-0606');
ck('already formatted is unchanged', fmtPhone('(717) 555-0165')==='(717) 555-0165');
ck('leading US country code', fmtPhone('1 717 314 0606')==='(717) 314-0606');
ck('+1 country code', fmtPhone('+1 (717) 314-0606')==='(717) 314-0606');
ck('seven digits', fmtPhone('3140606')==='314-0606');

console.log('\n  left alone:');
ck('international untouched', fmtPhone('+44 20 7946 0958')==='+44 20 7946 0958');
ck('extension untouched', fmtPhone('717-314-0606 ext 12')==='717-314-0606 ext 12');
ck('"cell" note untouched', fmtPhone('717-314-0606 cell')==='717-314-0606 cell');
ck('odd digit count untouched', fmtPhone('12345')==='12345');
ck('empty stays empty', fmtPhone('')==='');
ck('null safe', fmtPhone(null)==='');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
