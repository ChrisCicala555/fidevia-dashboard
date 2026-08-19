#!/usr/bin/env bash
# Reports top-level functions AND consts that existed in <rev> but are gone now,
# along with how many times each is still referenced. Catches the failure mode
# `node --check` cannot: a block edit silently deleting something still in use.
REV="${1:-HEAD}"
extract() { grep -oE '\b(function [A-Za-z_$][A-Za-z0-9_$]*|const [A-Z_][A-Z0-9_]*)' | awk '{print $2}' | sort -u; }
git show "$REV:index.html" 2>/dev/null | extract > /tmp/sym_old.txt
extract < index.html > /tmp/sym_new.txt
MISSING=$(comm -23 /tmp/sym_old.txt /tmp/sym_new.txt)
FAIL=0
for f in $MISSING; do
  n=$(grep -cE "[^.A-Za-z0-9_$]${f}\s*[({.[]" index.html)
  if [ "$n" -gt 0 ]; then echo "  BROKEN: $f — gone but still referenced ${n}x"; FAIL=1
  else echo "  (removed cleanly: $f)"; fi
done
[ $FAIL -eq 1 ] && { echo "FAILED against $REV"; exit 1; }
echo "OK — nothing referenced was dropped since $REV"
