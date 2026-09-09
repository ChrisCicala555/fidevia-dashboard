// Schedules read as one card per contract, the same shape as Payment
// Applications. The flat list ran a contract's files straight into the next
// contract's row, so on a job with three primes it was not obvious whose a
// file was.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const cards=()=>b.run("document.getElementById('sched-uploads').innerHTML")
  .split('<div class="sched-group">').slice(1).map(card=>({
    head: card.split('</div>')[0].replace(/<[^>]+>/g,' ').replace(/&middot;/g,'·').replace(/\s+/g,' ').trim(),
    open: /id="sg-body-\d+" style="display:block/.test(card),
    files: (card.match(/class="file-line"[^>]*>([^<]+)</g)||[]).map(x=>x.replace(/.*>/,'').replace(/<$/,''))
  }));
const FILES=[{id:'a',name:'Summit Builders — October 2026.png',periodLabel:'October 2026',date:'2026-09-09'},
             {id:'b',name:'Summit Builders — September 2026.jpg',periodLabel:'September 2026',date:'2026-09-08'}];
const setup=(open)=>b.run(`currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'1',active:true},
  {name:'Gorilla Construction',role:'PC',contract:'1',active:true}];
  SCHED_FOLDER_ID='555'; EXTERNAL=false; IS_ADMIN=true; ME_COMPANY='Fidevia'; DATA_READY=true;
  SCHED_OPEN_CO=${JSON.stringify(open||'')};
  SCHED_UPLOADS=[{company:'Summit Builders',state:'current',period:'2026-09',periodLabel:'September 2026',
    date:'2026-09-08',files:${JSON.stringify(FILES)}},
   {company:'Gorilla Construction',state:'never',files:[]}];`);

console.log('One card per contract');
setup(); await b.run("renderScheduleUploads()");
{
  const c=cards();
  ok(c.length===2, 'a card each ('+c.length+')');
  ok(c.every(x=>!x.open), 'both closed to begin with, so the panel is scannable');
  // Rendered and hidden, the way a pay app group is: the toggle is then
  // instant. Nothing is exposed by that — the render already dropped every
  // contract the reader is not entitled to before drawing anything.
  ok(/id="sg-body-0" style="display:none/.test(b.run("document.getElementById('sched-uploads').innerHTML")),
     'the body is there but hidden, so opening it does not have to fetch or rebuild');
  ok(/Summit Builders/.test(c[0].head) && /On file/.test(c[0].head), 'the head carries the contract and its state');
  ok(/2 schedules · covers September 2026 · submitted 09\/08\/2026/.test(c[0].head),
     'and a summary of what is there ('+c[0].head+')');
  ok(/Upload/.test(c[0].head), 'with the action in the head, so a closed card still offers it');
  ok(/Remind/.test(c[1].head) && !/Remind/.test(c[0].head),
     'and Remind only on the contract that is behind');
}
// The month named is the one being asked about, not simply the newest file.
ok(/covers September 2026/.test(cards()[0].head) && !/October/.test(cards()[0].head),
   'the summary names the month that answers the question, not the newest upload');
// A contract with nothing does not say "0 schedules · none on file" next to
// a chip that already says Never uploaded.
ok(!/0 schedule/.test(cards()[1].head), 'an empty contract does not repeat itself ('+cards()[1].head+')');

console.log('Opening one');
b.run("schedToggleFiles('Summit Builders')"); await b.run("renderScheduleUploads()");
{
  const c=cards();
  ok(c[0].open && c[0].files.length===2, 'its files appear');
  ok(!c[1].open && c[1].files.length===0, 'and the other card stays shut');
  ok(/October 2026/.test(c[0].files[0]), 'newest first');
}
b.run("schedToggleFiles('Gorilla Construction')"); await b.run("renderScheduleUploads()");
{
  const c=cards();
  ok(!c[0].open && c[1].open, 'opening another closes the first — one at a time, like the pay app groups');
  ok(/No schedule submitted yet\./.test(b.run("document.getElementById('sched-uploads').innerHTML")),
     'and a contract with nothing says so rather than opening onto nothing');
}
b.run("schedToggleFiles('Gorilla Construction')"); await b.run("renderScheduleUploads()");
ok(cards().every(x=>!x.open), 'and clicking it again closes it');

console.log('Still scoped');
b.run(`EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='gc@s.test';ME_COMPANY='Summit Builders';
  currentProject.userCompany='Summit Builders';currentProject.userRole='contractor';SCHED_OPEN_CO='';`);
await b.run("renderScheduleUploads()");
{
  const c=cards();
  ok(c.length===1 && /Summit Builders/.test(c[0].head), 'a contractor sees one card, their own');
  ok(!/Remind/.test(c[0].head), 'with no way to chase themselves');
}

console.log('Structure');
ok(/\.sched-group\{/.test(html) && /\.sched-group-head\{/.test(html), 'it has its own card styles');
ok(/\.sched-group-head:hover\{background:var\(--khaki-50/.test(html),
   'the head looks pressable, the way a pay app group does');
ok(/@media\(max-width:720px\)\{[\s\S]{0,120}\.sched-group-meta\{display:none;\}/.test(html),
   'and the summary drops on a narrow screen rather than crushing the name');
{
  const c = html.split('function schedFilesHTML')[1];
  ok(!/Show|Hide/.test(c.slice(0, c.indexOf('\nfunction '))),
     'the old Show/Hide link is gone — the card head owns open and closed now');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedgroups.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
