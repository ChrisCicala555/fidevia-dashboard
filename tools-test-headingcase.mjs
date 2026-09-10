// Panel headings are Title Case throughout — Financial Summary, Contract
// Milestones, Daily Reports by Contractor. Two were sentence case and looked
// like a mistake next to the rest, because they were one.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// Every panel heading, however it is wrapped.
const heads = [...html.matchAll(/class="panel-header"[^>]*>(?:<span[^>]*>)?([^<]+)/g)]
  .map(m=>m[1].trim()).filter(t=>t && !/^Box\b/.test(t));

console.log('Found '+heads.length+' panel headings');
ok(heads.length>10, 'enough of them to be worth a rule');
{
  // Small words stay lowercase inside a title; everything else is capitalised.
  // An acronym is already upper and must not be forced to Rfis.
  const small = new Set(['a','an','and','the','of','by','for','to','in','or','on','with']);
  const wrong = heads.filter(t=>{
    const words = t.replace(/&amp;/g,'&').split(/\s+/).filter(Boolean);
    return words.some((w,i)=>{
      const bare = w.replace(/[^A-Za-z]/g,'');
      if(!bare) return false;
      if(i>0 && small.has(bare.toLowerCase())) return false;
      return bare[0] !== bare[0].toUpperCase();
    });
  });
  ok(wrong.length===0, 'every panel heading is Title Case'+(wrong.length?' — '+wrong.join(' | '):''));
}
ok(/<span>All Change Orders<\/span>/.test(html), 'the change order log says All Change Orders');
ok(/>All Submittals</.test(html), 'and the submittal log says All Submittals');
ok(/<span>All RFIs<\/span>/.test(html), 'while RFIs keeps its acronym rather than being tidied into Rfis');

console.log('Page titles were already right, and stay right');
{
  const titles = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map(m=>m[1].trim());
  const small = new Set(['a','an','and','the','of','by','for','to','in','or','on','with']);
  const wrong = titles.filter(t=>t.split(/\s+/).some((w,i)=>{
    const bare=w.replace(/[^A-Za-z]/g,'');
    if(!bare) return false;
    if(i>0 && small.has(bare.toLowerCase())) return false;
    return bare[0]!==bare[0].toUpperCase();
  }));
  ok(wrong.length===0, 'every page title is Title Case'+(wrong.length?' — '+wrong.join(' | '):''));
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-headingcase.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
