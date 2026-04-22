#!/usr/bin/env python3
"""
Fix unified diffs where @@ -a,b +c,d @@ counts don't match the hunk body.
Git rejects these as 'corrupt patch'; GNU patch is similarly strict.
"""
from __future__ import annotations

import re
import sys

HUNK_RE = re.compile(
    r"^@@ -(\d+),(\d+) \+(\d+),(\d+) @@(.*)$"
)


def count_hunk_lines(body_lines: list[str]) -> tuple[int, int]:
    old_n = new_n = 0
    for line in body_lines:
        if not line:
            continue
        c = line[0]
        if c == " ":
            old_n += 1
            new_n += 1
        elif c == "-":
            old_n += 1
        elif c == "+":
            new_n += 1
        elif c == "\\":
            pass  # "\ No newline at end of file" marker
        else:
            break
    return old_n, new_n


def fix_patch(text: str) -> str:
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = HUNK_RE.match(line.rstrip("\n"))
        if not m:
            out.append(line)
            i += 1
            continue
        old_start, _old_cnt, new_start, _new_cnt, tail = m.groups()
        j = i + 1
        body: list[str] = []
        while j < len(lines):
            nxt = lines[j]
            if nxt.startswith("@@ ") or nxt.startswith("diff --git "):
                break
            if nxt.startswith("--- ") or nxt.startswith("+++ "):
                break
            # end of file for this hunk
            body.append(nxt.rstrip("\n"))
            j += 1
        old_n, new_n = count_hunk_lines(body)
        fixed = f"@@ -{old_start},{old_n} +{new_start},{new_n} @@{tail}\n"
        out.append(fixed if line.endswith("\n") else fixed.rstrip("\n"))
        for b in body:
            out.append(b if b.endswith("\n") else b + "\n")
        i = j
    return "".join(out)


def main() -> None:
    paths = sys.argv[1:]
    if not paths:
        print("usage: fix-unified-hunk-counts.py <patch>...", file=sys.stderr)
        sys.exit(2)
    for p in paths:
        with open(p, encoding="utf-8", errors="replace") as f:
            raw = f.read()
        fixed = fix_patch(raw)
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(fixed)
        print("fixed", p)


if __name__ == "__main__":
    main()
