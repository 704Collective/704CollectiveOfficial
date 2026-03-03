'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useState, useRef, useCallback } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Upload, FileText, X, Check, AlertCircle, SkipForward, Download,
  ArrowLeft, Loader2,
} from "lucide-react";
import { useEffect } from "react";

interface CSVRow {
  [key: string]: string;
}

interface MappedMember {
  first_name: string;
  last_name: string;
  email: string;
  stripe_customer_id?: string;
}

interface ValidationResult {
  ready: MappedMember[];
  existing: string[];
  invalid: Array<{ row: number; email: string; issue: string }>;
}

interface ImportResult {
  email: string;
  name: string;
  status: "created" | "already_exists" | "failed";
  error?: string;
}

type ImportStep = "upload" | "map" | "preview" | "importing" | "results";

const COMMON_MAPPINGS: Record<string, string[]> = {
  first_name: ["first_name", "firstname", "first name", "fname", "given name", "givenname"],
  last_name: ["last_name", "lastname", "last name", "lname", "surname", "family name"],
  email: ["email", "email address", "emailaddress", "e-mail", "mail"],
  stripe_customer_id: ["stripe_customer_id", "stripe_id", "customer_id", "stripe"],
};

function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(COMMON_MAPPINGS)) {
    const match = headers.find((h) => aliases.includes(h.toLowerCase().trim()));
    if (match) mapping[field] = match;
  }
  return mapping;
}

function parseCSV(text: string): { headers: string[]; rows: CSVRow[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: CSVRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

export default function ImportMembers() {
  const router = useRouter();
  const { user, isAdmin, loading: authLoading } = useAuth();
  usePageTitle("Import Members");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sendEmails, setSendEmails] = useState(true);
  const [setActive, setSetActive] = useState(true);
  const [membershipTier, setMembershipTier] = useState("social");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importSummary, setImportSummary] = useState<{ created: number; skipped: number; failed: number } | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      router.push("/admin/login");
    }
  }, [user, isAdmin, authLoading, router]);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please select a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows: r } = parseCSV(text);
      if (h.length === 0 || r.length === 0) {
        toast.error("CSV file appears empty or invalid");
        return;
      }
      setHeaders(h);
      setRows(r);
      setFileName(file.name);
      setMapping(autoDetectMapping(h));
      setStep("map");
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleValidate = async () => {
    setIsValidating(true);

    const requiredFields = ["first_name", "last_name", "email"];
    const unmapped = requiredFields.filter((f) => !mapping[f]);
    if (unmapped.length > 0) {
      toast.error(`Please map required fields: ${unmapped.join(", ")}`);
      setIsValidating(false);
      return;
    }

    const ready: MappedMember[] = [];
    const invalid: Array<{ row: number; email: string; issue: string }> = [];
    const seenEmails = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const email = row[mapping.email]?.trim()?.toLowerCase();
      const firstName = row[mapping.first_name]?.trim();
      const lastName = row[mapping.last_name]?.trim();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        invalid.push({ row: i + 2, email: email || "(empty)", issue: "Invalid email" });
        continue;
      }
      if (!firstName && !lastName) {
        invalid.push({ row: i + 2, email, issue: "Name is empty" });
        continue;
      }
      if (seenEmails.has(email)) {
        invalid.push({ row: i + 2, email, issue: "Duplicate email in CSV" });
        continue;
      }
      seenEmails.add(email);

      const member: MappedMember = { first_name: firstName, last_name: lastName, email };
      if (mapping.stripe_customer_id && row[mapping.stripe_customer_id]) {
        member.stripe_customer_id = row[mapping.stripe_customer_id].trim();
      }
      ready.push(member);
    }

    // Check existing emails in batches
    const existing: string[] = [];
    const finalReady: MappedMember[] = [];

    for (let i = 0; i < ready.length; i += 50) {
      const batch = ready.slice(i, i + 50);
      const emails = batch.map((m) => m.email);
      const { data } = await supabase
        .from("profiles")
        .select("email")
        .in("email", emails);

      const existingSet = new Set((data || []).map((p) => p.email.toLowerCase()));
      for (const m of batch) {
        if (existingSet.has(m.email)) {
          existing.push(m.email);
        } else {
          finalReady.push(m);
        }
      }
    }

    setValidation({ ready: finalReady, existing, invalid });
    setStep("preview");
    setIsValidating(false);
  };

  const handleImport = async () => {
    if (!validation || validation.ready.length === 0) return;

    setStep("importing");
    setIsImporting(true);
    setImportProgress(0);

    try {
      const { data, error } = await supabase.functions.invoke("import-members", {
        body: {
          members: validation.ready,
          sendEmails,
          membershipTier,
          origin: window.location.origin,
        },
      });

      if (error) throw error;

      setImportResults(data.results || []);
      setImportSummary(data.summary || { created: 0, skipped: 0, failed: 0 });
      setImportProgress(100);
      setStep("results");
    } catch (err: any) {
      toast.error(err.message || "Import failed");
      setStep("preview");
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadResults = () => {
    if (!importResults.length) return;
    const csvContent = [
      "Name,Email,Status,Error",
      ...importResults.map((r) =>
        `"${r.name}","${r.email}","${r.status}","${r.error || ""}"`
      ),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setStep("upload");
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setValidation(null);
    setImportResults([]);
    setImportSummary(null);
    setImportProgress(0);
  };

  if (authLoading) return null;

  return (
    <AdminLayout title="Import Members">
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => router.push("/admin")} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Admin
        </Button>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <Card>
            <CardContent className="p-8">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
              >
                <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium mb-1">Drop your CSV file here or click to browse</p>
                <p className="text-sm text-muted-foreground">Only .csv files accepted</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 2: Column Mapping */}
        {step === "map" && (
          <>
            {/* File info */}
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">{fileName}</p>
                    <p className="text-sm text-muted-foreground">{rows.length} rows found</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={handleReset}>
                  <X className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>

            {/* Preview table */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Preview (first 10 rows)</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headers.map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          {headers.map((h) => (
                            <TableCell key={h} className="text-sm">{row[h]}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {rows.length > 10 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Showing 10 of {rows.length} total rows
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Column mapping */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold">Column Mapping</h3>
                {(["first_name", "last_name", "email", "stripe_customer_id"] as const).map((field) => {
                  const isRequired = ["first_name", "last_name", "email"].includes(field);
                  const isMapped = !!mapping[field];
                  return (
                    <div key={field} className="flex items-center gap-4">
                      <div className="w-40 flex items-center gap-2">
                        {isMapped ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : isRequired ? (
                          <AlertCircle className="w-4 h-4 text-yellow-500" />
                        ) : (
                          <div className="w-4" />
                        )}
                        <span className="text-sm font-medium">
                          {field.replace(/_/g, " ")}
                          {isRequired && <span className="text-destructive ml-1">*</span>}
                        </span>
                      </div>
                      <Select
                        value={mapping[field] || ""}
                        onValueChange={(v) => setMapping((prev) => ({ ...prev, [field]: v }))}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select column..." />
                        </SelectTrigger>
                        <SelectContent>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Import options */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold">Import Options</h3>
                <div className="flex items-center gap-3">
                  <Checkbox id="sendEmails" checked={sendEmails} onCheckedChange={(c) => setSendEmails(!!c)} />
                  <label htmlFor="sendEmails" className="text-sm">Send password setup emails after import</label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox id="setActive" checked={setActive} onCheckedChange={(c) => setSetActive(!!c)} />
                  <label htmlFor="setActive" className="text-sm">Set all members as active</label>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">Membership tier:</span>
                  <Select value={membershipTier} onValueChange={setMembershipTier}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="social">Social</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleValidate} disabled={isValidating}>
                {isValidating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Preview Import
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Validation Preview */}
        {step === "preview" && validation && (
          <>
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold text-lg">Import Preview</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium">Ready to import</span>
                    </div>
                    <p className="text-2xl font-bold text-green-500">{validation.ready.length}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <SkipForward className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm font-medium">Already exist (skipped)</span>
                    </div>
                    <p className="text-2xl font-bold text-yellow-500">{validation.existing.length}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                      <span className="text-sm font-medium">Invalid rows</span>
                    </div>
                    <p className="text-2xl font-bold text-destructive">{validation.invalid.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {validation.existing.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2 text-sm">Existing members (will be skipped):</h4>
                  <div className="flex flex-wrap gap-2">
                    {validation.existing.map((email) => (
                      <Badge key={email} variant="secondary" className="text-xs">{email}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {validation.invalid.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2 text-sm">Invalid rows:</h4>
                  <div className="space-y-1">
                    {validation.invalid.map((item, i) => (
                      <p key={i} className="text-sm text-destructive">
                        Row {item.row}: {item.email} — {item.issue}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("map")}>Back</Button>
              <Button
                onClick={handleImport}
                disabled={validation.ready.length === 0}
              >
                Start Import ({validation.ready.length} members)
              </Button>
            </div>
          </>
        )}

        {/* Step 4: Importing */}
        {step === "importing" && (
          <Card>
            <CardContent className="p-8 text-center space-y-6">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
              <div>
                <h3 className="text-lg font-semibold">Importing Members...</h3>
                <p className="text-muted-foreground mt-1">
                  Processing {validation?.ready.length || 0} members. This may take a moment.
                </p>
              </div>
              <Progress value={isImporting ? 50 : importProgress} className="max-w-md mx-auto" />
              <p className="text-sm text-muted-foreground">Please don't close this page.</p>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Results */}
        {step === "results" && importSummary && (
          <>
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold text-lg">Import Complete</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium">Created</span>
                    </div>
                    <p className="text-2xl font-bold text-green-500">{importSummary.created}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <SkipForward className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm font-medium">Skipped</span>
                    </div>
                    <p className="text-2xl font-bold text-yellow-500">{importSummary.skipped}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                      <span className="text-sm font-medium">Failed</span>
                    </div>
                    <p className="text-2xl font-bold text-destructive">{importSummary.failed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results table */}
            <Card>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResults.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>{r.email}</TableCell>
                          <TableCell>
                            {r.status === "created" && (
                              <Badge className="bg-green-500/10 text-green-500">Created</Badge>
                            )}
                            {r.status === "already_exists" && (
                              <Badge variant="secondary">Skipped</Badge>
                            )}
                            {r.status === "failed" && (
                              <Badge variant="destructive">Failed</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.error || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={handleDownloadResults} className="gap-2">
                <Download className="w-4 h-4" />
                Download Results
              </Button>
              <Button onClick={handleReset}>Import More</Button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
