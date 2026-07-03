import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRmRatios,
  useSaveRmRatios,
  useGetRmRatiosHistory,
  getGetRmRatiosQueryKey,
  getGetRmRatiosHistoryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MASTER_SPECS } from "@/lib/v6/engine";
import { format } from "date-fns";
import { AlertTriangle, Scale, History } from "lucide-react";

// The exact 11 structures whose voltage-weighted RM price ratios are
// admin-editable. Names trace verbatim to MASTER_SPECS keys in
// artifacts/cost-sheet/src/lib/v6/data.ts, including trailing/double spaces.
const RATIO_STRUCTURES = [
  "TLT >800 mt",
  "TLT 401-800 mt",
  "TLT 151 - 400 mt ",
  "Sub-Station (L) >800 mt ",
  "Sub-Station (L) 401- 800 mt",
  "Sub Station (L) - 151 - 400 mt ",
  "out source < 150 mt ",
  "A  H-Pole",
  "RSJ Pole - Base Plate ",
  "Rural (Welded & Clamps)",
  "Rural (Non-Welded)",
];

// Preferred display order for categories; anything not listed falls back to
// alphabetical so unexpected/new categories still render predictably.
const CATEGORY_ORDER = ["Light Angle", "Medium Angle", "Heavy Angle", "Super Heavy Angle", "Channels", "Channel", "Plate"];

function sortCategories(cats: string[]): string[] {
  return [...cats].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

interface RatioRow {
  structureName: string;
  kv: string;
  category: string;
  ratioValue: number;
  updatedByName: string;
  updatedAt: string;
}

function KvRowEditor({ structureName, kv, categories, initialValues }: { structureName: string; kv: string; categories: string[]; initialValues: Record<string, number> }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const saveRatios = useSaveRmRatios();

  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cat of categories) {
      const v = initialValues[cat];
      map[cat] = v !== undefined ? (v * 100).toFixed(2) : "0";
    }
    return map;
  }, [categories, initialValues]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [dirty, setDirty] = useState(false);

  const sum = categories.reduce((acc, cat) => acc + (Number(values[cat]) || 0), 0);
  const sumOk = Math.abs(sum - 100) < 0.5;

  const handleChange = (cat: string, v: string) => {
    setValues((prev) => ({ ...prev, [cat]: v }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!sumOk) {
      toast({ variant: "destructive", title: "Cannot save", description: `Row must sum to 100% (currently ${sum.toFixed(1)}%)` });
      return;
    }
    if (!confirm(`Update RM ratios for "${structureName}" / ${kv}? This changes a set-and-forget value used by all new quotes going forward. Existing saved quotes are not affected.`)) {
      return;
    }
    try {
      const ratios: Record<string, number> = {};
      for (const cat of categories) ratios[cat] = (Number(values[cat]) || 0) / 100;
      await saveRatios.mutateAsync({ data: { structureName, kv, ratios } });
      await queryClient.invalidateQueries({ queryKey: getGetRmRatiosQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetRmRatiosHistoryQueryKey() });
      setDirty(false);
      toast({ title: "Saved", description: `Ratios updated for ${structureName} / ${kv}` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message ?? "Failed to save ratios" });
    }
  };

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 transition-colors ${
        dirty
          ? sumOk
            ? "border-accent/50 bg-accent/[0.04]"
            : "border-destructive/50 bg-destructive/[0.04]"
          : "border-border/50 bg-card/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold px-2 py-0.5 rounded bg-muted/60 border border-border/50 whitespace-nowrap">
          {kv}
        </span>
        <span
          className={`text-xs font-mono px-2 py-0.5 rounded-full border whitespace-nowrap ${
            sumOk
              ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
              : "text-destructive border-destructive/40 bg-destructive/10"
          }`}
        >
          {sum.toFixed(1)}%
        </span>
      </div>

      <div className="space-y-2">
        {categories.map((cat) => (
          <div key={cat} className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground flex-1 leading-tight">{cat}</label>
            <div className="relative w-24 shrink-0">
              <Input
                type="number"
                step="0.01"
                value={values[cat]}
                onChange={(e) => handleChange(cat, e.target.value)}
                className="font-mono text-sm text-right pr-7 h-9"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                %
              </span>
            </div>
          </div>
        ))}
      </div>

      {dirty && !sumOk && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Row must total 100% before saving.
        </p>
      )}

      <Button
        size="sm"
        onClick={handleSave}
        disabled={!dirty || saveRatios.isPending || !sumOk}
        variant={dirty ? "default" : "outline"}
        className={
          dirty
            ? "w-full font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
            : "w-full font-medium text-muted-foreground border-border/50"
        }
      >
        {saveRatios.isPending ? "Saving..." : dirty ? "Save Row" : "No changes"}
      </Button>
    </div>
  );
}

export function RmRatioEditor() {
  const { data: ratios, isLoading } = useGetRmRatios();
  const { data: history, isLoading: loadingHistory } = useGetRmRatiosHistory();
  const [selectedStructure, setSelectedStructure] = useState(RATIO_STRUCTURES[0]);

  const rowsForStructure = useMemo(
    () => ((ratios ?? []) as RatioRow[]).filter((r) => r.structureName === selectedStructure),
    [ratios, selectedStructure],
  );

  // The canonical grid (which kv rows and categories exist, and their default
  // values) comes from MASTER_SPECS -- the same source the calculator falls
  // back to. Any DB-saved override is overlaid on top. This means the editor
  // always shows the ratios even when the rm_ratios table hasn't been seeded
  // (e.g. a fresh production database); the first admin save then persists them.
  const kvGroups = useMemo(() => {
    const spec = (MASTER_SPECS as Record<string, any>)[selectedStructure];
    const kvOptions = (spec?.ratios?.kv_options ?? []) as { kv: string; ratios: Record<string, number> }[];
    const overrideByKvCat = new Map<string, number>();
    for (const r of rowsForStructure) overrideByKvCat.set(`${r.kv}\u0000${r.category}`, r.ratioValue);

    return kvOptions.map((opt) => {
      const categories = sortCategories(Object.keys(opt.ratios));
      const values: Record<string, number> = {};
      for (const cat of categories) {
        const override = overrideByKvCat.get(`${opt.kv}\u0000${cat}`);
        values[cat] = override !== undefined ? override : opt.ratios[cat];
      }
      return { kv: opt.kv, categories, values };
    });
  }, [selectedStructure, rowsForStructure]);

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="bg-card/50 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Scale className="h-5 w-5" />
            </span>
            <CardTitle>Raw Material Ratio Editor</CardTitle>
          </div>
          <CardDescription>
            Voltage-weighted RM price ratios per structure. These are set-and-forget values that only affect new
            quotes going forward — existing saved quotes and revisions are never recalculated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Structure</label>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={selectedStructure} onValueChange={setSelectedStructure}>
                <SelectTrigger className="w-full sm:w-[360px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATIO_STRUCTURES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.trim()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isLoading && kvGroups.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {kvGroups.length} voltage {kvGroups.length === 1 ? "band" : "bands"}
                </span>
              )}
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading ratios…</p>
          ) : kvGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ratio rows found for this structure.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {kvGroups.map((group) => (
                <KvRowEditor
                  key={`${selectedStructure}-${group.kv}`}
                  structureName={selectedStructure}
                  kv={group.kv}
                  categories={group.categories}
                  initialValues={group.values}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="bg-card/50 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
              <History className="h-5 w-5" />
            </span>
            <CardTitle>RM Ratio Change Log</CardTitle>
          </div>
          <CardDescription>Who changed which cell, and when.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>Structure</TableHead>
                <TableHead>kV</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Old &rarr; New</TableHead>
                <TableHead className="pr-4">Changed By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingHistory ? (
                <TableRow><TableCell colSpan={6} className="text-center py-4">Loading...</TableCell></TableRow>
              ) : !history || history.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No changes yet.</TableCell></TableRow>
              ) : (
                history.map((h: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4 font-mono text-sm">{format(new Date(h.changedAt), "dd MMM yyyy, HH:mm")}</TableCell>
                    <TableCell className="text-sm">{h.structureName.trim()}</TableCell>
                    <TableCell className="font-mono text-xs">{h.kv}</TableCell>
                    <TableCell className="text-sm">{h.category}</TableCell>
                    <TableCell className="font-mono text-sm whitespace-nowrap">
                      <span className="text-muted-foreground">
                        {h.oldValue === null || h.oldValue === undefined ? "—" : `${(h.oldValue * 100).toFixed(1)}%`}
                      </span>
                      <span className="mx-1 text-muted-foreground/60">&rarr;</span>
                      <span className="font-bold text-foreground">{(h.newValue * 100).toFixed(1)}%</span>
                    </TableCell>
                    <TableCell className="pr-4 text-sm">{h.changedByName}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
