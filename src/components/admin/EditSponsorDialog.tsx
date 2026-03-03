'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Trash2 } from 'lucide-react';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface Sponsor {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string;
  notes: string | null;
  status: string | null;
  partnership_type: string | null;
  created_at: string | null;
}

interface EditSponsorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sponsor: Sponsor | null;
  onSuccess?: () => void;
}

export function EditSponsorDialog({ open, onOpenChange, sponsor, onSuccess }: EditSponsorDialogProps) {
  const [loading, setloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    notes: '',
    status: 'active',
    partnership_type: 'sponsor',
  });

  useEffect(() => {
    if (sponsor) {
      setFormData({
        company_name: sponsor.company_name || '',
        contact_name: sponsor.contact_name || '',
        email: sponsor.email || '',
        notes: sponsor.notes || '',
        status: sponsor.status || 'active',
        partnership_type: sponsor.partnership_type || 'sponsor',
      });
    }
  }, [sponsor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sponsor) return;

    setloading(true);
    try {
      const { error } = await supabase
        .from('sponsors_vendors')
        .update({
          company_name: formData.company_name.trim(),
          contact_name: formData.contact_name.trim() || null,
          email: formData.email.trim().toLowerCase(),
          notes: formData.notes.trim() || null,
          status: formData.status,
          partnership_type: formData.partnership_type,
        })
        .eq('id', sponsor.id);

      if (error) throw error;

      toast.success('Sponsor/Vendor updated successfully');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update sponsor/vendor');
    } finally {
      setloading(false);
    }
  };

  const handleDelete = async () => {
    if (!sponsor) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('sponsors_vendors')
        .delete()
        .eq('id', sponsor.id);

      if (error) throw error;

      toast.success('Sponsor/Vendor deleted successfully');
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete sponsor/vendor');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!sponsor) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Sponsor/Vendor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                required
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_name">Contact Name</Label>
              <Input
                id="contact_name"
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="bg-background"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="partnership_type">Type</Label>
                <Select
                  value={formData.partnership_type}
                  onValueChange={(value) => setFormData({ ...formData, partnership_type: value })}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sponsor">Sponsor</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="partner">Partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-background min-h-[80px]"
                placeholder="Add any notes about this sponsor/vendor..."
              />
            </div>
            <DialogFooter className="flex justify-between sm:justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={handleDelete}
        title="Delete Sponsor/Vendor"
        description={`Are you sure you want to delete "${sponsor.company_name}"? This action cannot be undone.`}
        loading={isDeleting}
      />
    </>
  );
}
