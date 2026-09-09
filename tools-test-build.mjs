// The page says which build it is.
//
// Several rounds of "it still looks the same" this week were a cached page
// rather than a fault, and there was no way to tell those apart from the
// outside — including for me, which is why I twice diagnosed a caching problem
// as a deploy problem and once the reverse.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/const BUILD_STAMP='\d{4}-\d{2}-\d{2} \d{2}:\d{2}'/.test(html), 'there is a build stamp, in a readable form');
ok(/id="sf-build"/.test(html), 'the footer has somewhere to show it');
ok(/showBuildStamp\(\)/.test(html.split('function setFooterYear')[1].split('\n}')[0]),
   'and it is filled in when the footer is drawn, which happens on every load');
{
  const c = html.split('function showBuildStamp()')[1].split('function fmtPhone')[0];
  ok(/console\.log/.test(c), 'it is also logged, so it can be read without hunting for it');
  ok(/'build '\+BUILD_STAMP/.test(c), 'and labelled');
}
ok(/reload with Cmd\+Shift\+R/.test(html), 'the tooltip says what to do about a stale one');

// It actually renders.
const b = bootPage('index.html');
b.run(SEED);
b.ctx.setFooterYear();
ok(/^build \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(b.run("document.getElementById('sf-build').textContent")),
   'and the footer shows it after a load');

console.log((bad?'FAIL':'ok  '),' tools-test-build.mjs —',n,'assertions');
process.exit(bad?1:0);
