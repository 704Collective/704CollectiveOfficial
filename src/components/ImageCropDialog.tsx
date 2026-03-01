'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AspectPreset {
  label: string;
  ratio: number | null; // null = free
}

const ASPECT_PRESETS: AspectPreset[] = [
  { label: 'Free', ratio: null },
  { label: '16:9', ratio: 16 / 9 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '1:1', ratio: 1 },
];

interface ImageCropDialogProps {
  imageUrl: string;
  open: boolean;
  onSave: (blob: Blob) => void;
  onClose: () => void;
  saving?: boolean;
}

export function ImageCropDialog({ imageUrl, open, onSave, onClose, saving }: ImageCropDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<CropArea>({ x: 0, y: 0, width: 0, height: 0 });
  const [activePreset, setActivePreset] = useState<number | null>(null); // index
  const [dragging, setDragging] = useState<'move' | 'resize' | null>(null);
  const dragStart = useRef({ mx: 0, my: 0, crop: { x: 0, y: 0, width: 0, height: 0 } });

  // Load image and compute display size
  useEffect(() => {
    if (!open) {
      setImgLoaded(false);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl, open]);

  // Once image loaded & container available, compute display dimensions and default crop
  useEffect(() => {
    if (!imgLoaded || !imgRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const img = imgRef.current;
    const maxW = container.clientWidth;
    const maxH = 400;
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const dw = Math.round(img.naturalWidth * scale);
    const dh = Math.round(img.naturalHeight * scale);
    setDisplaySize({ width: dw, height: dh });
    // Default crop: 80% centered
    const cw = Math.round(dw * 0.8);
    const ch = Math.round(dh * 0.8);
    setCrop({
      x: Math.round((dw - cw) / 2),
      y: Math.round((dh - ch) / 2),
      width: cw,
      height: ch,
    });
    setActivePreset(null);
  }, [imgLoaded]);

  const clampCrop = useCallback(
    (c: CropArea): CropArea => {
      const w = Math.max(20, Math.min(c.width, displaySize.width));
      const h = Math.max(20, Math.min(c.height, displaySize.height));
      const x = Math.max(0, Math.min(c.x, displaySize.width - w));
      const y = Math.max(0, Math.min(c.y, displaySize.height - h));
      return { x, y, width: w, height: h };
    },
    [displaySize],
  );

  const applyPreset = (index: number) => {
    setActivePreset(index);
    const preset = ASPECT_PRESETS[index];
    if (!preset.ratio) return; // free — keep current
    const ratio = preset.ratio;
    let cw = displaySize.width * 0.8;
    let ch = cw / ratio;
    if (ch > displaySize.height * 0.8) {
      ch = displaySize.height * 0.8;
      cw = ch * ratio;
    }
    setCrop(
      clampCrop({
        x: (displaySize.width - cw) / 2,
        y: (displaySize.height - ch) / 2,
        width: cw,
        height: ch,
      }),
    );
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent, mode: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(mode);
    dragStart.current = { mx: e.clientX, my: e.clientY, crop: { ...crop } };
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      const orig = dragStart.current.crop;

      if (dragging === 'move') {
        setCrop(clampCrop({ ...orig, x: orig.x + dx, y: orig.y + dy }));
      } else {
        const preset = activePreset !== null ? ASPECT_PRESETS[activePreset] : null;
        let newW = Math.max(20, orig.width + dx);
        let newH = Math.max(20, orig.height + dy);
        if (preset?.ratio) {
          newH = newW / preset.ratio;
        }
        setCrop(clampCrop({ ...orig, width: newW, height: newH }));
      }
    };
    const handleMouseUp = () => setDragging(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, clampCrop, activePreset]);

  const handleSave = () => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    const scaleX = img.naturalWidth / displaySize.width;
    const scaleY = img.naturalHeight / displaySize.height;

    const canvas = document.createElement('canvas');
    const sx = Math.round(crop.x * scaleX);
    const sy = Math.round(crop.y * scaleY);
    const sw = Math.round(crop.width * scaleX);
    const sh = Math.round(crop.height * scaleY);
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    canvas.toBlob(
      (blob) => {
        if (blob) onSave(blob);
      },
      'image/jpeg',
      0.9,
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop Image</DialogTitle>
        </DialogHeader>

        {/* Aspect presets */}
        <div className="flex gap-2">
          {ASPECT_PRESETS.map((p, i) => (
            <Button
              key={p.label}
              variant={activePreset === i ? 'default' : 'outline'}
              size="sm"
              onClick={() => applyPreset(i)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {/* Crop area */}
        <div ref={containerRef} className="relative w-full select-none overflow-hidden rounded-lg bg-muted">
          {imgLoaded && displaySize.width > 0 ? (
            <div
              className="relative mx-auto"
              style={{ width: displaySize.width, height: displaySize.height }}
            >
              {/* Image */}
              <img
                src={imageUrl}
                crossOrigin="anonymous"
                alt="Crop source"
                className="block"
                style={{ width: displaySize.width, height: displaySize.height }}
                draggable={false}
              />
              {/* Dark overlay outside crop */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `linear-gradient(to right, 
                    rgba(0,0,0,0.5) ${(crop.x / displaySize.width) * 100}%, 
                    transparent ${(crop.x / displaySize.width) * 100}%, 
                    transparent ${((crop.x + crop.width) / displaySize.width) * 100}%, 
                    rgba(0,0,0,0.5) ${((crop.x + crop.width) / displaySize.width) * 100}%)`,
                }}
              />
              {/* Top overlay */}
              <div
                className="absolute left-0 right-0 top-0 pointer-events-none bg-black/50"
                style={{ height: crop.y }}
              />
              {/* Bottom overlay */}
              <div
                className="absolute left-0 right-0 bottom-0 pointer-events-none bg-black/50"
                style={{ height: displaySize.height - crop.y - crop.height }}
              />

              {/* Crop rectangle */}
              <div
                className="absolute border-2 border-primary cursor-move"
                style={{
                  left: crop.x,
                  top: crop.y,
                  width: crop.width,
                  height: crop.height,
                }}
                onMouseDown={(e) => handleMouseDown(e, 'move')}
              >
                {/* Grid lines */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-primary/30" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-primary/30" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-primary/30" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-primary/30" />
                </div>
                {/* Resize handle (bottom-right) */}
                <div
                  className="absolute -bottom-2 -right-2 w-4 h-4 bg-primary rounded-full cursor-se-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'resize')}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !imgLoaded}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Crop'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
