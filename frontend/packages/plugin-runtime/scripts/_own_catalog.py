import json
from pathlib import Path

src = Path(__file__).resolve().parents[1] / "src/client/layoutSlots.gen.ts"
text = src.read_text(encoding="utf-8")
body = text.split("export const LAYOUT_SLOTS = ", 1)[1]
slots_raw, rest = body.split("] as const\nexport const ROOT_OUTLETS", 1)
slots = json.loads(slots_raw + "]")
for item in slots:
    item.pop("packageName", None)
header = """/**
 * EAP-owned Cordis seat catalog.
 * Plugins still call these keys. The shell stores dsh-layout-* names.
 * This file is the authority. Frontend code does not read dsh-personal to refresh it.
 */
export const LAYOUT_PREFIX = 'dsh-layout-'
"""
payload = "export const LAYOUT_SLOTS = " + json.dumps(slots, indent=2, ensure_ascii=False) + " as const\n"
tail = "export const ROOT_OUTLETS" + rest
dest = src.with_name("layoutSlots.ts")
dest.write_text(header + payload + tail, encoding="utf-8")
print(len(slots), dest.stat().st_size)
