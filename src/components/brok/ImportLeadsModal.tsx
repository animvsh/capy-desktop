import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/Badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Dynamic imports for heavy libraries - only loaded when file is selected
// This saves ~400KB from initial bundle
type PapaParseType = typeof import("papaparse");
type PDFJSType = typeof import("pdfjs-dist");

let Papa: PapaParseType | null = null;
let pdfjsLib: PDFJSType | null = null;

async function loadPapaparse(): Promise<PapaParseType> {
  if (!Papa) {
    Papa = await import("papaparse");
  }
  return Papa;
}

async function loadPdfjs(): Promise<PDFJSType> {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist");
    // Set PDF.js worker after loading
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }
  return pdfjsLib;
}

type ImportLeadsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadsImported: () => void;
};

type CSVRow = {
  [key: string]: string;
};

type ParsedLead = {
  name: string;
  email: string;
  company?: string;
  title?: string;
  _raw: CSVRow;
  _errors?: string[];
};

type ColumnMapping = {
  name: string | null;
  email: string | null;
  company: string | null;
  title: string | null;
};

const COLUMN_VARIANTS = {
  name: ['name', 'full name', 'contact name', 'person', 'contact', 'fullname', 'contact_name'],
  email: ['email', 'email address', 'e-mail', 'mail', 'email_address', 'e_mail'],
  company: ['company', 'company name', 'organization', 'org', 'firm', 'company_name', 'organization_name'],
  title: ['title', 'job title', 'role', 'position', 'job', 'job_title', 'jobtitle']
};

function detectColumnMapping(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
  
  const mapping: ColumnMapping = {
    name: null,
    email: null,
    company: null,
    title: null,
  };

  // Find best match for each required field
  for (const header of normalizedHeaders) {
    // Check name
    if (!mapping.name && COLUMN_VARIANTS.name.some(v => header.includes(v))) {
      mapping.name = headers[normalizedHeaders.indexOf(header)];
    }
    // Check email
    if (!mapping.email && COLUMN_VARIANTS.email.some(v => header.includes(v))) {
      mapping.email = headers[normalizedHeaders.indexOf(header)];
    }
    // Check company
    if (!mapping.company && COLUMN_VARIANTS.company.some(v => header.includes(v))) {
      mapping.company = headers[normalizedHeaders.indexOf(header)];
    }
    // Check title
    if (!mapping.title && COLUMN_VARIANTS.title.some(v => header.includes(v))) {
      mapping.title = headers[normalizedHeaders.indexOf(header)];
    }
  }

  return mapping;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type FileType = "csv" | "pdf" | "txt";

export function ImportLeadsModal({ open, onOpenChange, onLeadsImported }: ImportLeadsModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "extracting" | "preview" | "importing" | "complete">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [rawCsvData, setRawCsvData] = useState<CSVRow[]>([]);
  const [extractedText, setExtractedText] = useState<string>("");
  const [pastedText, setPastedText] = useState<string>("");
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    name: null,
    email: null,
    company: null,
    title: null,
  });
  const [importProgress, setImportProgress] = useState({ imported: 0, skipped: 0, failed: 0 });
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; failed: number } | null>(null);

  // Persist state to sessionStorage to survive HMR reloads
  const STORAGE_KEY = "import-leads-state";

  // Restore state on mount
  useEffect(() => {
    if (!open) return;

    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.pastedText) setPastedText(state.pastedText);
        if (state.showPasteInput) setShowPasteInput(state.showPasteInput);
        if (state.parsedLeads?.length > 0) {
          setParsedLeads(state.parsedLeads);
          setStep("preview");
          setFileType(state.fileType || "txt");
        }
        if (state.csvHeaders) setCsvHeaders(state.csvHeaders);
        if (state.columnMapping) setColumnMapping(state.columnMapping);
        if (state.rawCsvData) setRawCsvData(state.rawCsvData);
      }
    } catch (e) {
      console.warn("Failed to restore import state:", e);
    }
  }, [open]);

  // Save state on changes
  useEffect(() => {
    if (!open) return;

    const state = {
      pastedText,
      showPasteInput,
      parsedLeads: step === "preview" ? parsedLeads : [],
      fileType,
      csvHeaders,
      columnMapping,
      rawCsvData: step === "preview" ? rawCsvData : [],
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [open, pastedText, showPasteInput, parsedLeads, fileType, step, csvHeaders, columnMapping, rawCsvData]);

  // Clear storage on close or complete
  const clearStorage = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const parseLeadsWithMapping = (rows: CSVRow[], mapping: ColumnMapping) => {
    const leads: ParsedLead[] = [];
    for (const row of rows) {
      const errors: string[] = [];
      const name = mapping.name ? (row[mapping.name] || '').trim() : '';
      const email = mapping.email ? (row[mapping.email] || '').trim() : '';
      const company = mapping.company ? (row[mapping.company] || '').trim() : undefined;
      const title = mapping.title ? (row[mapping.title] || '').trim() : undefined;

      if (!name) errors.push('Missing name');
      if (!email) errors.push('Missing email');
      if (email && !validateEmail(email)) errors.push('Invalid email format');

      leads.push({
        name,
        email,
        company: company || undefined,
        title: title || undefined,
        _raw: row,
        _errors: errors.length > 0 ? errors : undefined,
      });
    }
    setParsedLeads(leads);
  };

  // Parse PDF file using pdf.js (dynamically loaded)
  const parsePDF = async (file: File): Promise<string> => {
    const pdfjs = await loadPdfjs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }

    return fullText;
  };

  // Parse TXT file
  const parseTXT = async (file: File): Promise<string> => {
    return await file.text();
  };

  // Extract leads from unstructured text using AI
  const extractLeadsFromText = async (text: string): Promise<ParsedLead[]> => {
    setStep("extracting");

    try {
      const response = await supabase.functions.invoke("import-leads-csv", {
        body: {
          action: "extract_leads_from_text",
          text: text.substring(0, 50000), // Limit text size
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const leads = response.data?.leads || [];

      // Validate and format leads
      const parsedLeads: ParsedLead[] = leads.map((lead: any) => {
        const errors: string[] = [];
        if (!lead.name) errors.push("Missing name");
        if (!lead.email) errors.push("Missing email");
        if (lead.email && !validateEmail(lead.email)) errors.push("Invalid email");

        return {
          name: lead.name || "",
          email: lead.email || "",
          company: lead.company || undefined,
          title: lead.title || undefined,
          _raw: lead,
          _errors: errors.length > 0 ? errors : undefined,
        };
      });

      return parsedLeads;
    } catch (error) {
      console.error("Error extracting leads:", error);
      toast({
        title: "Extraction failed",
        description: error instanceof Error ? error.message : "Failed to extract leads from file",
        variant: "destructive",
      });
      return [];
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // Determine file type
    const fileName = selectedFile.name.toLowerCase();
    let detectedType: FileType | null = null;

    if (fileName.endsWith(".csv")) {
      detectedType = "csv";
    } else if (fileName.endsWith(".pdf")) {
      detectedType = "pdf";
    } else if (fileName.endsWith(".txt")) {
      detectedType = "txt";
    }

    if (!detectedType) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV, PDF, or TXT file",
        variant: "destructive",
      });
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB",
        variant: "destructive",
      });
      return;
    }

    setFile(selectedFile);
    setFileType(detectedType);

    // Handle based on file type
    if (detectedType === "csv") {
      parseCSV(selectedFile);
    } else {
      // PDF or TXT - extract text and use AI
      try {
        let text = "";
        if (detectedType === "pdf") {
          text = await parsePDF(selectedFile);
        } else {
          text = await parseTXT(selectedFile);
        }

        setExtractedText(text);

        // Use AI to extract leads
        const leads = await extractLeadsFromText(text);

        if (leads.length === 0) {
          toast({
            title: "No leads found",
            description: "Could not extract any leads from the file. Make sure it contains contact information.",
            variant: "destructive",
          });
          setStep("upload");
          return;
        }

        setParsedLeads(leads);
        setStep("preview");
      } catch (error) {
        console.error("Error processing file:", error);
        toast({
          title: "Processing failed",
          description: error instanceof Error ? error.message : "Failed to process file",
          variant: "destructive",
        });
        setStep("upload");
      }
    }
  };

  // Handle pasted text submission
  const handlePasteSubmit = async () => {
    if (!pastedText.trim() || pastedText.trim().length < 20) {
      toast({
        title: "Not enough text",
        description: "Please paste more text containing lead information",
        variant: "destructive",
      });
      return;
    }

    setFileType("txt");
    setExtractedText(pastedText);

    try {
      const leads = await extractLeadsFromText(pastedText);

      if (leads.length === 0) {
        toast({
          title: "No leads found",
          description: "Could not extract any leads from the text. Make sure it contains contact information with emails.",
          variant: "destructive",
        });
        setStep("upload");
        return;
      }

      setParsedLeads(leads);
      setStep("preview");
    } catch (error) {
      console.error("Error processing pasted text:", error);
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "Failed to process text",
        variant: "destructive",
      });
      setStep("upload");
    }
  };

  const parseCSV = async (file: File) => {
    const papa = await loadPapaparse();
    papa.default.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          toast({
            title: "CSV parsing errors",
            description: `Found ${results.errors.length} parsing errors. Some rows may be skipped.`,
            variant: "destructive",
          });
        }

        const headers = results.meta.fields || [];
        if (headers.length === 0) {
          toast({
            title: "Invalid CSV",
            description: "Could not detect column headers",
            variant: "destructive",
          });
          return;
        }

        setCsvHeaders(headers);
        const detectedMapping = detectColumnMapping(headers);
        setColumnMapping(detectedMapping);
        setRawCsvData(results.data as CSVRow[]);

        // Validate required columns
        if (!detectedMapping.name || !detectedMapping.email) {
          toast({
            title: "Missing required columns",
            description: "Could not detect 'name' and 'email' columns. Please map them manually.",
          });
        }

        // Parse and validate rows with detected mapping
        parseLeadsWithMapping(results.data as CSVRow[], detectedMapping);
        setStep("preview");
      },
      error: (error) => {
        toast({
          title: "Failed to parse CSV",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  // Re-parse when column mapping changes
  const handleColumnMappingChange = (field: keyof ColumnMapping, value: string | null) => {
    const newMapping = { ...columnMapping, [field]: value };
    setColumnMapping(newMapping);
    if (rawCsvData.length > 0) {
      parseLeadsWithMapping(rawCsvData, newMapping);
    }
  };

  const handleImport = async () => {
    // Only require column mapping for CSV files
    if (fileType === "csv" && (!columnMapping.name || !columnMapping.email)) {
      toast({
        title: "Missing required columns",
        description: "Please map 'name' and 'email' columns",
        variant: "destructive",
      });
      return;
    }

    const validLeads = parsedLeads.filter(l => !l._errors);
    if (validLeads.length === 0) {
      toast({
        title: "No valid leads",
        description: "Please fix errors in your file",
        variant: "destructive",
      });
      return;
    }

    setStep("importing");
    setImportProgress({ imported: 0, skipped: 0, failed: 0 });

    try {
      // Prepare data for import
      const leadsData = validLeads.map(lead => ({
        name: lead.name,
        email: lead.email,
        company: lead.company || null,
        title: lead.title || null,
      }));

      // Update progress during import
      setImportProgress({ imported: 0, skipped: 0, failed: 0 });

      const response = await supabase.functions.invoke("import-leads-csv", {
        body: {
          action: "import_leads",
          leads: leadsData,
          source: fileType || "csv",
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Import failed");
      }

      const result = response.data;
      if (!result.success) {
        throw new Error(result.error || "Import failed");
      }

      setImportResult({
        imported: result.imported || 0,
        skipped: result.skipped || 0,
        failed: result.failed || 0,
      });

      toast({
        title: "Import complete!",
        description: `Imported ${result.imported || 0} leads successfully${result.skipped > 0 ? ` (${result.skipped} duplicates skipped)` : ''}`,
      });

      setStep("complete");
      onLeadsImported();
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      setStep("preview");
    }
  };

  const handleReset = () => {
    setFile(null);
    setFileType(null);
    setCsvHeaders([]);
    setParsedLeads([]);
    setRawCsvData([]);
    setExtractedText("");
    setPastedText("");
    setShowPasteInput(false);
    setColumnMapping({ name: null, email: null, company: null, title: null });
    setImportProgress({ imported: 0, skipped: 0, failed: 0 });
    setImportResult(null);
    setStep("upload");
    clearStorage();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Get file type icon
  const getFileIcon = () => {
    switch (fileType) {
      case "csv":
        return <i className="fa-solid fa-file-csv h-5 w-5" />;
      case "pdf":
        return <i className="fa-solid fa-file-pdf h-5 w-5" />;
      default:
        return <i className="fa-solid fa-file h-5 w-5" />;
    }
  };

  const validLeads = parsedLeads.filter(l => !l._errors);
  const invalidLeads = parsedLeads.filter(l => l._errors);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <i className="fa-solid fa-upload h-5 w-5" />
            Import Leads
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === "upload" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-6">
              {!showPasteInput ? (
                <>
                  <div className="rounded-full bg-primary/10 p-6">
                    <i className="fa-solid fa-upload h-12 w-12 text-primary" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-semibold">Import Your Leads</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Upload a file or paste text containing lead information.
                      We'll use AI to extract contacts from any format.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Badge variant="outline" className="gap-1">
                      <i className="fa-solid fa-file-csv h-3 w-3" />
                      CSV
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <i className="fa-solid fa-file-pdf h-3 w-3" />
                      PDF
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <i className="fa-solid fa-file h-3 w-3" />
                      TXT
                    </Badge>
                  </div>
                  <div className="flex gap-3 items-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.pdf,.txt"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                    />
                    <Label htmlFor="file-upload">
                      <Button asChild className="rounded-full">
                        <span>
                          <i className="fa-solid fa-upload h-4 w-4 mr-2" />
                          Choose File
                        </span>
                      </Button>
                    </Label>
                    <span className="text-sm text-muted-foreground">or</span>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setShowPasteInput(true)}
                    >
                      <i className="fa-solid fa-file-lines h-4 w-4 mr-2" />
                      Paste Text
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Max file size: 10MB
                  </p>
                </>
              ) : (
                <div className="w-full space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Paste Lead Information</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setShowPasteInput(false); setPastedText(""); }}
                    >
                      <i className="fa-solid fa-xmark h-4 w-4 mr-1" />
                      Back
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Paste any text containing contact information - emails, names, companies, etc.
                    Our AI will extract the leads automatically.
                  </p>
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste lead information here...

Example:
John Smith - john@company.com - CEO at Acme Inc
Jane Doe, jane.doe@startup.io, Marketing Director, StartupXYZ
..."
                    className="w-full h-48 p-3 rounded-xl border-2 border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => { setShowPasteInput(false); setPastedText(""); }}
                      className="rounded-full"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handlePasteSubmit}
                      disabled={!pastedText.trim() || pastedText.trim().length < 20}
                      className="rounded-full"
                    >
                      <i className="fa-solid fa-wand-magic-sparkles h-4 w-4 mr-2" />
                      Extract Leads
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "extracting" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 py-12">
              <div className="relative">
                <i className="fa-solid fa-spinner fa-spin h-12 w-12 text-primary" />
                <i className="fa-solid fa-wand-magic-sparkles h-5 w-5 text-yellow-500 absolute -top-1 -right-1" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">Extracting Leads with AI</h3>
                <p className="text-sm text-muted-foreground">
                  Analyzing your {fileType?.toUpperCase()} file to find contacts...
                </p>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {parsedLeads.length} leads found
                    </p>
                    <Badge variant="secondary" className="text-xs gap-1">
                      {getFileIcon()}
                      {fileType?.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {validLeads.length} valid
                    </Badge>
                    {invalidLeads.length > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {invalidLeads.length} errors
                      </Badge>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <i className="fa-solid fa-xmark h-4 w-4 mr-2" />
                  Reset
                </Button>
              </div>

              {/* Column Mapping - Only for CSV */}
              {fileType === "csv" && (
              <div className="rounded-lg border p-4 space-y-3">
                <Label className="text-sm font-semibold">Column Mapping</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Name *</Label>
                    <select
                      value={columnMapping.name || ''}
                      onChange={(e) => handleColumnMappingChange('name', e.target.value || null)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="">Select column...</option>
                      {csvHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email *</Label>
                    <select
                      value={columnMapping.email || ''}
                      onChange={(e) => handleColumnMappingChange('email', e.target.value || null)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="">Select column...</option>
                      {csvHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Company</Label>
                    <select
                      value={columnMapping.company || ''}
                      onChange={(e) => handleColumnMappingChange('company', e.target.value || null)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="">Select column...</option>
                      {csvHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Title</Label>
                    <select
                      value={columnMapping.title || ''}
                      onChange={(e) => handleColumnMappingChange('title', e.target.value || null)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="">Select column...</option>
                      {csvHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              )}

              {/* AI Extraction Note for non-CSV */}
              {fileType !== "csv" && (
                <Alert className="bg-primary/5 border-primary/20">
                  <i className="fa-solid fa-wand-magic-sparkles h-4 w-4 text-primary" />
                  <AlertDescription className="text-sm">
                    Leads extracted using AI from your {fileType?.toUpperCase()} file.
                    Review the results below before importing.
                  </AlertDescription>
                </Alert>
              )}

              {/* Preview Table */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedLeads.slice(0, 50).map((lead, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          {lead._errors ? (
                            <i className="fa-solid fa-circle-exclamation h-4 w-4 text-destructive" />
                          ) : (
                            <i className="fa-solid fa-circle-check h-4 w-4 text-forest" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{lead.name || '-'}</TableCell>
                        <TableCell>{lead.email || '-'}</TableCell>
                        <TableCell>{lead.company || '-'}</TableCell>
                        <TableCell>{lead.title || '-'}</TableCell>
                        <TableCell>
                          {lead._errors ? (
                            <Badge variant="destructive" className="text-xs">
                              {lead._errors.join(', ')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Valid</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedLeads.length > 50 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Showing first 50 of {parsedLeads.length} rows
                  </div>
                )}
              </div>

              {invalidLeads.length > 0 && (
                <Alert variant="destructive">
                  <i className="fa-solid fa-circle-exclamation h-4 w-4" />
                  <AlertDescription>
                    {invalidLeads.length} row(s) have errors and will be skipped during import.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleReset}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={fileType === "csv" ? (!columnMapping.name || !columnMapping.email || validLeads.length === 0) : validLeads.length === 0}
                  className="rounded-full"
                >
                  Import {validLeads.length} Leads
                  <i className="fa-solid fa-arrow-right h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 py-12">
              <i className="fa-solid fa-spinner fa-spin h-12 w-12 text-primary" />
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">Importing Leads</h3>
                <p className="text-sm text-muted-foreground">
                  Processing and enriching your leads with AI...
                </p>
                <div className="flex gap-4 mt-4 text-sm">
                  <div>
                    <span className="font-medium">{importProgress.imported}</span> imported
                  </div>
                  {importProgress.skipped > 0 && (
                    <div>
                      <span className="font-medium">{importProgress.skipped}</span> skipped
                    </div>
                  )}
                  {importProgress.failed > 0 && (
                    <div className="text-destructive">
                      <span className="font-medium">{importProgress.failed}</span> failed
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === "complete" && importResult && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 py-12">
              <div className="rounded-full bg-forest/10 p-6">
                <i className="fa-solid fa-circle-check h-12 w-12 text-forest" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">Import Complete!</h3>
                <div className="space-y-1 text-sm">
                  <p className="text-foreground">
                    <span className="font-bold text-forest">{importResult.imported}</span> leads imported successfully
                  </p>
                  {importResult.skipped > 0 && (
                    <p className="text-muted-foreground">
                      {importResult.skipped} leads skipped (duplicates)
                    </p>
                  )}
                  {importResult.failed > 0 && (
                    <p className="text-destructive">
                      {importResult.failed} leads failed to import
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Leads are being scored and will be added to your outreach queue automatically.
                </p>
              </div>
              <Button onClick={() => { handleReset(); onOpenChange(false); }} className="rounded-full">
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

