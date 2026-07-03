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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
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

function KvRowEditor({ structureName, kv, categories, rows }: { structureName: string; kv: string; categories: string[]; rows: RatioRow[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const saveRatios = useSaveRmRatios();

  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cat of categories) {
      const row = rows.find((r) => r.category === cat);
      map[cat] = row ? (row.ratioValue * 100).toFixed(2) : "0";
    }
    return map;
  }, [categories, rows]);

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
    <div className="border border-border/50 rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-muted-foreground">{kv}</span>
        <span className={`text-xs font-mono ${sumOk ? "text-emerald-500" : "text-destructive"}`}>
          Sum: {sum.toFixed(1)}%
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {categories.map((cat) => (
          <div key={cat} className="space-y-1">
            <label className="text-xs text-muted-foreground">{cat}</label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                value={values[cat]}
                onChange={(e) => handleChange(cat, e.target.value)}
                className="font-mono text-sm pr-6"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </div>
      {!sumOk && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">Row must sum to 100% before saving.</AlertDescription>
        </Alert>
      )}
      <Button
        size="sm"
        onClick={handleSave}
        disabled={!dirty || saveRatios.isPending || !sumOk}
        className="w-full font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
      >
        {saveRatios.isPending ? "Saving..." : "Save Row"}
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

  const kvGroups = useMemo(() => {
    const byKv = new Map<string, RatioRow[]>();
    for (const row of rowsForStructure) {
      if (!byKv.has(row.kv)) byKv.set(row.kv, []);
      byKv.get(row.kv)!.push(row);
    }
    return Array.from(byKv.entries()).map(([kv, rows]) => ({
      kv,
      rows,
      categories: sortCategories(rows.map((r) => r.category)),
    }));
  }, [rowsForStructure]);

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="bg-card/50 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <CardTitle>Raw Material Ratio Editor</CardTitle>
          </div>
          <CardDescription>
            Voltage-weighted RM price ratios per structure. These are set-and-forget values that only affect new
            quotes going forward — existing saved quotes and revisions are never recalculated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
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

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading ratios...</p>
          ) : kvGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ratio rows found for this structure.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {kvGroups.map((group) => (
                <KvRowEditor
                  key={`${selectedStructure}-${group.kv}`}
                  structureName={selectedStructure}
                  kv={group.kv}
                  categories={group.categories}
                  rows={group.rows}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="bg-card/50 border-b border-border/50">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
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
                    <TableCell className="font-mono text-sm">
                      {h.oldValue === null || h.oldValue === undefined ? "—" : `${(h.oldValue * 100).toFixed(1)}%`} &rarr; {(h.newValue * 100).toFixed(1)}%
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
