#!/usr/bin/env python3
"""Builds the web fonts in src/assets/fonts from fonts installed on the build machine.

Why: the site serves its own fonts so that nothing is fetched from a third party (privacy, NFR-3)
and so the pages look the same on every phone (NFR-8). Each file is cut down to the Latin letters,
digits, punctuation and currency signs the site needs, which keeps it small (NFR-6).

Licence: Inter is under the SIL Open Font License 1.1. Its copyright line names no Reserved Font Name,
so the cut-down files may keep the name "Inter". Their copyright notice and licence text stay inside
each file, and the full licence is in src/assets/fonts/LICENSES.txt.

Other scripts (Pashto and Dari, written in Arabic script) need a font decision when those languages are
added. Inter does not cover them.

Run:  python3 scripts/make-fonts.py        (needs fontTools; no brotli, so files are WOFF)
"""
import os
import sys
from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "assets", "fonts")

INTER = "/usr/share/fonts/opentype/inter/Inter-{}.otf"

# (source file, output name, family name, style)
JOBS = [
    (INTER.format("Regular"), "inter-regular", "Inter", "Regular"),
    (INTER.format("Bold"), "inter-bold", "Inter", "Bold"),
]

RANGES = [
    (0x0020, 0x007E),  # basic Latin
    (0x00A0, 0x00FF),  # Latin-1 supplement
    (0x0100, 0x017F),  # Latin extended-A
    (0x0218, 0x021B),  # Romanian comma-below letters
    (0x02C6, 0x02C6), (0x02DA, 0x02DA), (0x02DC, 0x02DC),
    (0x2010, 0x2015),  # hyphens and dashes
    (0x2018, 0x201E),  # quotes
    (0x2020, 0x2022), (0x2026, 0x2026), (0x2030, 0x2030), (0x2039, 0x203A),
    (0x20A6, 0x20A6), (0x20AC, 0x20AC), (0x20B9, 0x20B9), (0x20BA, 0x20BA),  # currency
    (0x2116, 0x2116), (0x2122, 0x2122), (0x2212, 0x2212),
]
FEATURES = ["kern", "liga", "ccmp", "locl", "mark", "mkmk", "calt", "case", "lnum", "tnum", "pnum", "onum"]


def main():
    os.makedirs(OUT, exist_ok=True)
    unicodes = [c for lo, hi in RANGES for c in range(lo, hi + 1)]
    for src, name, family, style in JOBS:
        if not os.path.exists(src):
            sys.exit(f"Missing source font: {src}")
        opts = subset.Options()
        opts.layout_features = FEATURES
        opts.flavor = "woff"
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        opts.hinting = False
        opts.desubroutinize = True
        font = subset.load_font(src, opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=unicodes)
        sub.subset(font)
        dest = os.path.join(OUT, name + ".woff")
        subset.save_font(font, dest, opts)
        print(f"{name}.woff  {os.path.getsize(dest) / 1024:.1f} KB  ({family} {style})")


if __name__ == "__main__":
    main()
