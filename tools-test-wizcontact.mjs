// Directory suggestions on the wizard contact rows and the Onsite CM fields.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// The datalist approach is gone — Chrome put its own autofill on those fields.
// Other fields in the app use a datalist and are left alone; what matters is
// that the three added for directory suggestions are gone.
ok(!/id="dir-names"/.test(html) && !/id="dir-emails"/.test(html) && !/id="fidevia-people"/.test(html),
   'the three suggestion datalists are gone');
ok(!/list="dir-names"/.test(html) && !/list="fidevia-people"/.test(html), 'no list= attributes remain');
ok(!/function wizContactLookup/.test(html), 'the datalist-era lookup is gone');

ok(/function dirSuggest/.test(html), 'the dropdown exists');
ok(/function dirPick/.test(html) && /function dirKey/.test(html) && /function dirClose/.test(html),
   'pick, keyboard and close are all present');

// wiring
ok(/class="ct-name" oninput="dirSuggest\(this,\\'name\\'\)"/.test(html), 'the name field is wired');
ok(/class="ct-email" oninput="dirSuggest\(this,\\'email\\'\)"/.test(html), 'the email field is wired');
ok(/id="np-cm"[^>]*dirSuggest\(this,'name',\{fideviaOnly:true\}\)/.test(html), 'wizard Onsite CM is Fidevia-only');
ok(/id="ps-cm"[^>]*dirSuggest\(this,'name',\{fideviaOnly:true\}\)/.test(html), 'settings Onsite CM is Fidevia-only');
ok((html.match(/onkeydown="dirKey\(event,this\)"/g)||[]).length===4, 'all four fields take the keyboard');
ok((html.match(/onblur="setTimeout\(dirClose,120\)"/g)||[]).length===4,
   'blur closes on a delay so a click on the list still lands');
ok(/mousedown/.test(html.split('function dirSuggest')[1].split('function dirPaint')[0]),
   'selection is on mousedown, which beats blur');

const m = html.split('function dirMatches')[1].split('function dirSuggest')[0];
ok(/s\.length<2/.test(m), 'one character does not open the list');
ok(/opts&&opts\.fideviaOnly/.test(m), 'the Fidevia-only filter is honoured');
ok(/\.slice\(0,8\)/.test(m), 'the list is capped');
ok(/starts\.concat\(contains\)/.test(m), 'prefix matches rank above substring matches');

const pk = html.split('function dirPick')[1].split('window.addEventListener')[0];
ok(/!f\.value\.trim\(\)/.test(pk), 'only blank fields are written');
ok(/if\(!row\)\{/.test(pk), 'a standalone field takes just the name');
ok(/Filled in from the contact directory/.test(pk), 'the row says where the values came from');

// matching behaviour, run for real
{
  const CD_PICK=[
    {name:'Angie Luvsan', email:'aluvsan@fidevia.com', company:'Fidevia', role:'Director of Finance', phone:'7173140606'},
    {name:'Andre Martin', email:'amartin@fidevia.com', company:'Fidevia', role:'Onsite Construction Manager', phone:''},
    {name:'Aisha Rahman', email:'arahman@keystone-demo.test', company:'Keystone Engineering', role:'MEP Engineer', phone:''},
    {name:'Chris Celmer', email:'consultcjc@gmail.com', company:'Summit Builders', role:'Tester', phone:''}
  ];
  const FID=/@fidevia\.com$/i;
  const match=(q,opts)=>{
    const s=q.trim().toLowerCase(); if(s.length<2) return [];
    let pool=CD_PICK;
    if(opts&&opts.fideviaOnly) pool=pool.filter(c=>FID.test(String(c.email||'').trim()));
    const hit=c=>((c.name||'')+' '+(c.company||'')+' '+(c.email||'')).toLowerCase().includes(s);
    const starts=[], contains=[];
    pool.filter(hit).forEach(c=>{ (String(c.name||'').toLowerCase().startsWith(s)?starts:contains).push(c); });
    return starts.concat(contains).slice(0,8);
  };
  // the exact thing that failed in the screenshot
  ok(match('Ang').length===1 && match('Ang')[0].name==='Angie Luvsan',
     '"Ang" finds Angie Luvsan (got '+JSON.stringify(match('Ang').map(c=>c.name))+')');
  ok(match('Chri')[0].name==='Chris Celmer', '"Chri" finds Chris Celmer');
  ok(match('A').length===0, 'a single letter returns nothing');
  ok(match('summit')[0].name==='Chris Celmer', 'company text matches too');
  ok(match('keystone-demo')[0].name==='Aisha Rahman', 'email text matches too');
  ok(match('a', {fideviaOnly:true}).length===0, 'the Fidevia filter still respects the minimum length');
  ok(match('ar', {fideviaOnly:true}).every(c=>FID.test(c.email)),
     'the Onsite CM list never offers an outside contact');
  ok(match('ar').some(c=>c.name==='Aisha Rahman'), 'without the filter, outside contacts are offered');
  // ranking
  {
    const r=match('an').map(c=>c.name);
    ok(r[0]==='Andre Martin' || r[0]==='Angie Luvsan', 'a name beginning with the text ranks first (got '+r.join(', ')+')');
  }
  ok(match('  ').length===0, 'whitespace alone opens nothing');
}

// ── the Onsite CM fields, folded in from the datalist-era test ──
ok(!/placeholder="e\.g\. Andre Martin"/.test(html), 'the hard-coded example name is gone');
ok(!/<select[^>]*np-cm/.test(html), 'the wizard Onsite CM is still an input, not a dropdown');
ok(/const FIDEVIA_EMAIL=\/@fidevia\\\.com\$\/i/.test(html), 'Fidevia is recognised by email domain');
{
  const lf = html.split('async function loadFideviaPeople')[1].split('async function cdPickLoad')[0];
  ok(/if\(!CD_PICK\.length\)/.test(lf), 'the directory is fetched once and reused');
  ok(/catch\(e\)\{ CD_PICK=\[\]; \}/.test(lf), 'a failed fetch leaves an empty list rather than throwing');
  ok(!/company/i.test(lf), 'the free-text company field is not used to decide who is Fidevia');
}
{
  const ds = html.split('async function dirSuggest')[1].split('function dirPaint')[0];
  ok(/if\(!CD_PICK\.length\)\{ try\{ await loadFideviaPeople/.test(ds),
     'typing before the directory has loaded fetches it rather than showing nothing');
  ok(/if\(document\.activeElement!==el\) return;/.test(ds),
     'a list is not opened under a field the user has already left');
}
ok(/wizFillJobNumber\(\); loadFideviaPeople\(\);/.test(html), 'the directory is warmed when the wizard opens');
{
  const fps = html.split('function fillProjectSettings')[1].slice(0, 900);
  ok(/loadFideviaPeople\(\)/.test(fps), 'and when the settings pane opens');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-wizcontact.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
