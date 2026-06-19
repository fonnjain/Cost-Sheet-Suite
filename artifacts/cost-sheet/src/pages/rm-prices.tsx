import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useGetRmPrices, useSaveRmPrices, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Upload, Save, CheckCircle, AlertTriangle, Calculator as CalcIcon } from "lucide-react";
import { INITIAL_DATA } from "@/lib/v6/data";
import type { InitialCell } from "@/lib/v6/data";
import { buildRMData, getDistinctMakes, pickRMPriceForCategory } from "@/lib/v6/engine";

interface RmGroup {
  name: string;
  items: { key: string; label: string; default: number }[];
}

function buildGroups(rec: Record<string, InitialCell>): RmGroup[] {
  const groups: RmGroup[] = [];
  const idx: Record<string, number> = {};
  for (const [key, meta] of Object.entries(rec)) {
    if (idx[meta.group] === undefined) {
      idx[meta.group] = groups.length;
      groups.push({ name: meta.group, items: [] });
    }
    groups[idx[meta.group]].items.push({ key, label: meta.label, default: meta.value });
  }
  return groups;
}

const DAILY_GROUPS = buildGroups(INITIAL_DATA.daily);
const TWICE_MONTHLY_GROUPS = buildGroups(INITIAL_DATA.twice);

const ALL_DAILY_ITEMS = DAILY_GROUPS.flatMap((g) => g.items);
const ALL_TWICE_ITEMS = TWICE_MONTHLY_GROUPS.flatMap((g) => g.items);
const ALL_ITEMS = [...ALL_DAILY_ITEMS, ...ALL_TWICE_ITEMS];

// Computed categories the engine derives from the Billet/RM cascade. These are
// the values that feed the cost build-up — shown read-only for verification.
const COMPUTED_CATEGORIES: { label: string; cat: string }[] = [
  { label: "Light Angle", cat: "Light" },
  { label: "Medium Angle", cat: "Medium" },
  { label: "Heavy Angle", cat: "Heavy" },
  { label: "Super Heavy Angle", cat: "Super Heavy" },
  { label: "Plate", cat: "Plate" },
  { label: "Channel", cat: "Channel" },
];

function parseImportedCsv(text: string): Record<string, number> | null {
  const result: Record<string, number> = {};
  const lines = text.trim().split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(/[,\t]/);
    if (parts.length < 2) continue;
    const key = parts[0].trim().toUpperCase();
    const val = parseFloat(parts[1].replace(/[^0-9.-]/g, ""));
    if (key && !isNaN(val)) {
      result[key] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export default function RmPrices() {
  const { data: rmPrices, isLoading } = useGetRmPrices();
  const saveRmPrices = useSaveRmPrices();
  const { data: user } = useGetMe();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  const [dailyData, setDailyData] = useState<Record<string, number>>({});
  const [twiceMonthlyData, setTwiceMonthlyData] = useState<Record<string, number>>({});

  // Verify dialog state
  const [showVerify, setShowVerify] = useState(false);
  // Import preview dialog
  const [importPreview, setImportPreview] = useState<Record<string, number> | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Computed-price preview controls
  const [previewMatType, setPreviewMatType] = useState<"MS" | "HT">("MS");
  const [previewMake, setPreviewMake] = useState<string>("");

  const today = new Date();
  const is1stOr15th = today.getDate() === 1 || today.getDate() === 15;
  const isWindowOpen = is1stOr15th || rmPrices?.isWindowUnlocked || user?.role === "admin";

  useEffect(() => {
    if (rmPrices) {
      const daily = (rmPrices.dailyData as Record<string, number>) ?? {};
      const twice = (rmPrices.twiceMonthlyData as Record<string, number>) ?? {};
      const filledDaily: Record<string, number> = {};
      ALL_DAILY_ITEMS.forEach((item) => {
        filledDaily[item.key] = daily[item.key] ?? item.default;
      });
      const filledTwice: Record<string, number> = {};
      ALL_TWICE_ITEMS.forEach((item) => {
        filledTwice[item.key] = twice[item.key] ?? item.default;
      });
      setDailyData(filledDaily);
      setTwiceMonthlyData(filledTwice);
    }
  }, [rmPrices]);

  // Build computed RM data reactively from the current inputs (overrides applied
  // to the embedded Billet/RM cells). This is the v6 auto-populate cascade.
  const computed = useMemo(() => {
    const overrides = { ...dailyData, ...twiceMonthlyData };
    const rm = buildRMData(overrides);
    const makes = getDistinctMakes(rm);
    return { rm, makes };
  }, [dailyData, twiceMonthlyData]);

  useEffect(() => {
    if (computed.makes.length > 0 && !computed.makes.includes(previewMake)) {
      setPreviewMake(computed.makes[0]);
    }
  }, [computed.makes, previewMake]);

  const computedRows = useMemo(() => {
    const make = previewMake || computed.makes[0] || "";
    return COMPUTED_CATEGORIES.map((c) => ({
      label: c.label,
      value: pickRMPriceForCategory(computed.rm, c.cat, make, previewMatType),
    }));
  }, [computed, previewMake, previewMatType]);

  const handleDailyChange = (key: string, value: string) => {
    setDailyData((prev) => ({ ...prev, [key]: Number(value) || 0 }));
  };

  const handleTwiceMonthlyChange = (key: string, value: string) => {
    setTwiceMonthlyData((prev) => ({ ...prev, [key]: Number(value) || 0 }));
  };

  const handleSaveConfirmed = async () => {
    try {
      await saveRmPrices.mutateAsync({ data: { dailyData, twiceMonthlyData } });
      toast({ title: "Saved", description: "RM Prices saved. Opening Calculator…" });
      setShowVerify(false);
      setLocation("/calculator");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save prices.";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseImportedCsv(text);
      if (!parsed) {
        toast({ variant: "destructive", title: "Import Failed", description: "Could not parse file. Expected CSV with cell key and value columns (e.g. C6,384400)." });
        return;
      }
      setImportPreview(parsed);
      setShowImport(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleApplyImport = () => {
    if (!importPreview) return;
    const newDaily = { ...dailyData };
    const newTwice = { ...twiceMonthlyData };
    ALL_DAILY_ITEMS.forEach((item) => {
      if (importPreview[item.key] !== undefined) newDaily[item.key] = importPreview[item.key];
    });
    ALL_TWICE_ITEMS.forEach((item) => {
      if (importPreview[item.key] !== undefined) newTwice[item.key] = importPreview[item.key];
    });
    setDailyData(newDaily);
    setTwiceMonthlyData(newTwice);
    setShowImport(false);
    setImportPreview(null);
    toast({ title: "Imported", description: "Values loaded from file. Review and click Save Prices to confirm." });
  };

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm animate-pulse">Loading RM prices…</div>
    );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RM Price Console</h1>
          <p className="text-muted-foreground">Manage raw material base rates</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm font-mono bg-card px-3 py-1.5 rounded-md border border-border">
            {format(today, "dd MMM yyyy")}
          </div>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
            data-testid="button-import-rm"
          >
            <Upload className="h-4 w-4" />
            Import RM Prices
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            onClick={() => setShowVerify(true)}
            disabled={saveRmPrices.isPending}
            className="font-bold gap-2"
            data-testid="button-save-rm"
          >
            <Save className="h-4 w-4" />
            {saveRmPrices.isPending ? "Saving…" : "Save Prices"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Daily Inputs */}
        <Card className="flex flex-col h-full border-border/50">
          <CardHeader className="pb-4 border-b border-border/50 bg-card/50">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Daily Inputs</CardTitle>
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/10">Always Editable</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-8 flex-1 overflow-y-auto">
            {DAILY_GROUPS.map((group) => (
              <div key={group.name} className="space-y-3">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{group.name}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <div key={item.key} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground truncate block" title={`${item.label} [${item.key}]`}>
                        {item.label} <span className="font-mono opacity-60">[{item.key}]</span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">₹</span>
                        <Input
                          type="number"
                          value={dailyData[item.key] ?? item.default}
                          onChange={(e) => handleDailyChange(item.key, e.target.value)}
                          className="pl-7 font-mono bg-background focus:bg-card transition-colors"
                          data-testid={`input-daily-${item.key}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Twice-Monthly Inputs */}
        <Card className="flex flex-col h-full border-border/50">
          <CardHeader className="pb-4 border-b border-border/50 bg-card/50">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Twice-Monthly Inputs</CardTitle>
              {isWindowOpen ? (
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/10">Window Open</Badge>
              ) : (
                <Badge variant="outline" className="text-amber-500 border-amber-500/20 bg-amber-500/10">Locked</Badge>
              )}
            </div>
            {!isWindowOpen && (
              <CardDescription className="text-amber-500/80 mt-1">
                Only editable on 1st or 15th of the month. Admin can unlock from the Admin panel.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="pt-6 space-y-8 flex-1 overflow-y-auto">
            {TWICE_MONTHLY_GROUPS.map((group) => (
              <div key={group.name} className="space-y-3">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{group.name}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <div key={item.key} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground truncate block" title={`${item.label} [${item.key}]`}>
                        {item.label} <span className="font-mono opacity-60">[{item.key}]</span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">₹</span>
                        <Input
                          type="number"
                          value={twiceMonthlyData[item.key] ?? item.default}
                          onChange={(e) => handleTwiceMonthlyChange(item.key, e.target.value)}
                          disabled={!isWindowOpen}
                          className="pl-7 font-mono bg-background focus:bg-card transition-colors disabled:opacity-50"
                          data-testid={`input-twice-${item.key}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Computed RM Prices (read-only auto-populate cascade) */}
      <Card className="border-border/50">
        <CardHeader className="pb-4 border-b border-border/50 bg-card/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalcIcon className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Computed RM Prices</CardTitle>
                <CardDescription className="mt-0.5">
                  Auto-populated from the inputs above. Read-only — these feed the cost build-up.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={previewMake} onValueChange={setPreviewMake}>
                <SelectTrigger className="w-[150px]" data-testid="select-preview-make">
                  <SelectValue placeholder="Make" />
                </SelectTrigger>
                <SelectContent>
                  {computed.makes.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={previewMatType} onValueChange={(v) => setPreviewMatType(v as "MS" | "HT")}>
                <SelectTrigger className="w-[100px]" data-testid="select-preview-mattype">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MS">MS</SelectItem>
                  <SelectItem value="HT">HT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 text-sm">
            <div>
              <span className="text-muted-foreground">RM Date: </span>
              <span className="font-mono">{computed.rm.rmDate}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Zinc: </span>
              <span className="font-mono font-bold">
                {computed.rm.zincPrice != null ? `₹${computed.rm.zincPrice.toLocaleString("en-IN")}` : "—"}
              </span>
            </div>
          </div>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Computed Price (₹/MT)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {computedRows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell className="text-sm">{r.label}</TableCell>
                    <TableCell className="text-right font-mono font-bold" data-testid={`computed-${r.label.replace(/\s+/g, "-").toLowerCase()}`}>
                      {r.value != null ? Math.round(r.value).toLocaleString("en-IN") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Verify Save Dialog */}
      <Dialog open={showVerify} onOpenChange={setShowVerify}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              Verify RM Prices
            </DialogTitle>
            <DialogDescription>
              Review all values before saving. These will replace the current prices on record.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 rounded-md border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Cell</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Value (₹)</TableHead>
                  <TableHead className="text-center">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_DAILY_ITEMS.map((item) => (
                  <TableRow key={item.key}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{item.key}</TableCell>
                    <TableCell className="text-sm">{item.label}</TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {(dailyData[item.key] ?? item.default).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/20">Daily</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {ALL_TWICE_ITEMS.map((item) => (
                  <TableRow key={item.key} className={!isWindowOpen ? "opacity-50" : ""}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{item.key}</TableCell>
                    <TableCell className="text-sm">{item.label}</TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {(twiceMonthlyData[item.key] ?? item.default).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-xs ${isWindowOpen ? "text-amber-500 border-amber-500/20" : "text-muted-foreground"}`}>
                        {isWindowOpen ? "2x/Month" : "Locked"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowVerify(false)}>Cancel</Button>
            <Button
              onClick={handleSaveConfirmed}
              disabled={saveRmPrices.isPending}
              className="font-bold gap-2"
              data-testid="button-confirm-save"
            >
              <Save className="h-4 w-4" />
              {saveRmPrices.isPending ? "Saving…" : "Confirm & Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Preview Dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Import Preview
            </DialogTitle>
            <DialogDescription>
              The following values were found in the file. They will override the current inputs. Any keys not in the file remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 rounded-md border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Cell</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Imported Value (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importPreview && Object.entries(importPreview).map(([key, val]) => {
                  const item = ALL_ITEMS.find((i) => i.key === key);
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{key}</TableCell>
                      <TableCell className="text-sm">{item?.label ?? "Unknown cell"}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-primary">
                        {val.toLocaleString("en-IN")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowImport(false)}>Discard</Button>
            <Button onClick={handleApplyImport} className="font-bold gap-2" data-testid="button-apply-import">
              <Upload className="h-4 w-4" />
              Apply Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
