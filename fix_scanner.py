import sys

filepath = r"C:\Users\adamk\704collective\src\components\CheckInFullScreen.tsx"

with open(filepath, "r", encoding="utf-8-sig") as f:
    content = f.read()

old = r"""  const startScanner = async () => {
    if (scannerRef.current) return;
    if (!containerRef.current) return;
    
    const existingEl = document.getElementById(scannerContainerId);
    if (existingEl) {
      existingEl.remove();
    }
    
    const scannerEl = document.createElement('div');
    scannerEl.id = scannerContainerId;
    scannerEl.style.width = '100%';
    scannerEl.style.height = '100%';
    containerRef.current.appendChild(scannerEl);
    
    try {
      setCameraError(null);
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: { ideal: 'environment' } } 
        });
        stream.getTracks().forEach(track => track.stop());
      } catch (permErr: any) {
        if (permErr.name === 'NotAllowedError') {
          setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
          return;
        } else if (permErr.name === 'NotFoundError') {
          setCameraError('No camera found on this device.');
          return;
        }
        throw permErr;
      }
      
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        setCameraError('No camera found on this device.');
        return;
      }
      const backCamera = cameras.find((c) =>
        /back|rear|environment/i.test(c.label)
      );
      const chosenCamera = backCamera ?? cameras[cameras.length - 1] ?? cameras[0];

      await scanner.start(
        chosenCamera.id,
        { fps: 10, qrbox: { width: 280, height: 280 } },
        (decodedText) => {
          handleQRScan(decodedText);
        },
        () => {}
      );
      
      setIsScanning(true);
    } catch (err: any) {
      console.error('Scanner error:', err);
      const detail = err?.name ? `${err.name}: ${err.message || 'no message'}` : (err?.message || String(err) || 'Unknown error');
      setCameraError(`Camera failed to start. [${detail}]`);
      setIsScanning(false);
    }
  };"""

new = r"""  const startScanner = async () => {
    if (scannerRef.current) return;
    if (!containerRef.current) return;

    const existingEl = document.getElementById(scannerContainerId);
    if (existingEl) {
      existingEl.remove();
    }

    const scannerEl = document.createElement('div');
    scannerEl.id = scannerContainerId;
    scannerEl.style.width = '100%';
    scannerEl.style.height = '100%';
    containerRef.current.appendChild(scannerEl);

    setCameraError(null);

    try {
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      // Acquire the camera exactly once, via html5-qrcode. Do NOT do a
      // separate getUserMedia permission probe first - on Windows the video
      // source is not released between the probe and the scanner start,
      // causing NotReadableError. html5-qrcode's own start() triggers the
      // browser permission prompt on first use.
      let cameras: { id: string; label: string }[] = [];
      try {
        cameras = await Html5Qrcode.getCameras();
      } catch (camListErr: any) {
        // getCameras itself can throw on permission denial
        if (camListErr?.name === 'NotAllowedError') {
          setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
        } else {
          setCameraError(`Camera failed to start. [${camListErr?.name || 'Error'}: ${camListErr?.message || 'no detail'}]`);
        }
        scannerRef.current = null;
        setIsScanning(false);
        return;
      }

      if (!cameras || cameras.length === 0) {
        setCameraError('No camera found on this device.');
        scannerRef.current = null;
        setIsScanning(false);
        return;
      }

      const backCamera = cameras.find((c) => /back|rear|environment/i.test(c.label));
      const chosenCamera = backCamera ?? cameras[cameras.length - 1] ?? cameras[0];

      await scanner.start(
        chosenCamera.id,
        { fps: 10, qrbox: { width: 280, height: 280 } },
        (decodedText) => { handleQRScan(decodedText); },
        () => {}
      );

      setIsScanning(true);
    } catch (err: any) {
      console.error('Scanner error:', err);
      const name = err?.name || 'Error';
      const msg = err?.message || String(err) || 'Unknown error';
      if (name === 'NotAllowedError') {
        setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (name === 'NotReadableError') {
        setCameraError('Camera is in use by another app or tab. Close other apps using the camera, then tap Try Again.');
      } else if (name === 'NotFoundError') {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError(`Camera failed to start. [${name}: ${msg}]`);
      }
      scannerRef.current = null;
      setIsScanning(false);
    }
  };"""

if old not in content:
    print("OLD STRING NOT FOUND")
    sys.exit(1)

content = content.replace(old, new, 1)

with open(filepath, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)

with open(filepath, "rb") as f:
    first4 = list(f.read(4))
print(f"Saved. First 4 bytes: {first4}")
lines = content.split("\n")
print(f"Total lines: {len(lines)}")
# Show new startScanner bounds
for i, line in enumerate(lines):
    if "const startScanner = async" in line:
        print(f"startScanner starts at line {i+1}")
    if i > 160 and "};  // end check" in line or (i > 160 and line.strip() == "};" and i < 250):
        pass
