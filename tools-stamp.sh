#!/usr/bin/env bash
# Set the build stamp, and fail loudly if it did not take.
#
# This existed as a bare `sed -i s/<old>/<new>/` typed by hand each time. When
# the old value was not what the typist assumed, sed matched nothing, changed
# nothing, said nothing, and five commits shipped carrying a stamp two hours
# stale — while the person being told the number had no way to know.
set -euo pipefail
new="${1:-$(date -u +'%Y-%m-%d %H:%M')}"
f="$(dirname "$0")/index.html"
before=$(grep -o "BUILD_STAMP='[^']*'" "$f" | head -1)
python3 - "$f" "$new" <<'PY'
import io,re,sys
p,new=sys.argv[1],sys.argv[2]
s=io.open(p,encoding='utf-8').read()
pat=re.compile(r"const BUILD_STAMP='[^']*';")
if len(pat.findall(s))!=1:
    sys.exit('expected exactly one BUILD_STAMP, found %d' % len(pat.findall(s)))
io.open(p,'w',encoding='utf-8').write(pat.sub("const BUILD_STAMP='%s';" % new, s, count=1))
PY
after=$(grep -o "BUILD_STAMP='[^']*'" "$f" | head -1)
[ "$after" = "BUILD_STAMP='$new'" ] || { echo "stamp did not take: still $after" >&2; exit 1; }
echo "build stamp: ${before#BUILD_STAMP=} -> '$new'"
