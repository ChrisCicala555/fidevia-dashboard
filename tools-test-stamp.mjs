// The build stamp is how Christopher knows whether the page in front of him has
// the change being discussed. It was set by a hand-typed sed matching the
// previous value; when that assumption was wrong the substitution matched
// nothing, changed nothing and said nothing, and five commits shipped carrying
// a stamp two hours stale while the number being reported was invented.
import fs from 'fs';
import { execFileSync } from 'child_process';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const read = () => (fs.readFileSync('index.html','utf8').match(/BUILD_STAMP='([^']*)'/)||[])[1];

console.log('There is one stamp and one way to set it');
{
  const all = fs.readFileSync('index.html','utf8').match(/const BUILD_STAMP='[^']*';/g)||[];
  ok(all.length===1, 'exactly one BUILD_STAMP in the file, so a setter cannot change the wrong one');
  ok(fs.existsSync('tools-stamp.sh'), 'and a script that sets it');
}

console.log('Setting it works whatever it was');
{
  const original = read();
  try{
    execFileSync('./tools-stamp.sh', ['2099-01-01 00:00'], {encoding:'utf8'});
    ok(read()==='2099-01-01 00:00', 'the new value lands regardless of the old one');
    // The failure this replaces: it does not need to be told the previous value.
    execFileSync('./tools-stamp.sh', ['2099-01-02 03:04'], {encoding:'utf8'});
    ok(read()==='2099-01-02 03:04', 'and again from a different starting point');
  } finally {
    execFileSync('./tools-stamp.sh', [original], {encoding:'utf8'});
  }
  ok(read()===original, 'and the file is left as it was found');
}

console.log('It fails loudly rather than quietly');
{
  const s = fs.readFileSync('tools-stamp.sh','utf8');
  ok(/set -euo pipefail/.test(s), 'the script stops on any error');
  ok(/expected exactly one BUILD_STAMP/.test(s),
     'refuses if there is not exactly one stamp to set');
  ok(/stamp did not take/.test(s) && /exit 1/.test(s),
     'and checks afterwards that the value really changed — a silent no-op is the whole failure being fixed');
  ok(/echo "build stamp: .* -> /.test(s), 'reporting the before and after, so a wrong assumption is visible');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-stamp.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
