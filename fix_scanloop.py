filepath = r"C:\Users\adamk\704collective\src\components\CheckInFullScreen.tsx"
with open(filepath, "r", encoding="utf-8-sig") as f:
    c = f.read()

# --- Change 1: replace entire scanLoop with scanFrame (no self-scheduling) ---
old1 = r"""  const scanLoop = () => {
    if (!scanningActiveRef.current) return;
    const video = videoRef.current;
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvasRef.current = canvas;
    }
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw > 0 && vh > 0) {
        // Crop to a centered square region - jsqr decodes far more reliably
        // on a focused crop than on the full frame.
        const cropSize = Math.floor(Math.min(vw, vh) * 0.6);
        const sx = Math.floor((vw - cropSize) / 2);
        const sy = Math.floor((vh - cropSize) / 2);
        canvas.width = cropSize;
        canvas.height = cropSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, cropSize, cropSize);
          const imageData = ctx.getImageData(0, 0, cropSize, cropSize);
          const result = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });
          scanFrameCountRef.current += 1;
          if (scanFrameCountRef.current % 60 === 0) {
            console.log('[SCAN] crop', cropSize, 'x', cropSize, 'jsqr result:', result ? result.data : 'null');
          }
          if (result && result.data) {
            const now = Date.now();
            if (result.data !== lastScanRef.current.text || now - lastScanRef.current.at > 3000) {
              lastScanRef.current = { text: result.data, at: now };
              handleQRScan(result.data);
            }
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  };"""

new1 = r"""  const scanFrame = () => {
    if (!scanningActiveRef.current) return;
    const video = videoRef.current;
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvasRef.current = canvas;
    }
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw > 0 && vh > 0) {
        const cropSize = Math.floor(Math.min(vw, vh) * 0.6);
        const sx = Math.floor((vw - cropSize) / 2);
        const sy = Math.floor((vh - cropSize) / 2);
        canvas.width = cropSize;
        canvas.height = cropSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, cropSize, cropSize);
          const imageData = ctx.getImageData(0, 0, cropSize, cropSize);
          const result = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });
          console.log('[SCAN] frame', cropSize, 'x', cropSize, 'readyState', video.readyState, 'jsqr:', result ? result.data : 'null');
          if (result && result.data) {
            const now = Date.now();
            if (result.data !== lastScanRef.current.text || now - lastScanRef.current.at > 3000) {
              lastScanRef.current = { text: result.data, at: now };
              handleQRScan(result.data);
            }
          }
        }
      } else {
        console.log('[SCAN] video has no dimensions yet', vw, vh);
      }
    } else {
      console.log('[SCAN] video not ready, readyState', video?.readyState);
    }
  };"""

# --- Change 2: scanLoop() call -> setInterval ---
old2 = "      scanLoop();"
new2 = "      rafRef.current = window.setInterval(scanFrame, 200) as unknown as number;"

# --- Change 3: cancelAnimationFrame -> clearInterval ---
old3 = "      cancelAnimationFrame(rafRef.current);"
new3 = "      clearInterval(rafRef.current);"

checks = [old1 in c, old2 in c, old3 in c]
print(f"Found: scanLoop={checks[0]}  scanLoop()={checks[1]}  cancelAF={checks[2]}")

if not all(checks):
    print("ABORT - not all strings found")
    exit(1)

c = c.replace(old1, new1, 1)
c = c.replace(old2, new2, 1)
c = c.replace(old3, new3, 1)

with open(filepath, "w", encoding="utf-8", newline="\n") as f:
    f.write(c)

with open(filepath, "rb") as f:
    first4 = list(f.read(4))
lines = c.split("\n")
print(f"Saved. First 4 bytes: {first4}. Lines: {len(lines)}")

# Spot-check
for i, line in enumerate(lines):
    if any(kw in line for kw in ["const scanFrame", "setInterval(scanFrame", "clearInterval", "readyState", "no dimensions"]):
        print(f"  {i+1}|{line}")
