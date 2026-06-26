import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useListCustomers,
  useCreateCustomer,
  useGetMe,
  useGetRmPrices,
  useCreateQuote,
  useGetQuotesByProject,
  useGetProjectsByCustomer,
  getListCustomersQueryKey,
  getGetProjectsByCustomerQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { formatINR } from "@/lib/costCalculator";
import { buildRMData, calculateCostSheet, buildDefaultInputs, getDistinctMakes, MASTER_SPECS } from "@/lib/v6/engine";
import { toLegacyShape } from "@/lib/v6/legacy";
import { ChevronRight, ChevronLeft, Check, Plus, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SearchableSelect } from "@/components/searchable-select";

// Structure families. Names trace exactly to MASTER_SPECS keys in the v6
// workbook. The schema on each spec (tlt5/subp/rsj/hwfast/railc/misc/bfb)
// drives which Step-2 selectors render and how the RM price is built.
const STRUCTURE_FAMILIES: { group: string; items: string[] }[] = [
  {
    group: "Transmission Line Towers (TLT)",
    items: ["TLT >800 mt", "TLT 401-800 mt", "TLT 151 - 400 mt "],
  },
  {
    group: "Sub-Station (Lattice)",
    items: ["Sub-Station (L) >800 mt ", "Sub-Station (L) 401- 800 mt", "Sub Station (L) - 151 - 400 mt "],
  },
  {
    group: "Outsourced TLT",
    items: ["out source < 150 mt "],
  },
  {
    group: "RSJ Poles",
    items: ["RSJ Pole - Base Plate "],
  },
  {
    group: "Fasteners & Foundation Bolts",
    items: ["Fasteners", "Foundation Bolts"],
  },
  {
    group: "Railways",
    items: ["RLY-Mast", "RLY - Portal", "Rly - SPS", "Rly - Sp. Masts ", "RLY-Drop Tubes", "RLY-BFBRSJ"],
  },
];

// Make / RM-category options for the TLT / Sub-Station family, exactly as the
// source data-validation lists define them. Do NOT derive these by splitting the
// supplier make tags (that fragments "PG/NTPC" into "PG"+"NTPC" and leaks the
// internal "Tested" tag) — the engine matches on the full tag.
const MAKE_OPTIONS = ["NPG", "MAIN/BSEN", "CORE", "PG/NTPC"];

// Fasteners (hwfast) Make list, exactly as the v6 buildInputForm hardcodes it.
const HWFAST_MAKES = ["NPG", "PG", "MAIN"];

// Fasteners grade list (recorded only — never feeds the cost, faithful to v6).
const GRADE_OPTIONS = ["4.6/5.6", "6.8", "8.8"];

// Build-up field metadata, keyed by v6 input names.
const CONVERSION_FIELDS: { key: string; label: string }[] = [
  { key: "fab_labor", label: "Fabrication — Labour" },
  { key: "weld_cons", label: "Welding & Consumables" },
  { key: "galv_fl", label: "Galvanising — Fuel & Labour" },
  { key: "pack_strn", label: "Packing & Straightening" },
  { key: "load_unload", label: "Loading & Unloading" },
  { key: "handover", label: "Handing Over Charge" },
  { key: "others_conv", label: "Others" },
];

const CONTINGENCY_FIELDS: { key: string; label: string }[] = [
  { key: "inspect_ins", label: "Inspection & Insurance" },
  { key: "sp_packing", label: "Special Packing" },
  { key: "freight_out", label: "Freight Outward" },
  { key: "third_party", label: "Third Party Testing" },
  { key: "agency_comm", label: "Agency Commission" },
  { key: "bg_cost", label: "BG Cost" },
];

const CREDIT_COMPONENTS: { id: string; name: string }[] = [
  { id: "open_p", name: "Open PO" },
  { id: "open_f", name: "Open Final" },
  { id: "emd", name: "EMD" },
  { id: "lc", name: "LC" },
  { id: "vfs", name: "VFS" },
  { id: "abg", name: "ABG" },
  { id: "pbg", name: "PBG" },
  { id: "cpbg", name: "CPBG" },
  { id: "adv", name: "Advance" },
];

const MATERIAL_TYPES = ["MS", "HT"];

export default function Calculator() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: user } = useGetMe();
  const { data: customers } = useListCustomers();
  const createCustomer = useCreateCustomer();
  const createQuote = useCreateQuote();
  const { data: rmPrices } = useGetRmPrices();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);

  // Step 1 State
  const [customerId, setCustomerId] = useState<string>("");
  const [projectRef, setProjectRef] = useState("");
  const [isNewCustomerDialogOpen, setIsNewCustomerDialogOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [isNewProject, setIsNewProject] = useState(false);
  const [prefilledFor, setPrefilledFor] = useState<string>("");

  const custIdNum = parseInt(customerId, 10);

  const { data: customerProjects } = useGetProjectsByCustomer(
    { customerId: custIdNum },
    { query: { enabled: !!custIdNum, queryKey: getGetProjectsByCustomerQueryKey({ customerId: custIdNum }) } }
  );
  const { data: existingQuotes, isFetching: isFetchingQuotes } = useGetQuotesByProject(
    { customerId: custIdNum, projectRef },
    { query: { enabled: !!custIdNum && !!projectRef, queryKey: ["quotes", custIdNum, projectRef] } }
  );
  const nextRevision = existingQuotes ? existingQuotes.length : 0;
  const isResolvingRevision = !!custIdNum && !!projectRef && (isFetchingQuotes || !existingQuotes);

  // Step 2 State
  const [structureType, setStructureType] = useState("");
  const [kvOption, setKvOption] = useState("");

  // RM data derived from the saved console values, evaluated through the v6 engine.
  const rm = useMemo(
    () =>
      buildRMData({
        ...((rmPrices?.dailyData as Record<string, number>) ?? {}),
        ...((rmPrices?.twiceMonthlyData as Record<string, number>) ?? {}),
      }),
    [rmPrices]
  );
  const spec = structureType ? (MASTER_SPECS as Record<string, any>)[structureType] : null;
  const schema = spec?.schema as string | undefined;
  const isKvSchema = schema === "tlt5" || schema === "subp" || schema === "rsj";
  const isHwfast = schema === "hwfast";
  const isRailc = schema === "railc";
  const isManual = !!spec && !isKvSchema && !isHwfast && !isRailc;

  // Railways (channel) Make options: the v6 "full supplier list" (default CORE),
  // de-duplicated case-insensitively so the internal "TESTED"/"Tested" pair shows
  // once. Each option maps to a real supplier price column (engine matches tags).
  const railcMakes = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of getDistinctMakes(rm)) {
      const key = m.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    return out;
  }, [rm]);

  // Step 3 State (v6 input keys)
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [selectedMarginIdx, setSelectedMarginIdx] = useState(0);
  const [notes, setNotes] = useState("");
  // Track which spec the inputs were built for, so we rebuild defaults on change.
  const [inputsForSpec, setInputsForSpec] = useState<string>("");

  // Build default inputs whenever the chosen structure changes.
  useEffect(() => {
    if (!spec || !structureType) return;
    if (inputsForSpec === structureType) return;
    const defaults = buildDefaultInputs(spec, rm);
    const sch = spec.schema;
    const kvLike = sch === "tlt5" || sch === "subp" || sch === "rsj";
    // kvOption holds the primary selection seeded from a prior revision; map it
    // back onto the schema's primary selector field.
    if (kvOption) {
      if (kvLike) defaults.kv = kvOption;
      else if (sch === "hwfast") defaults.hwType = kvOption;
      else if (sch === "railc") defaults.section = kvOption;
    }
    setInputs(defaults);
    const sel = kvLike ? defaults.kv : sch === "hwfast" ? defaults.hwType : sch === "railc" ? defaults.section : "";
    setKvOption(sel ?? "");
    setSelectedMarginIdx(0);
    setInputsForSpec(structureType);
  }, [spec, structureType, rm, kvOption, inputsForSpec]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // When an existing project (new revision) is chosen, default to the Rev 0 structure + kV.
  useEffect(() => {
    if (!projectRef || !existingQuotes || existingQuotes.length === 0) return;
    if (prefilledFor === projectRef) return;
    const rev0 = existingQuotes.find((q) => q.revision === 0) ?? existingQuotes[existingQuotes.length - 1];
    if (rev0 && (MASTER_SPECS as Record<string, any>)[rev0.structureType]) {
      setStructureType(rev0.structureType);
      setKvOption(rev0.kvOption ?? "");
      setInputsForSpec("");
      setPrefilledFor(projectRef);
    }
  }, [projectRef, existingQuotes, prefilledFor]);

  const handleNum = (key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: Number(value) || 0 }));
  };
  // Percent fields stored as decimals (0.04) but entered as whole percents (4).
  const pctValue = (key: string) => Number(((Number(inputs[key]) || 0) * 100).toFixed(4));
  const handlePct = (key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: (Number(value) || 0) / 100 }));
  };
  const handleStr = (key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    // The schema's primary selector is echoed into kvOption (stored + revision seed).
    if (key === "kv" || key === "hwType" || key === "section") setKvOption(value);
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName) return;
    const exists = (customers ?? []).some(
      (c) => c.name.trim().toLowerCase() === newCustomerName.trim().toLowerCase()
    );
    if (exists) {
      toast({ variant: "destructive", title: "Customer Already Exist", description: "Select from Drop down menu" });
      return;
    }
    try {
      const res = await createCustomer.mutateAsync({ data: { name: newCustomerName } });
      await queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      setCustomerId(res.id.toString());
      setProjectRef("");
      setIsNewProject(true);
      setIsNewCustomerDialogOpen(false);
      setNewCustomerName("");
      toast({ title: "Success", description: "Customer created and selected" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleCustomerChange = (val: string) => {
    setCustomerId(val);
    setProjectRef("");
    setIsNewProject(false);
    setPrefilledFor("");
  };

  const handleNextFromStep1 = () => {
    if (isNewProject) {
      const dupe = (customerProjects ?? []).some(
        (p) => p.trim().toLowerCase() === projectRef.trim().toLowerCase()
      );
      if (dupe) {
        toast({ variant: "destructive", title: "Project Already Exist", description: "Select from Drop down menu" });
        return;
      }
    }
    setStep(nextRevision > 0 ? 3 : 2);
  };

  const goBack = () => {
    if (step === 3 && nextRevision > 0) setStep(1);
    else setStep(step - 1);
  };

  // Step 2 is complete once the schema's primary selector has a value.
  const step2Complete =
    !!spec &&
    (isKvSchema
      ? !!inputs.kv
      : isHwfast
        ? !!inputs.hwType
        : isRailc
          ? !!inputs.section
          : isManual
            ? Number(inputs.manualRM) > 0
            : false);

  const results = useMemo(() => {
    if (!spec || !step2Complete) return null;
    try {
      return calculateCostSheet(rm, spec, inputs);
    } catch {
      return null;
    }
  }, [rm, spec, inputs, step2Complete]);

  const quotePrice = results?.margins[selectedMarginIdx]?.quote ?? 0;

  const handleSaveQuote = async () => {
    if (!spec || !results) return;
    try {
      const custId = parseInt(customerId, 10);
      const customerName = customers?.find((c) => c.id === custId)?.name ?? "Unknown";
      const { legacyInputs, legacyCostBreakdown } = toLegacyShape(inputs, results, selectedMarginIdx);
      legacyInputs.notes = notes;
      const saved = await createQuote.mutateAsync({
        data: {
          customerId: custId,
          customerName,
          projectRef,
          structureType,
          kvOption: kvOption || null,
          quotePricePerMt: results.margins[selectedMarginIdx].quote,
          totalCost: results.total,
          steelPrice: results.rmPrice,
          zincPrice: Number(inputs.zinc_price) || 0,
          inputs: legacyInputs,
          costBreakdown: legacyCostBreakdown,
          generatedByName: user?.name || "Unknown",
          notes,
        },
      });
      toast({ title: "Success", description: "Quote saved. Opening Dashboard…" });
      setLocation(`/dashboard?id=${saved.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save quote.";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const canProceedToStep2 = customerId && projectRef;
  const canProceedToStep3 = step2Complete;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calculator</h1>
          <p className="text-muted-foreground">Build a new cost sheet quote</p>
        </div>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button variant="outline" size="sm" onClick={goBack}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted -z-10 rounded"></div>
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary -z-10 rounded transition-all duration-300" style={{ width: `${((step - 1) / 3) * 100}%` }}></div>
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`flex flex-col items-center justify-center w-10 h-10 rounded-full border-2 text-sm font-bold transition-colors ${
            step === s ? "bg-primary border-primary text-primary-foreground" :
            step > s ? "bg-primary border-primary text-primary-foreground" : "bg-card border-muted-foreground/30 text-muted-foreground"
          }`}>
            {step > s ? <Check className="h-5 w-5" /> : s}
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {step === 1 && (
          <div className="p-6 md:p-8 space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold mb-2">Step 1: Project Details</h2>
              <p className="text-sm text-muted-foreground">Select a customer and enter the project reference.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Customer</Label>
                <div className="flex gap-2">
                  <SearchableSelect
                    options={(customers ?? []).map((c) => ({ value: c.id.toString(), label: c.name }))}
                    value={customerId}
                    onValueChange={handleCustomerChange}
                    placeholder="Search and select customer"
                    searchPlaceholder="Type to search 842+ customers…"
                    className="flex-1"
                    data-testid="select-calculator-customer"
                  />
                  <Dialog open={isNewCustomerDialogOpen} onOpenChange={setIsNewCustomerDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="icon" title="Add New Customer">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Customer</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Customer Name</Label>
                          <Input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
                        </div>
                        <Button onClick={handleCreateCustomer} className="w-full" disabled={!newCustomerName || createCustomer.isPending}>
                          {createCustomer.isPending ? "Saving..." : "Create Customer"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Project / PO Ref</Label>
                {!customerId ? (
                  <Input value="" disabled placeholder="Select customer first" />
                ) : isNewProject || !customerProjects || customerProjects.length === 0 ? (
                  <div className="flex gap-2">
                    <Input
                      value={projectRef}
                      onChange={(e) => setProjectRef(e.target.value)}
                      placeholder="e.g. PO-2024-001"
                      className="flex-1"
                      data-testid="input-calculator-project"
                    />
                    {customerProjects && customerProjects.length > 0 && (
                      <Button variant="outline" size="icon" title="Choose existing project" onClick={() => { setIsNewProject(false); setProjectRef(""); }}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <SearchableSelect
                      options={customerProjects.map((p) => ({ value: p, label: p }))}
                      value={projectRef}
                      onValueChange={setProjectRef}
                      placeholder="Select existing project"
                      searchPlaceholder="Search projects…"
                      className="flex-1"
                      data-testid="select-calculator-project"
                    />
                    <Button variant="outline" size="icon" title="Add New Project" onClick={() => { setIsNewProject(true); setProjectRef(""); }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Generated By</Label>
                <Input value={user?.name || ""} disabled className="bg-muted/50" />
              </div>

              <div className="space-y-2">
                <Label>Revision</Label>
                <div className="h-10 flex items-center">
                  <span className="font-mono bg-secondary px-3 py-1 rounded text-sm font-bold text-muted-foreground">
                    Rev {nextRevision}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleNextFromStep1} disabled={!canProceedToStep2 || isResolvingRevision} className="font-bold">
                {nextRevision > 0 ? "Next: Cost Buildup" : "Next: Pick Structure"} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-6 md:p-8 space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold mb-2">Step 2: Pick Structure</h2>
              <p className="text-sm text-muted-foreground">Select the structure, then its specification options.</p>
            </div>

            <div className="space-y-8">
              {STRUCTURE_FAMILIES.map((family) => (
                <div key={family.group} className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
                    {family.group}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {family.items.map((item) => (
                      <Card
                        key={item}
                        className={`cursor-pointer transition-all border ${structureType === item ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border/50 hover:border-primary/50 bg-card/50"}`}
                        onClick={() => { setStructureType(item); setInputsForSpec(""); setKvOption(""); }}
                        data-testid={`card-structure-${item.trim().replace(/\s+/g, "-")}`}
                      >
                        <CardContent className="p-4 flex items-center justify-center text-center min-h-[80px]">
                          <span className="text-sm font-medium leading-tight">{item.trim()}</span>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {spec && (
              <div className="pt-6 border-t border-border/50 grid gap-4 sm:grid-cols-3 animate-in fade-in zoom-in duration-300">
                {isKvSchema && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-primary font-bold">Voltage class (kV)</Label>
                      <Select value={inputs.kv ?? ""} onValueChange={(v) => handleStr("kv", v)}>
                        <SelectTrigger className="border-primary/50" data-testid="select-kv"><SelectValue placeholder="Select voltage…" /></SelectTrigger>
                        <SelectContent side="bottom">
                          {spec.ratios.kv_options.map((o: any) => (
                            <SelectItem key={o.kv} value={o.kv}>{o.kv}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Make</Label>
                      <Select value={inputs.make ?? ""} onValueChange={(v) => handleStr("make", v)}>
                        <SelectTrigger data-testid="select-make"><SelectValue placeholder="Select make…" /></SelectTrigger>
                        <SelectContent side="bottom">
                          {MAKE_OPTIONS.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Material type</Label>
                      <Select value={inputs.matType ?? "MS"} onValueChange={(v) => handleStr("matType", v)}>
                        <SelectTrigger data-testid="select-mat-type"><SelectValue /></SelectTrigger>
                        <SelectContent side="bottom">
                          {MATERIAL_TYPES.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {isHwfast && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-primary font-bold">Type</Label>
                      <Select value={inputs.hwType ?? ""} onValueChange={(v) => handleStr("hwType", v)}>
                        <SelectTrigger className="border-primary/50" data-testid="select-hwtype"><SelectValue placeholder="Select type…" /></SelectTrigger>
                        <SelectContent side="bottom">
                          {(spec.ratios.type_options ?? []).map((o: any) => (
                            <SelectItem key={o.type} value={o.type}>{o.type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Make</Label>
                      <Select value={inputs.make ?? ""} onValueChange={(v) => handleStr("make", v)}>
                        <SelectTrigger data-testid="select-make"><SelectValue placeholder="Select make…" /></SelectTrigger>
                        <SelectContent side="bottom">
                          {HWFAST_MAKES.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Grade</Label>
                      <Select value={inputs.grade ?? ""} onValueChange={(v) => handleStr("grade", v)}>
                        <SelectTrigger data-testid="select-grade"><SelectValue placeholder="Select grade…" /></SelectTrigger>
                        <SelectContent side="bottom">
                          {GRADE_OPTIONS.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {isRailc && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-primary font-bold">Steel section</Label>
                      <Select value={inputs.section ?? ""} onValueChange={(v) => handleStr("section", v)}>
                        <SelectTrigger className="border-primary/50" data-testid="select-section"><SelectValue placeholder="Select section…" /></SelectTrigger>
                        <SelectContent side="bottom">
                          {(spec.ratios.sections ?? []).map((s: any) => (
                            <SelectItem key={s.section} value={s.section}>{s.section}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Make</Label>
                      <Select value={inputs.make ?? ""} onValueChange={(v) => handleStr("make", v)}>
                        <SelectTrigger data-testid="select-make"><SelectValue placeholder="Select make…" /></SelectTrigger>
                        <SelectContent side="bottom">
                          {railcMakes.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Material type</Label>
                      <Select value={inputs.matType ?? "MS"} onValueChange={(v) => handleStr("matType", v)}>
                        <SelectTrigger data-testid="select-mat-type"><SelectValue /></SelectTrigger>
                        <SelectContent side="bottom">
                          {MATERIAL_TYPES.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {isManual && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-primary font-bold">RM price (₹/MT)</Label>
                      <Input
                        type="number"
                        value={inputs.manualRM ?? 0}
                        onChange={(e) => handleNum("manualRM", e.target.value)}
                        className="font-mono border-primary/50"
                        data-testid="input-manual-rm"
                      />
                      <p className="text-xs text-muted-foreground">Enter manually — no section-mix table for this sheet.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Material type</Label>
                      <Select value={inputs.matType ?? "MS"} onValueChange={(v) => handleStr("matType", v)}>
                        <SelectTrigger data-testid="select-mat-type"><SelectValue /></SelectTrigger>
                        <SelectContent side="bottom">
                          {MATERIAL_TYPES.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!canProceedToStep3} className="font-bold">
                Next: Cost Buildup <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-0 sm:p-6 md:p-8 space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="px-4 sm:px-0">
              <h2 className="text-xl font-bold mb-2">Step 3: Cost Buildup</h2>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{customers?.find((c) => c.id.toString() === customerId)?.name}</span> •
                <span className="font-mono">{projectRef}</span> •
                <span>{structureType.trim()} {kvOption ? `(${kvOption})` : ""}</span>
              </div>
            </div>

            <Tabs defaultValue="materials" className="w-full">
              <div className="px-4 sm:px-0 overflow-x-auto pb-2">
                <TabsList className="w-full justify-start inline-flex h-auto p-1 bg-muted/50 rounded-lg">
                  <TabsTrigger value="materials" className="text-xs sm:text-sm py-2">Materials & Zinc</TabsTrigger>
                  <TabsTrigger value="conversion" className="text-xs sm:text-sm py-2">Conversion</TabsTrigger>
                  <TabsTrigger value="finance" className="text-xs sm:text-sm py-2">Finance & Cont.</TabsTrigger>
                  <TabsTrigger value="credit" className="text-xs sm:text-sm py-2">Credit Costs</TabsTrigger>
                  <TabsTrigger value="margin" className="text-xs sm:text-sm py-2 bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Margin</TabsTrigger>
                </TabsList>
              </div>

              <div className="p-4 sm:p-0 mt-4">
                <TabsContent value="materials" className="space-y-8 focus-visible:outline-none">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <h3 className="font-bold text-lg">Raw Material (per MT)</h3>
                      <span className="font-mono text-sm text-primary" data-testid="text-rm-price">RM/MT: {formatINR(results?.rmPrice ?? 0)}</span>
                    </div>
                    {results && results.rmCalc.breakdown.length > 0 && (
                      <div className="bg-muted/20 rounded-lg p-3 text-xs font-mono text-muted-foreground space-y-1">
                        {results.rmCalc.breakdown.map((b, idx) => (
                          <div key={idx} className="flex justify-between gap-4">
                            <span>{b.category} × {(b.ratio * 100).toFixed(1)}%</span>
                            <span>{b.price != null ? formatINR(b.price) : "—"} → {formatINR(b.contrib)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Incidental Charges (₹/MT)</Label>
                        <Input type="number" value={inputs.incidental ?? 0} onChange={(e) => handleNum("incidental", e.target.value)} className="font-mono" data-testid="input-incidental" />
                      </div>
                      <div className="space-y-2">
                        <Label>Scrap % (e.g. 4)</Label>
                        <Input type="number" step="0.1" value={pctValue("scrap_pct")} onChange={(e) => handlePct("scrap_pct", e.target.value)} className="font-mono" data-testid="input-scrap" />
                      </div>
                      <div className="space-y-2">
                        <Label>Recovery % (e.g. -40)</Label>
                        <Input type="number" step="0.1" value={pctValue("recovery_pct")} onChange={(e) => handlePct("recovery_pct", e.target.value)} className="font-mono" data-testid="input-recovery" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-bold text-lg border-b border-border/50 pb-2">Zinc / Galvanising</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Zinc RM Price (₹/MT)</Label>
                        <Input type="number" value={inputs.zinc_price ?? 0} onChange={(e) => handleNum("zinc_price", e.target.value)} className="font-mono" data-testid="input-zinc-price" />
                      </div>
                      <div className="space-y-2">
                        <Label>Zinc Micron (e.g. 0.045)</Label>
                        <Input type="number" step="0.001" value={inputs.zincMicron ?? 0} onChange={(e) => handleNum("zincMicron", e.target.value)} className="font-mono" data-testid="input-zinc-micron" />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="conversion" className="space-y-8 focus-visible:outline-none">
                  <div className="space-y-4">
                    <h3 className="font-bold text-lg border-b border-border/50 pb-2">Conversion Costs (₹/MT)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {CONVERSION_FIELDS.map((f) => (
                        <div key={f.key} className="space-y-2">
                          <Label>{f.label}</Label>
                          <Input type="number" value={inputs[f.key] ?? 0} onChange={(e) => handleNum(f.key, e.target.value)} className="font-mono" data-testid={`input-${f.key}`} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-bold text-lg border-b border-border/50 pb-2">Prototype</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2"><Label>Proto Cost (₹/MT)</Label><Input type="number" value={inputs.proto_cost ?? 0} onChange={(e) => handleNum("proto_cost", e.target.value)} className="font-mono" data-testid="input-proto-cost" /></div>
                      <div className="space-y-2"><Label>Amortisation %</Label><Input type="number" step="0.1" value={pctValue("proto_pct")} onChange={(e) => handlePct("proto_pct", e.target.value)} className="font-mono" data-testid="input-proto-pct" /></div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="finance" className="space-y-8 focus-visible:outline-none">
                  <div className="space-y-4">
                    <h3 className="font-bold text-lg border-b border-border/50 pb-2">Finance Costs</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2"><Label>WIP Steel Rate % (monthly)</Label><Input type="number" step="0.01" value={pctValue("wip_steel_rate")} onChange={(e) => handlePct("wip_steel_rate", e.target.value)} className="font-mono" data-testid="input-wip-steel-rate" /></div>
                      <div className="space-y-2"><Label>WIP Steel Months</Label><Input type="number" step="0.1" value={inputs.wip_steel_months ?? 0} onChange={(e) => handleNum("wip_steel_months", e.target.value)} className="font-mono" data-testid="input-wip-steel-months" /></div>
                      <div className="space-y-2"><Label>WIP Zinc Rate % (monthly)</Label><Input type="number" step="0.01" value={pctValue("wip_zinc_rate")} onChange={(e) => handlePct("wip_zinc_rate", e.target.value)} className="font-mono" data-testid="input-wip-zinc-rate" /></div>
                      <div className="space-y-2"><Label>WIP Zinc Months</Label><Input type="number" step="0.1" value={inputs.wip_zinc_months ?? 0} onChange={(e) => handleNum("wip_zinc_months", e.target.value)} className="font-mono" data-testid="input-wip-zinc-months" /></div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-bold text-lg border-b border-border/50 pb-2">Contractual / Contingency (₹/MT)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {CONTINGENCY_FIELDS.map((f) => (
                        <div key={f.key} className="space-y-2">
                          <Label>{f.label}</Label>
                          <Input type="number" value={inputs[f.key] ?? 0} onChange={(e) => handleNum(f.key, e.target.value)} className="font-mono" data-testid={`input-${f.key}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="credit" className="space-y-8 focus-visible:outline-none">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <h3 className="font-bold text-lg">Credit Costs</h3>
                      <span className="font-mono text-sm text-muted-foreground">Total: {formatINR(results?.creditTotal ?? 0)}</span>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/50">
                            <TableHead className="w-[150px]">Component</TableHead>
                            <TableHead>Rate % (monthly)</TableHead>
                            <TableHead>Months</TableHead>
                            <TableHead>% of Contract</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {CREDIT_COMPONENTS.map((item) => (
                            <TableRow key={item.id} className="border-border/50">
                              <TableCell className="font-medium text-xs sm:text-sm">{item.name}</TableCell>
                              <TableCell className="p-2"><Input type="number" step="0.01" className="h-8 font-mono text-sm bg-background" value={pctValue(`${item.id}_rate`)} onChange={(e) => handlePct(`${item.id}_rate`, e.target.value)} data-testid={`input-${item.id}-rate`} /></TableCell>
                              <TableCell className="p-2"><Input type="number" step="0.1" className="h-8 font-mono text-sm bg-background" value={inputs[`${item.id}_months`] ?? 0} onChange={(e) => handleNum(`${item.id}_months`, e.target.value)} data-testid={`input-${item.id}-months`} /></TableCell>
                              <TableCell className="p-2"><Input type="number" step="0.1" className="h-8 font-mono text-sm bg-background" value={pctValue(`${item.id}_pct`)} onChange={(e) => handlePct(`${item.id}_pct`, e.target.value)} data-testid={`input-${item.id}-pct`} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="margin" className="space-y-8 focus-visible:outline-none">
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-bold text-lg border-b border-border/50 pb-2 mb-4">Margin Strategy</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[0, 1, 2, 3].map((idx) => {
                          const m = results?.margins[idx];
                          return (
                            <Card
                              key={idx}
                              className={`cursor-pointer transition-all border ${selectedMarginIdx === idx ? "border-primary ring-1 ring-primary bg-primary/10" : "border-border/50 hover:border-primary/50"}`}
                              onClick={() => setSelectedMarginIdx(idx)}
                              data-testid={`card-margin-${idx}`}
                            >
                              <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                                <span className="text-3xl font-bold font-mono">{((m?.pct ?? 0) * 100).toFixed(0)}%</span>
                                <span className="text-xs text-muted-foreground mt-1">{m ? formatINR(m.quote) : "—"}</span>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl">
                      {[0, 1, 2, 3].map((idx) => (
                        <div key={idx} className="space-y-2">
                          <Label>Margin {idx + 1} %</Label>
                          <Input type="number" step="0.1" value={pctValue(`margin_${idx}`)} onChange={(e) => handlePct(`margin_${idx}`, e.target.value)} className="font-mono" data-testid={`input-margin-${idx}`} />
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <Label>Quote Notes</Label>
                      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this quote calculation..." data-testid="input-notes" />
                    </div>

                    <Alert className="bg-primary/5 border-primary/20">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      <AlertTitle className="text-primary font-bold">Live Estimate</AlertTitle>
                      <AlertDescription className="text-sm font-mono mt-1">
                        Current projected price: {formatINR(quotePrice)} / MT
                      </AlertDescription>
                    </Alert>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <div className="flex justify-between pt-4 px-4 sm:px-0">
              <Button variant="outline" onClick={goBack}>Back</Button>
              <Button onClick={() => setStep(4)} className="font-bold" disabled={!results}>
                Review & Save Quote <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 4 && results && (
          <div className="p-6 md:p-8 space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold mb-2">Step 4: Verify & Save</h2>
              <p className="text-sm text-muted-foreground">Review the final cost buildup before saving the quote.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <Card className="border-border/50 bg-card/50">
                  <CardHeader className="py-3 px-4 border-b border-border/50">
                    <CardTitle className="text-sm font-bold">Project Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{customers?.find((c) => c.id.toString() === customerId)?.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Project Ref</span><span className="font-mono">{projectRef}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Structure</span><span className="font-medium">{structureType.trim()} {kvOption ? `(${kvOption})` : ""}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{isHwfast ? "Make / Grade" : "Make / Material"}</span><span className="font-medium">{isManual ? "Manual RM" : inputs.make} / {isHwfast ? (inputs.grade ?? "") : (inputs.matType ?? "")}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Revision</span><span className="font-mono text-primary font-bold">Rev {nextRevision}</span></div>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Cost Buildup (per MT)</h3>
                  <div className="bg-muted/30 rounded-lg p-1">
                    <Table>
                      <TableBody>
                        <TableRow className="border-border/50"><TableCell>Steel (RM + scrap + recovery)</TableCell><TableCell className="text-right font-mono">{formatINR(results.steel.total)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Zinc Cost</TableCell><TableCell className="text-right font-mono">{formatINR(results.zinc.total)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Conversion Total</TableCell><TableCell className="text-right font-mono">{formatINR(results.conversion)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Prototype Cost</TableCell><TableCell className="text-right font-mono">{formatINR(results.proto)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Finance Cost</TableCell><TableCell className="text-right font-mono">{formatINR(results.financing.total)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Contractual / Contingency</TableCell><TableCell className="text-right font-mono">{formatINR(results.contractual)}</TableCell></TableRow>
                        <TableRow className="border-border/50 bg-accent/5"><TableCell className="font-bold">Subtotal</TableCell><TableCell className="text-right font-mono font-bold">{formatINR(results.subtotal)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Credit Costs</TableCell><TableCell className="text-right font-mono">{formatINR(results.creditTotal)}</TableCell></TableRow>
                        <TableRow className="border-border/50 bg-accent/5"><TableCell className="font-bold">Total Before Margin</TableCell><TableCell className="text-right font-mono font-bold text-accent">{formatINR(results.total)}</TableCell></TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <div className="space-y-6 flex flex-col justify-start">
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-sm font-bold text-primary uppercase tracking-wider">Final Quote Price</CardTitle>
                    <CardDescription>Based on {((results.margins[selectedMarginIdx]?.pct ?? 0) * 100).toFixed(1)}% margin</CardDescription>
                  </CardHeader>
                  <CardContent className="text-center pb-6">
                    <div className="text-5xl font-mono font-bold text-primary tracking-tighter" data-testid="text-quote-price">
                      {formatINR(quotePrice)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-2 font-mono">per Metric Ton</div>
                  </CardContent>
                  <CardFooter>
                    <Button size="lg" className="w-full font-bold text-lg h-14" onClick={handleSaveQuote} disabled={createQuote.isPending} data-testid="button-save-quote">
                      {createQuote.isPending ? "Saving..." : "Confirm & Save Quote"}
                    </Button>
                  </CardFooter>
                </Card>

                {notes && (
                  <Card className="border-border/50 bg-card/50">
                    <CardHeader className="py-3 px-4 border-b border-border/50">
                      <CardTitle className="text-sm font-bold">Notes</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 text-sm text-muted-foreground">{notes}</CardContent>
                  </Card>
                )}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-border/50">
              <Button variant="outline" onClick={() => setStep(3)}>Back to Edits</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
