// A directory you can act on: addresses dial and compose rather than being read
// off the screen and retyped.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// Run the real helpers rather than matching on their source.
const a = html.indexOf('// A directory exists to be acted on.');
const b = html.indexOf('function fmtPhone(v){');
const src = html.slice(a, html.indexOf('\n}\n', b)+3);
const esc = `function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }`;
const { mailLink, telLink } = new Function(esc+'\n'+src+'\nreturn {mailLink,telLink};')();

ok(/href="mailto:dchen@summit\.com"/.test(mailLink('dchen@summit.com')), 'an address composes');
ok(/>dchen@summit\.com</.test(mailLink('dchen@summit.com')), 'and still reads as itself');
ok(mailLink('').indexOf('href')<0 && mailLink('   ').indexOf('href')<0,
   'a missing address is a dash, not an empty link');
ok(mailLink('a@b.co').indexOf('event.stopPropagation()')>=0,
   'reaching for an address does not also open the row behind it');
// Escaping: a name is user-supplied and lands in an href.
ok(mailLink('<script>@e.com').indexOf('<script>')<0, 'the href cannot carry markup');
ok(mailLink('a"b@e.com').indexOf('&quot;')>=0, 'nor break out of the attribute');
ok(mailLink("o'brien@e.com").indexOf('&#39;')>=0, 'an apostrophe survives as an entity');

ok(/href="tel:5551234567"/.test(telLink('(555) 123-4567')), 'a phone dials on its digits');
ok(/>\(555\) 123-4567</.test(telLink('5551234567')), 'while the label stays formatted');
ok(/href="tel:\+442079460958"/.test(telLink('+44 20 7946 0958')), 'an international number keeps its plus');
ok(telLink('ext 204')==='ext 204', 'an extension is not a number to dial');
ok(telLink('12345').indexOf('href')<0, 'nor is something too short to be one');
ok(telLink('')==='', 'and nothing stays nothing');
ok(telLink('1-555-123-4567').indexOf('href="tel:15551234567"')>=0, 'a leading 1 is kept in the href');

// ── wired in ──
ok(/mailLink\(r\['Email'\]\)/.test(html), 'the project directory uses it');
ok(/telLink\(r\['Phone'\]\)/.test(html), 'for phones too');
ok(/const mailCell=v=>mailLink\(v\);/.test(html),
   'the contact directory shares the one helper rather than keeping its own');
ok(/telLink\(c\.phone\)\|\|plain\(''\)/.test(html), 'and dials from there as well');
ok(/mailLink\(c\.email\)\+\(c\.company/.test(html), 'the person detail header links its address');
// Editing must not be turned into a link, or the field cannot be typed into.
ok(/CD_UNLOCKED\?fld\(idx,'phone'/.test(html),
   'a phone being edited stays an input');
ok(/CD_UNLOCKED\?'<span class="cd-locked"/.test(html),
   'and an address being edited stays the locked chip that explains itself');
ok(/\.cd-mail\{/.test(html), 'the link has a style');

console.log((bad?'FAIL':'ok  '),' tools-test-maillink.mjs —',n,'assertions');
process.exit(bad?1:0);
