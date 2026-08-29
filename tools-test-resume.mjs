// Refreshing inside a project dropped you at the picker, because nothing
// recorded which project was open. On a phone that is pull-to-refresh, so it
// happened by accident constantly.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('The open project is recorded');
ok('opening a project writes it to the address', /history\.replaceState\(\{app:1,screen:'screen-dashboard',p:String\(folderId\)\}, '', '#p='/.test(src));
ok('it replaces rather than pushes',             !/history\.pushState\([^)]*'#p='/.test(src));
ok('the id is encoded',                          /encodeURIComponent\(folderId\)/.test(src));

console.log('And cleared when leaving one');
ok('leaving the dashboard clears it', /if\(id!=='screen-dashboard'\)\{ try\{ clearProjectHash\(\); \}/.test(src));
ok('going back clears it too',        /clearProjectHash\(\);\s*\n\s*showScreen\('screen-picker'\)/.test(src));
const cl=grab('function clearProjectHash');
ok('it only touches its own hash',    /location\.hash\.startsWith\('#p='\)/.test(cl));

console.log('Reading it back');
const pf=grab('function projectFromHash');
ok('the pattern is anchored',         /\^#p=\(\[\^&\]\+\)\$/.test(pf));
ok('and decoded',                     /decodeURIComponent/.test(pf));

console.log('Resuming');
ok('it resolves against what the person may see', /PICKER_PROJECTS\.find\(p=>String\(p\.id\)===String\(want\)\)/.test(src));
// A borrowed or stale link must not become a way in.
ok('an unknown project falls back to the picker', /if\(hit\) return openProject\(hit\.id, hit\.name\);\s*\n\s*clearProjectHash\(\);/.test(src));
ok('it happens after the list has loaded',
   src.indexOf('renderPickerGrid();') < src.indexOf('const want=projectFromHash()'));
ok('only on the first load',          /if\(want && !_resumed\)/.test(src));
// Otherwise Switch Project would bounce straight back into the project.
ok('the flag is set before opening',  /_resumed=true;\s*\n\s*const hit=/.test(src));
ok('and explained',                   /deliberately going to the picker should/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
