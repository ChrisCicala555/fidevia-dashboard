// "Can the UI in the top right stay with the page regardless of how narrow it
// gets?"
//
// It never left. .main is a flex child and a flex child defaults to
// min-width:auto, so it refused to shrink below the intrinsic width of its
// widest content — the topbar, whose viewer toggle, account chip and Sign Out
// are all nowrap. Narrowing the window overflowed the page sideways instead,
// parking the right-hand cluster somewhere nobody scrolls to.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const css=html.split('<style>')[1].split('</style>')[0];
const rule=(sel)=>{ const m=css.match(new RegExp('(^|[\\s,])'+sel.replace('.','\\.')+'\\s*\\{([^}]*)\\}'));
  return m?m[2]:null; };

console.log('The column can shrink');
{
  const main=rule('.main');
  ok(main!==null, 'there is a .main rule');
  ok(/min-width:\s*0/.test(main),
     'and it may shrink below its content \u2014 without this the page scrolls sideways instead, which '
     +'is how the top right went missing');
  ok(/flex:\s*1/.test(main), 'while still taking the space the sidebar leaves');
}

console.log('And the scrolling belongs to the tables');
{
  ok(/min-width:\s*0/.test(rule('.content')||''), 'the content column shrinks too');
  ok(/overflow-x:\s*auto/.test(rule('.tscroll')||''),
     'and a wide table scrolls inside its own panel, which is where sideways scrolling belongs');
  ok(/overflow:\s*hidden/.test(rule('.panel')||''), 'the panel clips rather than stretching');
}

console.log('What gives way first');
{
  const title=css.match(/\.tb-titlegroup h1\{([^}]*)\}/);
  ok(title && /text-overflow:\s*ellipsis/.test(title[1]),
     'the project name truncates \u2014 it is the one thing on the bar that can be read from context');
  ok(/flex:\s*0 1 auto/.test(rule('.tb-right')||''),
     'and the right-hand cluster yields only after that, rather than being pushed off');
  const chip=css.match(/\.account-chip\{([^}]*)\}/);
  ok(chip && /text-overflow:\s*ellipsis/.test(chip[1]),
     'the address is the part of it that can give way \u2014 Sign Out and the viewer toggle are controls, '
     +'an email is a label, and half of one still identifies you');
}

console.log('Below the breakpoint it is a menu, not a squeeze');
{
  const mq=css.split('@media(max-width:900px)')[1].split('@media')[0];
  ok(/\.tb-menu-btn,\.picker-menu-btn\{display:block/.test(mq), 'a button appears');
  ok(/\.tb-actions,\.picker-actions\{display:none; position:absolute/.test(mq),
     'and the cluster becomes a dropdown rather than competing for a line that is not there');
  ok(/\.tb-actions\.open,\.picker-actions\.open\{display:flex/.test(mq), 'which opens');
}

console.log('The stylesheet is still a stylesheet');
{
  let depth=0, under=false;
  for(const ch of css){ if(ch==='{') depth++; else if(ch==='}'){ depth--; if(depth<0){ under=true; break; } } }
  ok(depth===0 && !under, 'braces balance');
  ok(!/^\s*\/\//m.test(css),
     'and nothing is commented with // \u2014 CSS has no such comment, so one would swallow the rule '
     +'after it and take half the page with it');
}

console.log(bad ? `FAIL tools-test-narrow.mjs — ${bad} of ${n}` : `ok   tools-test-narrow.mjs — ${n} assertions`);
process.exit(bad?1:0);
