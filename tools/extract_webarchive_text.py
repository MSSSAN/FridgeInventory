#!/usr/bin/env python3
"""Extract readable text from an Apple Safari .webarchive file.

Usage:
    python tools/extract_webarchive_text.py input.webarchive output.txt
"""
import plistlib
import sys
from pathlib import Path
from lxml import html


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: extract_webarchive_text.py input.webarchive output.txt")
        return 2

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    with input_path.open("rb") as f:
        archive = plistlib.load(f)

    main_resource = archive["WebMainResource"]
    encoding = main_resource.get("WebResourceTextEncodingName") or "utf-8"
    html_text = main_resource["WebResourceData"].decode(encoding, errors="replace")
    root = html.fromstring(html_text)

    lines = []
    for el in root.xpath("//h1|//h2|//h3|//h4|//p|//li"):
        text = el.text_content().replace("\xa0", " ").strip()
        if text:
            lines.append(text)

    output_path.write_text("
".join(lines) + "
", encoding="utf-8")
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
