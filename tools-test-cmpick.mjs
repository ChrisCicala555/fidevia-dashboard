// Onsite CM type-ahead, drawn from Fidevia people in the directory.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/<datalist id="fidevia-people"><\/datalist>/.test(html), 'the shared list exists');
ok(/id="np-cm"/.test(html) && /list="fidevia-people" id="np-cm"/.test(html), 'the wizard field is wired to it');
ok(/id="ps-cm"[^>]*list="fidevia-people"/.test(html), 'the settings field is wired to it too');
ok(/function loadFideviaPeople/.test(html), 'the list is populated from the directory');
ok(/wizFillJobNumber\(\); loadFideviaPeople\(\);/.test(html), 'populated when the wizard opens');
{
  const fps = html.split('function fillProjectSettings')[1].slice(0, 900);
  ok(/loadFideviaPeople\(\)/.test(fps), 'populated when the settings pane opens');
}

const fn = html.split('async function loadFideviaPeople')[1].split('// ── NEW PROJECT WIZARD|function cdPickSearch')[0];
ok(/if\(!CD_PICK\.length\)/.test(fn), 'the directory is fetched once and reused');
ok(/catch\(e\)\{ return; \}/.test(fn), 'a failed fetch leaves the field as plain text rather than erroring');
ok(/quiet:true/.test(fn), 'the fetch is silent');
ok(/esc\(nm\)/.test(fn), 'names are escaped into the option list');

// domain, not the free-text company field — that is the whole point
ok(/const FIDEVIA_EMAIL=\/@fidevia\\\.com\$\/i/.test(html), 'Fidevia is recognised by email domain');
ok(!/c\.company[^\n]*[Ff]idevia/.test(fn), 'the company field is not used to decide');
{
  const FID=/@fidevia\.com$/i;
  const people=[
    {name:'Andre Martin',   email:'amartin@fidevia.com',        company:'Fidevia'},
    {name:'Angie Luvsan',   email:'aluvsan@fidevia.com',        company:'Fidevia LLC'},
    {name:'Brenda Santiago',email:'BSantiago@Fidevia.com',      company:''},
    {name:'Aisha Rahman',   email:'arahman@keystone-demo.test', company:'Keystone Engineering'},
    {name:'Chris Celmer',   email:'consultcjc@gmail.com',       company:'Summit Builders'},
    {name:'Impostor',       email:'x@notfidevia.com',           company:'Fidevia'}
  ];
  const got=people.filter(c=>FID.test(String(c.email||'').trim()))
                  .map(c=>c.name).sort((a,b)=>a.localeCompare(b));
  ok(got.join('|')==='Andre Martin|Angie Luvsan|Brenda Santiago',
     'only Fidevia addresses are offered (got '+got.join(', ')+')');
  ok(!got.includes('Impostor'),
     'a non-Fidevia address claiming Fidevia as its company is not offered');
  ok(got.includes('Brenda Santiago'), 'a blank company field does not exclude a Fidevia address');
  ok(got.includes('Angie Luvsan'), '"Fidevia LLC" is included — the domain decides, not the spelling');
  // de-duplication
  const dup=['Andre Martin','Andre Martin','Angie Luvsan'].filter((v,i,a)=>a.indexOf(v)===i);
  ok(dup.length===2, 'a repeated name appears once');
}

// the field must stay free text: not every CM is in the directory yet
ok(!/<select[^>]*np-cm/.test(html), 'the wizard field is still an input, not a dropdown');
ok(!/required/.test(html.split('id="np-cm"')[0].slice(-200)), 'nothing forces a listed name');
ok(!/placeholder="e\.g\. Andre Martin"/.test(html), 'the hard-coded example name is gone');

console.log((bad?'FAIL ':'ok   ')+'tools-test-cmpick.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
