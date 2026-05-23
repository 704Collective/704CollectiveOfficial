filepath = r"C:\Users\adamk\704collective\src\components\CheckInFullScreen.tsx"
with open(filepath, "r", encoding="utf-8-sig") as f:
    c = f.read()

# Log 1: very first line inside handleQRScan
old1 = "  const handleQRScan = async (scannedText: string) => {\n    try {"
new1 = "  const handleQRScan = async (scannedText: string) => {\n    console.log('[QR] handleQRScan called with:', scannedText, 'length:', scannedText.length);\n    try {"

# Log 6: guest-pass UUID branch entry (comes BEFORE member branch in the file)
old6 = "      // New guest pass flow - UUID guest_pass_code stored in ticket metadata\n      // Try matching a guest_pass ticket by its metadata.guest_pass_code before\n      // falling through to the regular member user-ID lookup.\n      if (!scannedText.includes('@') && scannedText.length >= 32) {\n        if (!isOnline) {\n          toast.error('Cannot verify guest passes while offline');"
new6 = "      // New guest pass flow - UUID guest_pass_code stored in ticket metadata\n      // Try matching a guest_pass ticket by its metadata.guest_pass_code before\n      // falling through to the regular member user-ID lookup.\n      if (!scannedText.includes('@') && scannedText.length >= 32) {\n        console.log('[QR] entered guest-pass branch, isOnline:', isOnline);\n        if (!isOnline) {\n          toast.error('Cannot verify guest passes while offline');"

# Log 7: after guestTicket query
old7 = "          .maybeSingle();\n\n        if (guestTicket) {"
new7 = "          .maybeSingle();\n        console.log('[QR] guestTicket:', guestTicket ? 'found - will process as guest' : 'none - falling through');\n\n        if (guestTicket) {"

# Log 2: member branch entry
old2 = "      // Member check-in by profile UUID\n      // MembershipCard encodes the member's profile.id (UUID, 36 chars).\n      // Look up the member, find or create their ticket for this event, stamp check-in.\n      if (!scannedText.includes('@') && scannedText.length >= 32) {\n        if (!isOnline) {\n          toast.error('Cannot verify member check-ins while offline');"
new2 = "      // Member check-in by profile UUID\n      // MembershipCard encodes the member's profile.id (UUID, 36 chars).\n      // Look up the member, find or create their ticket for this event, stamp check-in.\n      if (!scannedText.includes('@') && scannedText.length >= 32) {\n        console.log('[QR] entered member branch, isOnline:', isOnline);\n        if (!isOnline) {\n          toast.error('Cannot verify member check-ins while offline');"

# Log 3: after member lookup
old3 = "          .eq('id', scannedText)\n          .maybeSingle();\n\n        if (!member) {"
new3 = "          .eq('id', scannedText)\n          .maybeSingle();\n        console.log('[QR] member lookup result:', member ? `found ${member.full_name}` : 'NOT FOUND');\n\n        if (!member) {"

# Log 4: after existingTicket query
old4 = "          .limit(1)\n          .maybeSingle();\n\n        if (existingTicket) {"
new4 = "          .limit(1)\n          .maybeSingle();\n        console.log('[QR] existingTicket:', existingTicket ? `id ${existingTicket.id} checked_in_at ${existingTicket.checked_in_at}` : 'none - will create walk-in');\n\n        if (existingTicket) {"

# Log 5: just before success toast
old5 = "        toast.success(`Welcome, ${member.full_name || 'Member'}!`);"
new5 = "        console.log('[QR] reached success toast for', member.full_name);\n        toast.success(`Welcome, ${member.full_name || 'Member'}!`);"

# Log 8: before final fallback toast
old8 = "      // Fallback: nothing matched\n      toast.error('QR code not recognized');"
new8 = "      // Fallback: nothing matched\n      console.log('[QR] fell through all branches - nothing matched');\n      toast.error('QR code not recognized');"

replacements = [
    ("log1", old1, new1),
    ("log6", old6, new6),
    ("log7", old7, new7),
    ("log2", old2, new2),
    ("log3", old3, new3),
    ("log4", old4, new4),
    ("log5", old5, new5),
    ("log8", old8, new8),
]

all_ok = True
for name, old, new in replacements:
    if old in c:
        print(f"  Found: {name}")
    else:
        print(f"  NOT FOUND: {name}")
        all_ok = False

if not all_ok:
    print("ABORT")
    exit(1)

for name, old, new in replacements:
    c = c.replace(old, new, 1)

with open(filepath, "w", encoding="utf-8", newline="\n") as f:
    f.write(c)

with open(filepath, "rb") as f:
    first4 = list(f.read(4))
lines = c.split("\n")
print(f"Saved. First 4 bytes: {first4}. Lines: {len(lines)}")

# Spot-check
for i, line in enumerate(lines):
    if "[QR]" in line:
        print(f"  {i+1}|{line.strip()}")
