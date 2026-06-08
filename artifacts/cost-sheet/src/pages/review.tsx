import { useMemo, useState } from "react";
import { useListCustomers, useGetProjectsByCustomer, useGetQuotesByProject, type Quote } from "@workspace/api-client-react";
import { getGetProjectsByCustomerQueryKey, getGetQuotesByProjectQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/searchable-select";
import { format } from "date-fns";
import { formatINR } from "@/lib/costCalculator";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { ArrowRight, ArrowUp, ArrowDown, Minus } from "lucide-react";

const PALETTE = {
  accent: "#e63329",
  steel: "#3d6ea5",
  slate: "#5b708a",
};

const tooltipStyle = { backgroundColor: "#0e1f33", borderColor: "#2a3f57", color: "#aebccd" };

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
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");

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

  const trendData = useMemo(
    () => sortedQuotes.map((q) => ({
      rev: `Rev ${q.revision}`,
      price: q.quotePricePerMt,
    })),
    [sortedQuotes]
  );

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

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review Quotes</h1>
        <p className="text-muted-foreground">Compare quote revisions by project</p>
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
                onValueChange={(val) => { setSelectedCustomerId(val); setSelectedProject(""); }}
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
                  onValueChange={setSelectedProject}
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

            {/* Quote price trend */}
            {trendData.length > 1 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[15px]">Quote Price Across Revisions</CardTitle>
                  <p className="text-xs text-muted-foreground">Recommended quote price per MT, by revision</p>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} margin={{ top: 20, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                      <XAxis
                        dataKey="rev"
                        tick={{ fill: PALETTE.slate, fontFamily: "Space Mono", fontSize: 11 }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: PALETTE.slate, fontFamily: "Space Mono", fontSize: 10 }}
                        axisLine={false} tickLine={false}
                        tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                        formatter={(v: number) => [formatINR(v), "₹/MT"]}
                      />
                      <Bar dataKey="price" radius={[6, 6, 0, 0]} maxBarSize={56}>
                        {trendData.map((d, i) => (
                          <Cell key={d.rev} fill={i === trendData.length - 1 ? PALETTE.accent : PALETTE.steel} />
                        ))}
                        <LabelList
                          dataKey="price"
                          position="top"
                          formatter={(v: number) => formatINR(v)}
                          style={{ fill: PALETTE.slate, fontFamily: "Space Mono", fontSize: 10 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

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
