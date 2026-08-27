import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Calculator, Eye, History } from "lucide-react";
import { INITIAL_DATA, type InitialCell } from "@/lib/v6/data";
import { computeAutoOverrides, DEFAULT_OFFSETS } from "@/lib/v6/engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type NumericRecord = Record<string, number>;

interface RmPriceRevision {
  id: number;
  dailyData: Record<string, unknown>;
  twiceMonthlyData: Record<string, unknown>;
  createdAt: string;
  createdByName: string;
  isWindowUnlocked: boolean;
  offsetVersion?: {
    id: number;
    offsetData: Record<string, unknown>;
    updatedAt: string;
    updatedByName: string;
  } | null;
}

interface PriceItem {
  key: string;
  label: string;
  value: number;
}

interface PriceGroup {
  name: string;
  items: PriceItem[];
}

const DERIVED_LABELS: Record<string, string> = {
  E9: "Billet — Ryp_Test (L)",
  F9: "Billet — Ryp_Test (H)",
  G9: "Billet — Ngp_Test (H)",
  I9: "Billet — SAIL_Kol",
  J9: "Billet — SAIL_Ryp",
  K9: "Billet — SAIL_Ngp",
  L9: "Billet — SAIL_Rour",
  D18: "Wire Rod — RINL/JSW (Pb)",
  E18: "Wire Rod — RINL/JSW (Lkw)",
};

function toNumbers(data: Record<string, unknown> | undefined): NumericRecord {
  const out: NumericRecord = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) out[key] = numberValue;
  }
  return out;
}

function buildGroups(
  initialData: Record<string, InitialCell>,
  savedData: Record<string, unknown>,
): PriceGroup[] {
  const groups = new Map<string, PriceItem[]>();
  const handled = new Set<string>();
  for (const [key, meta] of Object.entries(initialData)) {
    const values = groups.get(meta.group) ?? [];
    const savedValue = Number(savedData[key]);
    values.push({
      key,
      label: meta.label,
      value: Number.isFinite(savedValue) ? savedValue : meta.value,
    });
    groups.set(meta.group, values);
    handled.add(key);
  }

  const additional = Object.entries(savedData)
    .filter(([key]) => !handled.has(key))
    .map(([key, value]) => ({ key, label: `Additional price (${key})`, value: Number(value) }))
    .filter((item) => Number.isFinite(item.value));
  if (additional.length > 0) groups.set("Additional saved values", additional);

  return [...groups].map(([name, items]) => ({ name, items }));
}

function PriceSection({ title, groups }: { title: string; groups: PriceGroup[] }) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.name} className="rounded-lg border border-border/50 overflow-hidden">
            <div className="bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.name}
            </div>
            <Table>
              <TableBody>
                {group.items.map((item) => (
                  <TableRow key={item.key} className="border-border/30">
                    <TableCell className="py-2 text-xs">{item.label}</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs font-medium whitespace-nowrap">
                      ₹ {item.value.toLocaleString("en-IN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>
    </section>
  );
}

function RevisionDetail({ revision }: { revision: RmPriceRevision }) {
  const dailyData = useMemo(() => toNumbers(revision.dailyData), [revision.dailyData]);
  const twiceMonthlyData = useMemo(() => toNumbers(revision.twiceMonthlyData), [revision.twiceMonthlyData]);
  const offsetData = useMemo(() => toNumbers(revision.offsetVersion?.offsetData), [revision.offsetVersion?.offsetData]);
  const dailyGroups = useMemo(() => buildGroups(INITIAL_DATA.daily, dailyData), [dailyData]);
  const twiceMonthlyGroups = useMemo(() => buildGroups(INITIAL_DATA.twice, twiceMonthlyData), [twiceMonthlyData]);
  const derived = useMemo(() => computeAutoOverrides(dailyData, offsetData), [dailyData, offsetData]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">Revision #{revision.id}</p>
            <p className="text-xs text-muted-foreground">
              Saved {format(new Date(revision.createdAt), "dd-MM-yyyy, HH:mm")} by {revision.createdByName}
            </p>
          </div>
          <Badge variant="outline" className={revision.isWindowUnlocked ? "border-amber-500/30 text-amber-500" : ""}>
            {revision.isWindowUnlocked ? "Unlocked Window" : "Standard Window"}
          </Badge>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 px-4 py-3 text-sm">
        <div className="flex items-start gap-2">
          <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Derived-price offset snapshot</p>
            {revision.offsetVersion ? (
              <p className="text-xs text-muted-foreground">
                Offset revision #{revision.offsetVersion.id}, saved by {revision.offsetVersion.updatedByName} on{" "}
                {format(new Date(revision.offsetVersion.updatedAt), "dd-MM-yyyy, HH:mm")}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No saved offset revision existed at this time; workbook default offsets are used.
              </p>
            )}
          </div>
        </div>
      </div>

      <PriceSection title="Daily base prices" groups={dailyGroups} />
      <PriceSection title="Twice-monthly base prices" groups={twiceMonthlyGroups} />

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Derived prices used by the engine</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(DERIVED_LABELS).map(([key, label]) => (
            <div key={key} className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-mono text-sm font-semibold">₹ {(derived[key] ?? 0).toLocaleString("en-IN")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Offset: ₹ {(offsetData[key] ?? DEFAULT_OFFSETS[key] ?? 0).toLocaleString("en-IN")}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function RmPriceHistory({
  history,
  isLoading,
}: {
  history: RmPriceRevision[] | undefined;
  isLoading: boolean;
}) {
  const [selected, setSelected] = useState<RmPriceRevision | null>(null);

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="bg-card/50 border-b border-border/50">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <CardTitle>RM Price Revision History</CardTitle>
          </div>
          <CardDescription>
            Every retained raw-material price revision. Open a revision to inspect all source and derived prices.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[31rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="pl-4">Revision</TableHead>
                  <TableHead>Date & time</TableHead>
                  <TableHead>Saved by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-4">Prices</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading revisions…</TableCell></TableRow>
                ) : !history || history.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No RM price revisions found.</TableCell></TableRow>
                ) : history.map((revision) => (
                  <TableRow key={revision.id} className="border-border/40">
                    <TableCell className="pl-4 font-mono text-sm">#{revision.id}</TableCell>
                    <TableCell className="font-mono text-sm whitespace-nowrap">
                      {format(new Date(revision.createdAt), "dd-MM-yyyy, HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm">{revision.createdByName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={revision.isWindowUnlocked ? "border-amber-500/30 text-amber-500" : ""}>
                        {revision.isWindowUnlocked ? "Unlocked Window" : "Standard"}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelected(revision)}>
                        <Eye className="h-3.5 w-3.5" /> Open prices
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>RM price revision details</DialogTitle>
            <DialogDescription>
              This is a read-only dated record. It does not change live prices or any saved quote.
            </DialogDescription>
          </DialogHeader>
          {selected && <RevisionDetail revision={selected} />}
        </DialogContent>
      </Dialog>
    </>
  );
}