'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface QRScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (result: string) => void;
}

export function QRScanner({ open, onOpenChange, onScan }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerContainerId = useRef(`qr-scanner-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (open && containerRef.current) {
      // Delay scanner start to allow dialog animation to complete
      const timer = setTimeout(() => {
        startScanner();
      }, 500);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    }
    
    return () => {
      stopScanner();
    };
  }, [open]);

  const startScanner = async () => {
    if (scannerRef.current) return;
    if (!containerRef.current) return;
    
    // Create scanner element imperatively to avoid React DOM conflicts
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
      setError(null);
      setIsScanning(true);
      
      // Request camera permission explicitly first
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        stream.getTracks().forEach(track => track.stop());
      } catch (permErr: any) {
        if (permErr.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access in your browser settings.');
          setIsScanning(false);
          return;
        } else if (permErr.name === 'NotFoundError') {
          setError('No camera found on this device.');
          setIsScanning(false);
          return;
        }
        throw permErr;
      }
      
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;
      
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          onScan(decodedText);
          stopScanner();
          onOpenChange(false);
        },
        () => {} // Ignore errors during scanning
      );
    } catch (err: any) {
      console.error('Scanner error:', err);
      setError(err.message || 'Failed to start camera. Please ensure camera permissions are granted.');
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    
    scannerRef.current = null;
    
    try {
      const state = scanner.getState();
      if (state === 2) { // SCANNING state
        await scanner.stop();
      }
    } catch (err) {
      // Ignore errors when stopping
    }
    
    // Remove the scanner element entirely (outside React's control)
    const scannerEl = document.getElementById(scannerContainerId);
    if (scannerEl) {
      scannerEl.remove();
    }
    
    setIsScanning(false);
  };

  const handleClose = () => {
    stopScanner();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Scan Member QR Code
          </DialogTitle>
        </DialogHeader>
        
        <div className="relative">
          <div
            ref={containerRef}
            className="w-full aspect-square rounded-lg overflow-hidden bg-muted"
          />
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4">
              <div className="text-center">
                <p className="text-destructive text-sm mb-4">{error}</p>
                <Button onClick={startScanner} variant="outline">
                  Try Again
                </Button>
              </div>
            </div>
          )}
          
          {!isScanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="text-center">
                <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">Initializing camera...</p>
              </div>
            </div>
          )}
        </div>
        
        <p className="text-sm text-muted-foreground text-center">
          Point your camera at a member's QR code to check them in
        </p>
        
        <Button variant="outline" onClick={handleClose}>
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
