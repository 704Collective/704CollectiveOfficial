'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, GripVertical, Loader2, Image as ImageIcon, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface HomepageImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  display_order: number;
  is_active: boolean;
}

interface AdminHomepageImagesProps {
  userId: string;
}

export function AdminHomepageImages({ userId }: AdminHomepageImagesProps) {
  const [images, setImages] = useState<HomepageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingImage, setEditingImage] = useState<HomepageImage | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSaving, setCropSaving] = useState(false);
  const [editAltText, setEditAltText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    const { data } = await supabase
      .from('homepage_images')
      .select('*')
      .order('display_order', { ascending: true });
    if (data) setImages(data);
    setLoading(false);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `homepage/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('public-assets').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('public-assets').getPublicUrl(filePath);
      const { error: dbError } = await supabase.from('homepage_images').insert({
        image_url: publicUrl,
        alt_text: file.name.split('.')[0],
        display_order: images.length,
        uploaded_by: userId,
      });
      if (dbError) throw dbError;
      toast.success('Image uploaded');
      fetchImages();
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload image');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (image: HomepageImage) => {
    if (!confirm('Delete this image?')) return;
    try {
      const url = new URL(image.image_url);
      const pathParts = url.pathname.split('/');
      const filePath = pathParts.slice(pathParts.indexOf('public-assets') + 1).join('/');
      await supabase.storage.from('public-assets').remove([filePath]);
      const { error } = await supabase.from('homepage_images').delete().eq('id', image.id);
      if (error) throw error;
      toast.success('Image deleted');
      fetchImages();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete image');
    }
  };

  const handleToggleActive = async (image: HomepageImage) => {
    const { error } = await supabase
      .from('homepage_images')
      .update({ is_active: !image.is_active })
      .eq('id', image.id);
    if (error) {
      toast.error('Failed to update image');
      return;
    }
    fetchImages();
  };

  const openEdit = (image: HomepageImage) => {
    setEditingImage(image);
    setEditAltText(image.alt_text || '');
  };

  const openCrop = () => setCropOpen(true);

  const handleCropSave = async (blob: Blob) => {
    if (!editingImage) return;
    setCropSaving(true);
    try {
      // Upload cropped image
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const filePath = `homepage/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('public-assets').upload(filePath, blob, {
        contentType: 'image/jpeg',
      });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('public-assets').getPublicUrl(filePath);

      // Delete old file from storage
      try {
        const oldUrl = new URL(editingImage.image_url);
        const pathParts = oldUrl.pathname.split('/');
        const oldPath = pathParts.slice(pathParts.indexOf('public-assets') + 1).join('/');
        await supabase.storage.from('public-assets').remove([oldPath]);
      } catch {}

      // Update DB
      const { error: dbError } = await supabase
        .from('homepage_images')
        .update({ image_url: publicUrl })
        .eq('id', editingImage.id);
      if (dbError) throw dbError;

      toast.success('Image cropped and saved');
      setCropOpen(false);
      setEditingImage(null);
      fetchImages();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save crop');
    } finally {
      setCropSaving(false);
    }
  };

  const handleAltTextSave = async () => {
    if (!editingImage) return;
    const { error } = await supabase
      .from('homepage_images')
      .update({ alt_text: editAltText })
      .eq('id', editingImage.id);
    if (error) {
      toast.error('Failed to update alt text');
      return;
    }
    toast.success('Alt text updated');
    setEditingImage(null);
    fetchImages();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-medium">Homepage Images</h4>
          <p className="text-sm text-muted-foreground">
            Upload images for the homepage hero section (max 6)
          </p>
        </div>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || images.length >= 6}
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Upload Image
            </>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {images.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No images uploaded yet</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Upload First Image
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {images.map((image) => (
            <div
              key={image.id}
              className={`flex items-center gap-2 sm:gap-4 p-3 rounded-lg border ${
                image.is_active ? 'border-border' : 'border-border/50 opacity-60'
              }`}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
              <img
                src={image.image_url}
                alt={image.alt_text || 'Homepage image'}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {image.alt_text || 'Untitled'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {image.is_active ? 'Visible' : 'Hidden'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(image)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleActive(image)}>
                  <span className="text-xs">{image.is_active ? 'Hide' : 'Show'}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(image)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog (alt text + crop button) */}
      <Dialog open={!!editingImage && !cropOpen} onOpenChange={(o) => !o && setEditingImage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Image</DialogTitle>
          </DialogHeader>
          {editingImage && (
            <div className="space-y-4">
              <img
                src={editingImage.image_url}
                alt={editingImage.alt_text || ''}
                className="w-full max-h-48 object-contain rounded-lg bg-muted"
              />
              <div className="space-y-2">
                <Label htmlFor="alt-text">Alt Text</Label>
                <Input
                  id="alt-text"
                  value={editAltText}
                  onChange={(e) => setEditAltText(e.target.value)}
                  placeholder="Describe this image"
                />
              </div>
              <Button variant="outline" className="w-full" onClick={openCrop}>
                <Pencil className="w-4 h-4 mr-2" />
                Crop Image
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingImage(null)}>Cancel</Button>
            <Button onClick={handleAltTextSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Crop dialog */}
      {editingImage && (
        <ImageCropDialog
          imageUrl={editingImage.image_url}
          open={cropOpen}
          onSave={handleCropSave}
          onClose={() => setCropOpen(false)}
          saving={cropSaving}
        />
      )}
    </div>
  );
}
