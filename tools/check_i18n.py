#!/usr/bin/env python3
"""Проверка переводов: файлы на месте, lang, ссылки резолвятся, переключатель есть."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = ["en", "de", "es"]
PAGES = ["index.html", "pro.html", "shop/index.html", "care/index.html"]

problems = []

for lang in LANGS:
    for page in PAGES:
        f = ROOT / lang / page
        if not f.exists():
            problems.append(f"[missing] {lang}/{page}")
            continue
        html = f.read_text()
        rel = f"{lang}/{page}"

        m = re.search(r'<html lang="([^"]+)"', html)
        if not m or m.group(1) != lang:
            problems.append(f"[lang] {rel}: <html lang> = {m.group(1) if m else 'none'}")

        # local links
        for href in re.findall(r'(?:href|src)="([^"]+)"', html):
            if href.startswith(("http", "mailto:", "data:", "#", "tel:")) or not href:
                continue
            path = href.split("#")[0].split("?")[0]
            if not path:
                continue
            target = (f.parent / path).resolve()
            if not target.exists():
                problems.append(f"[404] {rel} -> {href}")

        # switcher
        if "lang-switch" not in html:
            problems.append(f"[switcher] {rel}: блок переключения отсутствует")
        else:
            block = re.search(r'<div class="lang-switch"[\s\S]*?</div>', html)
            if block and "is-active" not in block.group(0):
                problems.append(f"[switcher] {rel}: нет активного языка")

print(f"проверено: {len(LANGS) * len(PAGES)} страниц")
if problems:
    print(f"проблем: {len(problems)}")
    for p in problems[:60]:
        print(" ", p)
    sys.exit(1)
print("всё чисто")
