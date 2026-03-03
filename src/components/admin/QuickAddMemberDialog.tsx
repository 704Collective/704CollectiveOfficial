'use client';

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface QuickAddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface FormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  stripe_customer_id: string;
  subscription_status: "active" | "inactive";
  send_email: boolean;
}

const defaultForm: FormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  stripe_customer_id: "",
  subscription_status: "active",
  send_email: true,
};

export function QuickAddMemberDialog({ open, onOpenChange, onSuccess }: QuickAddMemberDialogProps) {
  const [loading, setloading] = useState(false);
  const [formData, setFormData] = useState<FormData>({ ...defaultForm });
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setFormData({ ...defaultForm });
    setError(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setError("First and last name are required");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim() || !emailRegex.test(formData.email.trim())) {
      setError("A valid email is required");
      return;
    }

    setloading(true);

    try {
      const member: Record<string, string> = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
      };
      if (formData.phone.trim()) member.phone = formData.phone.trim();
      if (formData.stripe_customer_id.trim()) member.stripe_customer_id = formData.stripe_customer_id.trim();

      const { data, error: fnError } = await supabase.functions.invoke("import-members", {
        body: {
          members: [member],
          sendEmails: formData.send_email,
          membershipTier: "social",
          origin: window.location.origin,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const result = data?.results?.[0];
      if (result?.status === "failed") {
        throw new Error(result.error || "Failed to add member");
      }

      if (result?.status === "already_exists") {
        setError(`${formData.email.trim()} already exists`);
        setloading(false);
        return;
      }

      const fullName = `${formData.first_name.trim()} ${formData.last_name.trim()}`;
      toast.success(`${fullName} has been added`);
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    } finally {
      setloading(false);
    }
  };

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Add Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qa_first_name">First Name *</Label>
              <Input
                id="qa_first_name"
                value={formData.first_name}
                onChange={(e) => updateField("first_name", e.target.value)}
                placeholder="First name"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa_last_name">Last Name *</Label>
              <Input
                id="qa_last_name"
                value={formData.last_name}
                onChange={(e) => updateField("last_name", e.target.value)}
                placeholder="Last name"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qa_email">Email *</Label>
            <Input
              id="qa_email"
              type="email"
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="email@example.com"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qa_phone">Phone (optional)</Label>
            <Input
              id="qa_phone"
              value={formData.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              placeholder="(555) 123-4567"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qa_stripe">Stripe Customer ID (optional)</Label>
            <Input
              id="qa_stripe"
              value={formData.stripe_customer_id}
              onChange={(e) => updateField("stripe_customer_id", e.target.value)}
              placeholder="cus_..."
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label>Membership Status</Label>
            <Select
              value={formData.subscription_status}
              onValueChange={(v) => updateField("subscription_status", v)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="qa_send_email"
              checked={formData.send_email}
              onCheckedChange={(checked) => updateField("send_email", !!checked)}
              disabled={loading}
            />
            <Label htmlFor="qa_send_email" className="text-sm font-normal cursor-pointer">
              Send password setup email
            </Label>
          </div>

          {error && (
            <p className="text-sm text-destructive font-medium">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Member"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
