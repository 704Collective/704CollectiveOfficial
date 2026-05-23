filepath = r"C:\Users\adamk\704collective\src\components\CheckInFullScreen.tsx"
with open(filepath, "r", encoding="utf-8-sig") as f:
    c = f.read()

removals = []

# 1. Eruda useEffect block (with leading blank line and comment)
removals.append((
    "eruda block",
    "\n  // Temporary diagnostic: eruda on-screen console for mobile debugging\n  useEffect(() => {\n    if (typeof window === 'undefined') return;\n    if ((window as any).eruda) return;\n    const script = document.createElement('script');\n    script.src = 'https://cdn.jsdelivr.net/npm/eruda';\n    script.onload = () => { (window as any).eruda?.init(); };\n    document.body.appendChild(script);\n  }, []);",
    ""
))

# 2. scanFrameCountRef declaration (with leading newline)
removals.append((
    "scanFrameCountRef decl",
    "\n  const scanFrameCountRef = useRef(0);",
    ""
))

# 3. camera started log (with leading newline)
removals.append((
    "[SCAN] camera started log",
    "\n      console.log('[SCAN] camera started, video size:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);",
    ""
))

# 4. [SCAN] frame log inside scanFrame (with leading newline)
removals.append((
    "[SCAN] frame log",
    "\n          console.log('[SCAN] frame', cropSize, 'x', cropSize, 'readyState', video.readyState, 'jsqr:', result ? result.data : 'null');",
    ""
))

# 5. else block for "no dimensions" (with leading newline - removes empty else)
removals.append((
    "[SCAN] no dimensions else block",
    "\n      } else {\n        console.log('[SCAN] video has no dimensions yet', vw, vh);\n      }",
    "\n      }"
))

# 6. else block for "not ready" (with leading newline - removes empty else)
removals.append((
    "[SCAN] not ready else block",
    "\n    } else {\n      console.log('[SCAN] video not ready, readyState', video?.readyState);\n    }",
    "\n    }"
))

# 7-14. Eight [QR] console.log lines (each with leading newline)
qr_logs = [
    ("[QR] handleQRScan called",   "\n    console.log('[QR] handleQRScan called with:', scannedText, 'length:', scannedText.length);"),
    ("[QR] entered guest-pass",    "\n        console.log('[QR] entered guest-pass branch, isOnline:', isOnline);"),
    ("[QR] guestTicket",           "\n        console.log('[QR] guestTicket:', guestTicket ? 'found - will process as guest' : 'none - falling through');"),
    ("[QR] entered member branch", "\n        console.log('[QR] entered member branch, isOnline:', isOnline);"),
    ("[QR] member lookup result",  "\n        console.log('[QR] member lookup result:', member ? `found ${member.full_name}` : 'NOT FOUND');"),
    ("[QR] existingTicket",        "\n        console.log('[QR] existingTicket:', existingTicket ? `id ${existingTicket.id} checked_in_at ${existingTicket.checked_in_at}` : 'none - will create walk-in');"),
    ("[QR] reached success toast", "\n        console.log('[QR] reached success toast for', member.full_name);"),
    ("[QR] fell through",          "\n      console.log('[QR] fell through all branches - nothing matched');"),
]
for name, old in qr_logs:
    removals.append((name, old, ""))

all_ok = True
for name, old, new in removals:
    if old in c:
        print(f"  Found: {name}")
    else:
        print(f"  NOT FOUND: {name}")
        all_ok = False

if not all_ok:
    print("ABORT")
    exit(1)

for name, old, new in removals:
    c = c.replace(old, new, 1)

with open(filepath, "w", encoding="utf-8", newline="\n") as f:
    f.write(c)

with open(filepath, "rb") as f:
    first4 = list(f.read(4))
lines = c.split("\n")
print(f"Saved. First 4 bytes: {first4}. Lines: {len(lines)}")

# Verify no debug logs remain
remaining = [(i+1, l) for i, l in enumerate(lines)
             if ("console.log" in l and "[CHECK-IN]" not in l)
             or "eruda" in l or "scanFrameCountRef" in l]
if remaining:
    print("WARNING - remaining debug lines:")
    for ln, text in remaining:
        print(f"  {ln}|{text.strip()}")
else:
    print("Clean: no debug logs remaining (console.error kept)")
