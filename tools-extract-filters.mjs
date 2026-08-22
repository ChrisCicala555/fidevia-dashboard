// Pulls the pure role/CSV filter helpers out of box-proxy.mjs for testing.
import fs from 'fs';
const lines = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8').split('\n');
const whole = lines.join('\n');
const braceFn = (start) => { let i=start, buf=[], d=0, on=false;
  while (i<lines.length){ buf.push(lines[i]); d+=lines[i].split('{').length-lines[i].split('}').length;
    if(lines[i].includes('{')) on=true; if(on&&d===0) break; i++; } return buf.join('\n'); };
const at = (needle) => lines.findIndex(l=>l.startsWith(needle));
const out = [
  whole.slice(whole.indexOf('const PRIVATE_CSV'), whole.indexOf('const SYSTEM_FOLDERS')),
  lines[at('const csvEsc')],
  braceFn(at('function parseCSVServer')),
  lines[at('function toCSVServer')],
  whole.slice(whole.indexOf('function filterCsvForCaller'), whole.indexOf('async function grantFor')),
].join('\n') + '\nexport { filterCsvForCaller, fileIdsInRow, rowVisibleToExternal, normRole, seesAllCompanies, roleMayWrite };\n';
fs.writeFileSync('.filters.tmp.mjs', out);
