import { useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useListCustomers, useGetProjectsByCustomer, useGetQuotesByProject, useApproveQuote, type Quote } from "@workspace/api-client-react";
import { getGetProjectsByCustomerQueryKey, getGetQuotesByProjectQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { formatINR } from "@/lib/costCalculator";
import { exportRevisionReportPdf } from "@/lib/pdfExport";
import { ArrowRight, ArrowUp, ArrowDown, Minus, FileText, CheckCircle2, Upload } from "lucide-react";

// jsPDF's built-in fonts cannot render the ₹ glyph — strip it, keep Indian grouping.
const stripRupee = (s: string) => s.replace(/₹/g, "").trim();

// ---- Input label + formatting maps ----
const CREDIT_NAMES: Record<string, string> = {
  openPo: "Open PO", finalPayment: "Final Payment", emd: "EMD", lc: "LC",
  vfs: "VFS", abg: "ABG", pbg: "PBG", cpbg: "CPBG", advance: "Advance",
};

const BASE_LABELS: Record<string, string> = {
  steelBasePrice: "Steel Base Price",
  incidental: "Incidental Charges",
  scrapPct: "Scrap %",
  recoveryPct: "Recovery %",
  zincPrice: "Zinc Price",
  zincMicron: "Zinc Micron",
  fabLabor: "Fabrication Labour",
  weldCons: "Welding & Consumables",
  galvFl: "Galvanising Fuel & Labour",
  packStrn: "Packing & Straightening",
  loadUnload: "Loading & Unloading",
  handover: "Handing Over Charge",
  others: "Others",
  protoCost: "Proto Cost",
  protoPct: "Proto %",
  wipSteelRate: "WIP Steel Rate",
  wipSteelMonths: "WIP Steel Months",
  wipZincRate: "WIP Zinc Rate",
  wipZincMonths: "WIP Zinc Months",
  inspectIns: "Inspection & Insurance",
  spPacking: "Special Packing",
  freightOut: "Freight Outward",
  thirdParty: "Third Party Testing",
  agencyComm: "Agency Commission",
  bgCost: "BG Cost",
  marginPct: "Margin %",
  make: "Make",
  matType: "Material Type",
  notes: "Notes",
};

function getLabel(key: string): string {
  if (BASE_LABELS[key]) return BASE_LABELS[key];
  const m = key.match(/^(.*?)(Rate|Months|Pct)$/);
  if (m && CREDIT_NAMES[m[1]]) {
    const suffix = m[2] === "Rate" ? "Rate" : m[2] === "Months" ? "Months" : "% of Contract";
    return `${CREDIT_NAMES[m[1]]} ${suffix}`;
  }
  return key;
}

const PERCENT_KEYS = new Set([
  "scrapPct", "recoveryPct", "protoPct", "wipSteelRate", "wipZincRate", "marginPct",
]);

function isPercent(key: string) {
  return PERCENT_KEYS.has(key) || key.endsWith("Rate") || key.endsWith("Pct");
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value !== "number") return String(value);
  if (!Number.isFinite(value)) return "—";
  if (key === "notes") return String(value);
  if (key === "zincMicron") return value.toFixed(3);
  if (key.endsWith("Months")) return `${value} mo`;
  if (isPercent(key)) return `${(value * 100).toFixed(2)}%`;
  return formatINR(value);
}

interface FieldChange {
  key: string;
  label: string;
  from: unknown;
  to: unknown;
}

interface RevisionDiff {
  quote: Quote;
  prev: Quote;
  priceFrom: number;
  priceTo: number;
  priceDelta: number;
  structureChanged: boolean;
  changes: FieldChange[];
}

function numericEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
    return Math.abs(a - b) < 0.000001;
  }
  return a === b;
}

function diffInputs(prev: Quote, curr: Quote): FieldChange[] {
  const a = (prev.inputs ?? {}) as Record<string, unknown>;
  const b = (curr.inputs ?? {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  const changes: FieldChange[] = [];
  for (const key of keys) {
    if (!numericEqual(a[key], b[key])) {
      changes.push({ key, label: getLabel(key), from: a[key], to: b[key] });
    }
  }
  // Stable, readable ordering by label
  changes.sort((x, y) => x.label.localeCompare(y.label));
  return changes;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.01) {
    return (
      <Badge variant="outline" className="font-mono gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" /> No change
      </Badge>
    );
  }
  const up = delta > 0;
  return (
    <Badge
      variant="outline"
      className={`font-mono gap-1 ${up ? "text-primary border-primary/40" : "text-emerald-400 border-emerald-500/40"}`}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {up ? "+" : "−"}{formatINR(Math.abs(delta))} /MT
    </Badge>
  );
}

export default function Review() {
  const search = useSearch();
  const initial = new URLSearchParams(search);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initial.get("customerId") ?? "");
  const [selectedProject, setSelectedProject] = useState<string>(initial.get("project") ?? "");

  const { data: customers, isLoading: loadingCustomers } = useListCustomers();

  const customerId = selectedCustomerId ? parseInt(selectedCustomerId, 10) : 0;

  const { data: projects } = useGetProjectsByCustomer(
    { customerId },
    {
      query: {
        enabled: !!customerId,
        queryKey: getGetProjectsByCustomerQueryKey({ customerId }),
      },
    }
  );

  const { data: quotes, isLoading: loadingQuotes } = useGetQuotesByProject(
    { customerId, projectRef: selectedProject },
    {
      query: {
        enabled: !!customerId && !!selectedProject,
        queryKey: getGetQuotesByProjectQueryKey({ customerId, projectRef: selectedProject }),
      },
    }
  );

  const customerOptions = (customers ?? []).map((c) => ({
    value: c.id.toString(),
    label: c.name,
  }));

  const projectOptions = (projects ?? []).map((p) => ({
    value: p,
    label: p,
  }));

  // Quotes arrive ordered by revision desc — sort ascending for charts/diffs
  const sortedQuotes = useMemo(
    () => [...(quotes ?? [])].sort((a, b) => a.revision - b.revision),
    [quotes]
  );

  const lineItems = useMemo(() => {
    if (sortedQuotes.length === 0) return [];
    const keySet = new Set<string>();
    for (const q of sortedQuotes) {
      const inp = (q.inputs ?? {}) as Record<string, unknown>;
      for (const k of Object.keys(inp)) {
        if (k === "notes") continue;
        keySet.add(k);
      }
    }
    const baseOrder = Object.keys(BASE_LABELS);
    const ordered = [
      ...baseOrder.filter((k) => keySet.has(k)),
      ...Array.from(keySet)
        .filter((k) => !baseOrder.includes(k))
        .sort((a, b) => getLabel(a).localeCompare(getLabel(b))),
    ];
    return ordered.map((key) => ({
      key,
      label: getLabel(key),
      values: sortedQuotes.map((q) => (q.inputs as Record<string, unknown> | undefined)?.[key]),
    }));
  }, [sortedQuotes]);

  const diffs = useMemo<RevisionDiff[]>(() => {
    const out: RevisionDiff[] = [];
    for (let i = 1; i < sortedQuotes.length; i++) {
      const prev = sortedQuotes[i - 1];
      const curr = sortedQuotes[i];
      out.push({
        quote: curr,
        prev,
        priceFrom: prev.quotePricePerMt,
        priceTo: curr.quotePricePerMt,
        priceDelta: curr.quotePricePerMt - prev.quotePricePerMt,
        structureChanged: prev.structureType !== curr.structureType || prev.kvOption !== curr.kvOption,
        changes: diffInputs(prev, curr),
      });
    }
    // Most recent transition first
    return out.reverse();
  }, [sortedQuotes]);

  const summary = useMemo(() => {
    if (sortedQuotes.length === 0) return null;
    const first = sortedQuotes[0];
    const latest = sortedQuotes[sortedQuotes.length - 1];
    return {
      revisions: sortedQuotes.length,
      latest,
      first,
      totalDelta: latest.quotePricePerMt - first.quotePricePerMt,
    };
  }, [sortedQuotes]);

  const customerName =
    (customers ?? []).find((c) => c.id === customerId)?.name ?? sortedQuotes[0]?.customerName ?? "Customer";

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const approveQuote = useApproveQuote();

  // Currently approved revision (if any) drives the checkbox state.
  const approvedQuote = useMemo(() => sortedQuotes.find((q) => q.approved) ?? null, [sortedQuotes]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);

  // The ticked row: explicit selection wins, but only if it belongs to the loaded
  // project — otherwise a stale selection from a prior project could be approved.
  const checkedQuoteId = useMemo(() => {
    if (selectedQuoteId != null && sortedQuotes.some((q) => q.id === selectedQuoteId)) {
      return selectedQuoteId;
    }
    return approvedQuote?.id ?? null;
  }, [selectedQuoteId, sortedQuotes, approvedQuote]);

  async function handleApprove() {
    if (checkedQuoteId == null) return;
    try {
      await approveQuote.mutateAsync({ id: checkedQuoteId });
      await queryClient.invalidateQueries({
        queryKey: getGetQuotesByProjectQueryKey({ customerId, projectRef: selectedProject }),
      });
      const rev = sortedQuotes.find((q) => q.id === checkedQuoteId)?.revision;
      toast({ title: "Quote approved", description: `Rev ${rev} marked as the vendor-approved quote.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: e instanceof Error ? e.message : "Failed to approve quote" });
    }
  }

  function handleSaveToMonday() {
    // Monday.com integration to be wired up later.
    toast({
      title: "Coming soon",
      description: "Saving to Monday.com will be enabled once the integration is configured.",
    });
  }

  function handleDownloadPdf() {
    if (!summary || sortedQuotes.length === 0) return;
    const pdfVal = (key: string, v: unknown) => stripRupee(formatValue(key, v));

    const meta = [
      `Revisions: ${summary.revisions} (Rev 0 - Rev ${summary.latest.revision})`,
      `Structure: ${summary.latest.structureType}${summary.latest.kvOption ? ` (${summary.latest.kvOption})` : ""}`,
      `Latest (Rev ${summary.latest.revision}): Rs ${stripRupee(formatINR(summary.latest.quotePricePerMt))} /MT`,
      `Change vs Rev 0: ${summary.totalDelta >= 0 ? "+" : "-"}Rs ${stripRupee(formatINR(Math.abs(summary.totalDelta)))} /MT`,
    ];

    const lineItemsHead = ["Line Item", ...sortedQuotes.map((q) => `Rev ${q.revision}`)];
    const lineItemsBody: string[][] = [
      ...lineItems.map((row) => [row.label, ...row.values.map((v) => pdfVal(row.key, v))]),
      ["Quote Price /MT", ...sortedQuotes.map((q) => stripRupee(formatINR(q.quotePricePerMt)))],
    ];
    // Mirror the on-screen highlight: compare raw values to the prior revision (col 0 is the label).
    const changedMatrix: boolean[][] = [
      ...lineItems.map((row) => [false, ...row.values.map((v, i) => i > 0 && !numericEqual(v, row.values[i - 1]))]),
      [false, ...sortedQuotes.map((q, i) => i > 0 && Math.abs(q.quotePricePerMt - sortedQuotes[i - 1].quotePricePerMt) >= 0.01)],
    ];

    const diffSections = diffs.map((d) => {
      const rows: string[][] = [];
      if (d.structureChanged) {
        rows.push([
          "Structure",
          `${d.prev.structureType}${d.prev.kvOption ? ` (${d.prev.kvOption})` : ""}`,
          `${d.quote.structureType}${d.quote.kvOption ? ` (${d.quote.kvOption})` : ""}`,
        ]);
      }
      for (const c of d.changes) {
        rows.push([c.label, pdfVal(c.key, c.from), pdfVal(c.key, c.to)]);
      }
      const noChange = Math.abs(d.priceDelta) < 0.01;
      const delta = noChange
        ? "No change"
        : `${d.priceDelta > 0 ? "+" : "-"}Rs ${stripRupee(formatINR(Math.abs(d.priceDelta)))} /MT`;
      return {
        title: `Rev ${d.prev.revision} -> Rev ${d.quote.revision}  (${format(new Date(d.quote.createdAt), "dd MMM yyyy")}, ${d.quote.generatedByName})`,
        delta,
        rows,
      };
    });

    exportRevisionReportPdf({
      customerName,
      projectRef: selectedProject,
      meta,
      lineItemsHead,
      lineItemsBody,
      changedMatrix,
      diffSections,
    });
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Quotes</h1>
          <p className="text-muted-foreground">Compare quote revisions by project</p>
        </div>
        {!!customerId && !!selectedProject && sortedQuotes.length > 0 && (
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            className="gap-2 shrink-0"
            data-testid="button-export-review-pdf"
          >
            <FileText className="h-4 w-4" />
            Download PDF
          </Button>
        )}
      </div>

      <Card className="border-border/50">
        <CardHeader className="bg-card/50 pb-4 border-b border-border/50">
          <CardTitle className="text-lg">Select Project</CardTitle>
          <CardDescription>Choose a customer and project reference to view quote history.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid gap-6 md:grid-cols-2 max-w-2xl">
            <div className="space-y-2">
              <Label>Customer</Label>
              <SearchableSelect
                options={customerOptions}
                value={selectedCustomerId}
                onValueChange={(val) => { setSelectedCustomerId(val); setSelectedProject(""); setSelectedQuoteId(null); }}
                placeholder={loadingCustomers ? "Loading…" : "Search and select customer"}
                searchPlaceholder="Type to search 842+ customers…"
                data-testid="select-review-customer"
              />
            </div>

            <div className="space-y-2">
              <Label>Project / PO Ref</Label>
              {!selectedCustomerId || !projects || projects.length === 0 ? (
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder={!selectedCustomerId ? "Select customer first" : "No projects found"} />
                  </SelectTrigger>
                  <SelectContent side="bottom">
                    <SelectItem value="_none">—</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <SearchableSelect
                  options={projectOptions}
                  value={selectedProject}
                  onValueChange={(val) => { setSelectedProject(val); setSelectedQuoteId(null); }}
                  placeholder="Select project / PO ref"
                  searchPlaceholder="Search projects…"
                  data-testid="select-review-project"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {customerId && selectedProject && (
        loadingQuotes ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm animate-pulse">
            Loading quotes…
          </div>
        ) : sortedQuotes.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="py-12 text-center text-muted-foreground">
              No quotes found for this project.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Project KPIs */}
            {summary && (
              <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <KpiCard label="Revisions" value={String(summary.revisions)} sub={`Rev 0 – Rev ${summary.latest.revision}`} />
                <KpiCard
                  label={`Latest · Rev ${summary.latest.revision}`}
                  value={formatINR(summary.latest.quotePricePerMt)}
                  unit="/MT"
                  sub={format(new Date(summary.latest.createdAt), "dd MMM yyyy")}
                  accent
                />
                <KpiCard
                  label="Change vs Rev 0"
                  value={`${summary.totalDelta >= 0 ? "+" : "−"}${formatINR(Math.abs(summary.totalDelta))}`}
                  unit="/MT"
                  sub={summary.first.quotePricePerMt ? `${((summary.totalDelta / summary.first.quotePricePerMt) * 100).toFixed(1)}% vs first` : "—"}
                />
                <KpiCard
                  label="Structure"
                  value={summary.latest.structureType}
                  sub={summary.latest.kvOption || "—"}
                  small
                />
              </div>
            )}

            {/* Revision summary + vendor approval */}
            <Card className="border-border/50 overflow-hidden">
              <CardHeader className="bg-card/50 border-b border-border/50 pb-3">
                <CardTitle className="text-[15px]">Revision Summary</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tick the revision finalized for the order, then mark it as the vendor-approved quote
                </p>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-card/50">
                    <TableRow className="border-border/50">
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Rev</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Generated By</TableHead>
                      <TableHead className="text-right">Quote Price / MT</TableHead>
                      <TableHead className="text-right">Δ vs Prev</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedQuotes.map((q, i) => {
                      const delta = i > 0 ? q.quotePricePerMt - sortedQuotes[i - 1].quotePricePerMt : null;
                      const checked = checkedQuoteId === q.id;
                      return (
                        <TableRow
                          key={q.id}
                          className={`border-border/40 cursor-pointer ${checked ? "bg-primary/5" : "hover:bg-accent/5"}`}
                          onClick={() => setSelectedQuoteId(q.id)}
                          data-testid={`summary-row-${q.revision}`}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => setSelectedQuoteId(v ? q.id : null)}
                              aria-label={`Select Rev ${q.revision}`}
                              data-testid={`checkbox-rev-${q.revision}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono bg-card">Rev {q.revision}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {format(new Date(q.createdAt), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{q.generatedByName}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-primary">
                            {formatINR(q.quotePricePerMt)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {delta === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : Math.abs(delta) < 0.01 ? (
                              <span className="text-muted-foreground">0</span>
                            ) : (
                              <span className={delta > 0 ? "text-primary" : "text-emerald-400"}>
                                {delta > 0 ? "+" : "−"}{formatINR(Math.abs(delta))}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {q.approved && (
                                <Badge className="gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/15" data-testid={`badge-approved-${q.revision}`}>
                                  <CheckCircle2 className="h-3 w-3" /> Approved
                                </Badge>
                              )}
                              {q.legacy && (
                                <Badge variant="outline" className="gap-1 text-amber-400 border-amber-500/40" title="Computed by the pre-reconciliation engine — read-only" data-testid={`badge-legacy-${q.revision}`}>
                                  Legacy
                                </Badge>
                              )}
                              {!q.approved && !q.legacy && (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/50 bg-card/50 px-4 py-3">
                {approvedQuote && (
                  <span className="mr-auto text-xs text-muted-foreground">
                    Approved: Rev {approvedQuote.revision}
                    {approvedQuote.approvedByName ? ` by ${approvedQuote.approvedByName}` : ""}
                    {approvedQuote.approvedAt ? ` on ${format(new Date(approvedQuote.approvedAt), "dd MMM yyyy")}` : ""}
                  </span>
                )}
                <Button
                  variant="outline"
                  onClick={handleSaveToMonday}
                  className="gap-2"
                  data-testid="button-save-monday"
                >
                  <Upload className="h-4 w-4" />
                  Save to Monday.com
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={checkedQuoteId == null || approveQuote.isPending || checkedQuoteId === approvedQuote?.id}
                  className="gap-2"
                  data-testid="button-approve-quote"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {approveQuote.isPending ? "Approving…" : "Approved Quote by Vendor"}
                </Button>
              </div>
            </Card>

            {/* Line items across revisions */}
            <Card className="border-border/50">
              <CardHeader className="bg-card/50 border-b border-border/50 pb-3">
                <CardTitle className="text-[15px]">Line Items Across Revisions</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Every cost input by revision — values that changed from the prior revision are highlighted</p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                    <TableHeader>
                      <TableRow className="border-border/50">
                        <TableHead className="sticky left-0 bg-card z-10 min-w-[170px]">Line Item</TableHead>
                        {sortedQuotes.map((q) => (
                          <TableHead key={q.id} className="text-right font-mono whitespace-nowrap min-w-[110px]">
                            Rev {q.revision}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map((row) => (
                        <TableRow key={row.key} className="border-border/40" data-testid={`lineitem-${row.key}`}>
                          <TableCell className="sticky left-0 bg-card z-10 font-medium">{row.label}</TableCell>
                          {row.values.map((v, i) => {
                            const changed = i > 0 && !numericEqual(v, row.values[i - 1]);
                            return (
                              <TableCell
                                key={i}
                                className={`text-right font-mono whitespace-nowrap ${changed ? "text-primary font-semibold" : "text-muted-foreground"}`}
                              >
                                {formatValue(row.key, v)}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 border-primary/30 bg-primary/5 hover:bg-primary/5">
                        <TableCell className="sticky left-0 bg-card z-10 font-bold">Quote Price /MT</TableCell>
                        {sortedQuotes.map((q, i) => {
                          const changed = i > 0 && Math.abs(q.quotePricePerMt - sortedQuotes[i - 1].quotePricePerMt) >= 0.01;
                          return (
                            <TableCell
                              key={q.id}
                              className={`text-right font-mono font-bold whitespace-nowrap ${changed ? "text-primary" : "text-foreground"}`}
                            >
                              {formatINR(q.quotePricePerMt)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* What changed across revisions */}
            <Card className="border-border/50">
              <CardHeader className="bg-card/50 border-b border-border/50 pb-3">
                <CardTitle className="text-[15px]">What Changed Across Revisions</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Snapshot of every input that changed between consecutive revisions</p>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {diffs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Only one revision (Rev 0) exists — nothing to compare yet.
                  </p>
                ) : (
                  diffs.map((d) => (
                    <div key={d.quote.id} className="rounded-lg border border-border/50 overflow-hidden" data-testid={`diff-rev-${d.quote.revision}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 px-4 py-3 border-b border-border/50">
                        <div className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="font-mono bg-card">Rev {d.prev.revision}</Badge>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <Badge variant="outline" className="font-mono bg-card">Rev {d.quote.revision}</Badge>
                          <span className="text-xs text-muted-foreground ml-1">
                            {format(new Date(d.quote.createdAt), "dd MMM yyyy")} · {d.quote.generatedByName}
                          </span>
                        </div>
                        <DeltaBadge delta={d.priceDelta} />
                      </div>

                      <div className="px-4 py-3 space-y-3">
                        {d.structureChanged && (
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-muted-foreground w-40 shrink-0">Structure</span>
                            <span className="font-mono text-muted-foreground line-through">
                              {d.prev.structureType}{d.prev.kvOption ? ` (${d.prev.kvOption})` : ""}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-mono text-foreground">
                              {d.quote.structureType}{d.quote.kvOption ? ` (${d.quote.kvOption})` : ""}
                            </span>
                          </div>
                        )}

                        {d.changes.length === 0 && !d.structureChanged ? (
                          <p className="text-xs text-muted-foreground">No input changes — only re-saved.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-border/50">
                                  <TableHead className="w-1/2">Field</TableHead>
                                  <TableHead className="text-right">Previous</TableHead>
                                  <TableHead className="text-right">Updated</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {d.changes.map((c) => (
                                  <TableRow key={c.key} className="border-border/40">
                                    <TableCell className="font-medium">{c.label}</TableCell>
                                    <TableCell className="text-right font-mono text-muted-foreground line-through">
                                      {formatValue(c.key, c.from)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-foreground">
                                      {formatValue(c.key, c.to)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Full revision history table */}
            <Card className="border-border/50 overflow-hidden">
              <CardHeader className="bg-card/50 border-b border-border/50 pb-3">
                <CardTitle className="text-[15px]">Revision History</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-card/50">
                    <TableRow>
                      <TableHead>Rev</TableHead>
                      <TableHead>Structure</TableHead>
                      <TableHead className="text-right">Quote Price / MT</TableHead>
                      <TableHead className="text-right">Steel Base</TableHead>
                      <TableHead className="text-right">Zinc Price</TableHead>
                      <TableHead>Generated By</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes?.map((quote) => (
                      <TableRow key={quote.id} className="hover:bg-accent/5" data-testid={`row-quote-${quote.id}`}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono bg-card">Rev {quote.revision}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{quote.structureType}</div>
                          {quote.kvOption && <div className="text-xs text-muted-foreground">{quote.kvOption}</div>}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">
                          {formatINR(quote.quotePricePerMt)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {quote.steelPrice ? formatINR(quote.steelPrice) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {quote.zincPrice ? formatINR(quote.zincPrice) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{quote.generatedByName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(quote.createdAt), "dd MMM yyyy, HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )
      )}
    </div>
  );
}

function KpiCard({
  label, value, unit, sub, accent = false, small = false,
}: { label: string; value: string; unit?: string; sub?: string; accent?: boolean; small?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border p-5 ${
      accent
        ? "bg-gradient-to-br from-primary/16 to-primary/5 border-primary/30"
        : "bg-gradient-to-br from-card to-card/70 border-border/60"
    }`}>
      <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-primary via-accent2 to-transparent opacity-70" />
      <div className="text-[10px] tracking-[0.14em] uppercase font-mono text-muted-foreground mb-2 truncate">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono font-bold leading-tight text-foreground ${small ? "text-[15px]" : "text-[26px] leading-none"}`}>{value}</span>
        {unit && <span className="text-xs font-mono text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 text-[10.5px] font-mono text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}
