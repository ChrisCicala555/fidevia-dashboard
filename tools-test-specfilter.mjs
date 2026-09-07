// The spec section list covers the standard, and the submittal log can be
// narrowed to a division or a section.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── the list ──
const dl = html.split('<datalist id="csi-list">')[1].split('</datalist>')[0];
const opts = [...dl.matchAll(/<option value="([^"]+)">/g)].map(m=>m[1]);
ok(opts.length > 550, 'the list is comprehensive, not a shortlist ('+opts.length+' sections)');
ok(new Set(opts).size === opts.length, 'no section is listed twice');
opts.forEach(o => { if(!/^\d{2} \d{2} \d{2} \S/.test(o)) { ok(false, 'badly formed entry: '+o); } });
ok(true, 'every entry is a six-digit code followed by a title');
const divs = [...new Set(opts.map(o=>o.slice(0,2)))].sort();
ok(divs.length === 35, 'all 35 active divisions are represented ('+divs.length+')');
// CSI reserves these numbers; they hold no sections, so their absence is correct.
['15','16','17','18','19','20','24','29','30','36','37','38','39','47','49']
  .forEach(d => ok(divs.indexOf(d) < 0, 'division '+d+' is reserved and correctly absent'));
// The divisions that were missing entirely before.
['13','25','34','35','40','41','42','43','44','45','46','48']
  .forEach(d => ok(divs.indexOf(d) >= 0, 'division '+d+' is present, having been absent'));
// Sections that were missing from divisions we already had.
['03 20 00','07 41 00','08 30 00','09 30 00','23 09 00','01 33 00']
  .forEach(c => ok(opts.some(o=>o.startsWith(c)), c+' is listed'));
ok(opts.some(o=>o.startsWith('23 09 00')),
   'including the one the sample submittal in the email templates cites');
// Nothing the old 54-entry list offered may quietly vanish -- somebody may
// have filed against it. The single exception is 00 00 00, which is not a
// MasterFormat number at all; 00 01 00 is the real one and it is listed.
['01 11 00','02 41 00','03 30 00','04 20 00','05 10 00','05 30 00','05 40 00','05 50 00',
 '06 10 00','06 20 00','07 21 00','07 31 00','07 54 00','07 62 00','07 84 00','07 92 00',
 '08 11 00','08 14 00','08 40 00','08 50 00','08 71 00','08 80 00','09 21 00','09 22 00',
 '09 29 00','09 51 00','09 65 00','09 68 00','09 90 00','10 14 00','10 21 00','10 28 00',
 '11 10 00','12 20 00','14 20 00','21 10 00','22 10 00','22 40 00','23 05 00','23 07 00',
 '23 31 00','23 74 00','26 05 00','26 05 19','26 20 00','26 50 00','27 10 00','28 10 00',
 '31 10 00','31 20 00','32 10 00','32 90 00','33 10 00']
  .forEach(c => ok(opts.some(o=>o.startsWith(c)), c+' survived the rewrite'));
ok(!opts.some(o=>o.startsWith('00 00 00')) && opts.some(o=>o.startsWith('00 01 00')),
   'and the one dropped code is replaced by the real section number');
ok(opts.every(o=>!/^32 20 00/.test(o)), 'no invented section numbers');
{
  const c = html.split('const CSI_DIVISIONS=')[1].split('function specDivision')[0];
  ok(/'13':/.test(c) && /'48':/.test(c), 'the division names cover the same range');
  ok(!/'15':/.test(c), 'and do not invent names for reserved numbers');
}
ok(/reserved by CSI and hold no sections/.test(html), 'and the gap is explained rather than looking like an oversight');

// ── the filter ──
ok(/id="sub-spec-filter"/.test(html), 'the submittals panel carries a picker');
ok(/onchange="setSpecFilter\(this\.value\)"/.test(html), 'which drives the filter');
{
  const c = html.split('function specMatchesFilter(r)')[1].split('function buildSpecFilterOptions')[0];
  ok(/if\(!f\) return true;/.test(c), 'no filter shows everything');
  ok(/f\.slice\(-1\)===':'/.test(c), "a trailing colon means a whole division");
  ok(/return code===f;/.test(c), 'otherwise it is one section exactly');
  ok(/return !String\(r\['Spec Section'\]\|\|''\)\.trim\(\)/.test(c),
     'and rows with no section are reachable rather than stranded');
}
{
  const c = html.split('function buildSpecFilterOptions(rows)')[1].split('function renderSubmittals')[0];
  ok(/optgroup label/.test(c), 'options are grouped by division');
  ok(/Object\.keys\(secs\)\.length>1/.test(c),
     'and a division holding one section does not offer a redundant All');
  ok(/\('\+secs\[code\]\.n\+'\)/.test(c), 'each option says how many it holds');
  ok(/!\[\.\.\.sel\.options\]\.some\(o=>o\.value===SUB_SPEC_FILTER\)/.test(c),
     'a filter whose rows have gone falls back to All rather than showing nothing');
  ok(/Object\.keys\(byDiv\)\.sort\(\)/.test(c), 'divisions are in numeric order');
}
{
  const c = html.split('function renderSubmittals()')[1].split('function renderDailyLogs')[0];
  ok(/buildSpecFilterOptions\(rows\)/.test(c),
     'the picker is built from every live row, not from what survived the filter');
  ok(/const shown=live\.filter\(\(\{r\}\)=>specMatchesFilter\(r\)\)/.test(c), 'the table shows what matches');
  ok(/No submittals under that spec section/.test(c), 'an empty result says why it is empty');
  ok(/setSpecFilter\(\\'\\'\)/.test(c), 'and offers a way back');
  ok(/countFooter\(shown\.length, all\.length/.test(c), 'the count reflects the filter');
}
ok(/SUB_SPEC_FILTER=''/.test(html.split('function openProject')[1]||html),
   'the filter is cleared with the project');
ok((html.match(/SUB_SPEC_FILTER='';/g)||[]).length>=3,
   'in every place the project context is torn down');

console.log((bad?'FAIL':'ok  '),' tools-test-specfilter.mjs —',n,'assertions');
process.exit(bad?1:0);
