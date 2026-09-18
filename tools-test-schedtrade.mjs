// "There should be 2 tabs here for Summit because they should submit the GC as
//  well as the MC schedules separately."
//
// Right, and the panel could not have shown them: a schedule is matched to a
// firm by the name in the filename, and the name said nothing about which
// contract. So a firm holding two primes was asked one question, and the first
// programme to arrive marked both contracts current — including the one nobody
// had posted anything for, which is the reading that lets a contract go unasked
// for a month.
//
// The name carries the contract now, the way it already carried the company and
// the month: "<Company> — <TRADE> — <Month> <Year>".
import fs from 'fs';
import { tradeFromName, filesForContract } from './netlify/functions/lib/sched.mjs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const proxy=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const rem=fs.readFileSync('netlify/functions/reminders.mjs','utf8');
const P=bootPage('index.html'); P.run(SEED);
const T=['GC','MC'];

console.log('Reading the contract off a filename');
{
  ok(tradeFromName('Summit Builders — MC — September 2026.pdf', T)==='MC', 'the trade in the name');
  ok(tradeFromName('Summit Builders — GC — September 2026.pdf', T)==='GC', 'either of them');
  ok(tradeFromName('summit builders - mc - sep 2026.pdf', T)==='MC', 'however it is cased');
  ok(tradeFromName('Summit Builders (MC) Sept 2026.pdf', T)==='MC', 'and however it is bracketed');
  ok(tradeFromName('Summit Builders — September 2026.pdf', T)==='',
     'a name that does not say answers nothing rather than guessing');
  // The failure that would be invisible and wrong.
  ok(tradeFromName('McKinley Mechanical — September 2026.pdf', T)==='',
     'MC is not found inside the Mc of McKinley — a trade code is a word, not a substring');
  ok(tradeFromName('GCM Contracting — September 2026.pdf', T)==='', 'nor GC inside GCM');
  ok(tradeFromName('anything', [])==='' && tradeFromName(null, T)==='', 'nothing in, nothing out');
  ok(tradeFromName('Firm — OC — Sept.pdf', ['OC','C'])==='OC',
     'a code inside another code is not what was written — the C of OC is not a lone C');
  ok(tradeFromName('Firm — C — Sept.pdf', ['OC','C'])==='C', 'and a lone one is');
}

console.log('Which files count for which contract');
{
  const files=[{name:'Summit — GC — September 2026.pdf'},
               {name:'Summit — MC — September 2026.pdf'},
               {name:'Summit — September 2026.pdf'}];
  const gc=filesForContract(files,'GC',T).map(f=>f.name);
  const mc=filesForContract(files,'MC',T).map(f=>f.name);
  ok(gc.length===2 && gc.some(x=>/GC/.test(x)), 'the GC contract gets its own');
  ok(mc.length===2 && mc.some(x=>/MC/.test(x)), 'and the MC contract gets its own');
  ok(!gc.some(x=>/MC/.test(x)), "and neither gets the other's");
  // The rule that stops this turning a firm that IS current red.
  ok(gc.some(x=>!/GC|MC/.test(x)) && mc.some(x=>!/GC|MC/.test(x)),
     'a file naming no contract counts for every one the firm holds — the same rule a payment '
     +'application filed before the column existed follows');
  ok(filesForContract(files,'GC',['GC']).length===3,
     'a firm holding one contract is not filtered at all, so nothing already filed moves');
  ok(filesForContract(files,'',T).length===3, 'and asking without a contract asks for everything');
  ok(filesForContract(null,'GC',T).length===0, 'no files is no files');
}

console.log('The panel asks per contract');
{
  const src=html.split('async function renderScheduleUploads')[1].split('\n  const wantLabel')[0];
  ok(/let lines=contractorLines\(\)/.test(src), 'from the contract lines');
  ok(/contracts:lines\.map\(c=>\(\{company:c\.name, trade:tradeKeyOf\(c\)\|\|''\}\)\)/.test(src),
     'sending firm and trade together');
  ok(/lines=lines\.filter\(c=>norm\(c\.name\)===norm\(myCo\)\)/.test(src),
     'and a contractor is still scoped to their own firm');
  const key=html.split('const rowKey=')[1].split('\n')[0];
  ok(/r\.trade/.test(key), 'a card is identified by firm and trade, so two do not open together');
}

console.log('The server answers per contract');
{
  ok(/body\.contracts/.test(proxy), 'it takes the contract list');
  ok(/companies\.map\(c => \(\{ company: c, trade: '' \}\)\)/.test(proxy),
     'and an older caller sending plain names gets exactly what it got');
  ok(/files = filesForContract\(files, ct\.trade, held\)/.test(proxy), 'narrowing the files to the contract');
  ok(/trade: tradeFromName\(f\.name, tradesOf\[co\.toLowerCase\(\)\] \|\| \[\]\)/.test(proxy),
     'and each file says which contract it claims, blank where the name does not say');
  ok(/out\.push\(Object\.assign\(\{ company: co, trade: ct\.trade/.test(proxy),
     'the row carries its contract back');
}

console.log('The nightly chase too');
{
  ok(/filesForContract\(files, String\(c\.role \|\| ''\)/.test(rem),
     'a firm holding two contracts is chased about the one that is missing');
  ok(/held\.length > 1 && c\.role/.test(rem),
     'and the email names which — two identical chases would be worse than one');
  ok(/import \{ scheduleState, periodOfDate, periodLabel, filesForContract/.test(rem),
     'reading it from the shared module, not a copy that can drift');
}

console.log('The upload writes the contract into the name');
{
  const base=P.run(`(function(){
    currentProject.config.contractors=[{name:'Summit Builders',role:'GC'},{name:'Summit Builders',role:'MC'},
      {name:'Gorilla Construction',role:'EC'}];
    SCHED_UP_CO='Summit Builders'; SCHED_UP_TRADE='MC';
    const two=schedUpBaseName();
    SCHED_UP_CO='Gorilla Construction'; SCHED_UP_TRADE='EC';
    const one=schedUpBaseName();
    return JSON.stringify([two, one]); })()`);
  const [two, one]=JSON.parse(base);
  ok(/Summit Builders — MC —/.test(two), 'a firm on two primes names the contract');
  ok(/^Gorilla Construction —/.test(one) && !/EC/.test(one),
     'a firm on one does not — it would be noise, and every file already filed reads correctly without it');
  ok(P.run("tradeLabelForKey('Summit Builders','MC')")==='MC', 'the row label is this contract');
  // The dialog shows the name the file will take. Two copies of that rule is
  // how a preview starts telling somebody a filename that is not the one that
  // lands, so there is one.
  const up=html.split('async function schedUpload(f, company, periodLabel, say, trade)')[1].split('\n  say(')[0];
  ok(/schedFileBase\(company, trade, periodLabel\)/.test(up), 'the upload builds the name from the shared rule');
  ok(/function schedUpBaseName\(\)\{ return schedFileBase\(/.test(html), 'and so does the preview');
  ok((html.match(/many&&tr/g)||[]).length===1, 'the rule itself is written once');
  ok(/schedParty\(company, trade\)\+' is current for '/.test(html),
     'and what the upload says when it lands names the same party the file does');
  ok(/\+schedParty\(SCHED_UP_CO, SCHED_UP_TRADE\);/.test(html),
     'as does the dialog it was uploaded from');
  ok(P.run("tradeLabelForKey('Summit Builders','')")==='', 'and nothing where there is no contract to name');
}

console.log(bad?`\n${bad}/${n} failed`:`\n${n} checks passed`);
process.exit(bad?1:0);
