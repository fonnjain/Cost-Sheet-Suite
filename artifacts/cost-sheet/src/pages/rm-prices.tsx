import { useState, useEffect, useRef } from "react";
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
import { format } from "date-fns";
import { Upload, Save, CheckCircle, AlertTriangle } from "lucide-react";

const DAILY_GROUPS = [
  { name: "Zinc", items: [{ label: "Zinc (HZL List) [C6]", key: "C6", default: 384400 }] },
  { name: "Billets", items: [
    { label: "Billet — Ryp_Coml (L) [C9]", key: "C9", default: 38511 },
    { label: "Billet — Ryp_Coml (H) [D9]", key: "D9", default: 44511 },
    { label: "Billet — SAIL_Dgp [H9]", key: "H9", default: 47000 },
    { label: "Billet — JSPL_Rgh [M9]", key: "M9", default: 50000 },
  ]},
  { name: "Wire Rods", items: [{ label: "Wire Rod — Ludhiana (Coml) [C18]", key: "C18", default: 57000 }] },
  { name: "Rounds", items: [{ label: "Round — Delhi (Coml) [C21]", key: "C21", default: 52500 }] },
  { name: "JSPL Angle Gauges", items: [
    { label: "Light [D47]", key: "D47", default: 0 },
    { label: "Medium [D48]", key: "D48", default: 10000 },
    { label: "Heavy [D49]", key: "D49", default: 13000 },
    { label: "Ultra Heavy [D51]", key: "D51", default: 18500 },
  ]},
  { name: "SAIL-DGP Beam Gauges", items: [
    { label: "HB-100x116 [I71]", key: "I71", default: 10000 },
    { label: "HB-150 37kg [I72]", key: "I72", default: 10000 },
    { label: "HB-150 34kg [I73]", key: "I73", default: 10000 },
    { label: "WPB-160 [I74]", key: "I74", default: 9000 },
  ]},
  { name: "JSPL Beam Gauges", items: [
    { label: "WPB-160 [I77]", key: "I77", default: 17500 },
    { label: "HB-150 37kg [I78]", key: "I78", default: 17500 },
    { label: "HB-150 34kg [I79]", key: "I79", default: 17500 },
    { label: "UC-203x152 [I80]", key: "I80", default: 21500 },
    { label: "UC-203x203 [I81]", key: "I81", default: 21500 },
  ]},
  { name: "JSPL H-Beam", items: [{ label: "B-150/152 [F85]", key: "F85", default: 7500 }] },
  { name: "JSPL Channel", items: [{ label: "C-100/125/150 [F91]", key: "F91", default: 7500 }] },
];

const TWICE_MONTHLY_GROUPS = [
  { name: "HR Plate", items: [
    { label: "C122", key: "C122", default: 5500 },
    { label: "D122", key: "D122", default: 7000 },
    { label: "E122", key: "E122", default: 8000 },
  ]},
  { name: "HR Coil", items: [
    { label: "C125", key: "C125", default: 4000 },
    { label: "D125", key: "D125", default: 5500 },
  ]}
];

const ALL_ITEMS = [
  ...DAILY_GROUPS.flatMap(g => g.items),
  ...TWICE_MONTHLY_GROUPS.flatMap(g => g.items),
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

  const today = new Date();
  const is1stOr15th = today.getDate() === 1 || today.getDate() === 15;
  const isWindowOpen = is1stOr15th || rmPrices?.isWindowUnlocked || user?.role === "admin";

  useEffect(() => {
    if (rmPrices) {
      const daily = (rmPrices.dailyData as Record<string, number>) ?? {};
      const twice = (rmPrices.twiceMonthlyData as Record<string, number>) ?? {};
      // Fill in defaults for any missing keys
      const filledDaily: Record<string, number> = {};
      DAILY_GROUPS.flatMap(g => g.items).forEach(item => {
        filledDaily[item.key] = daily[item.key] ?? item.default;
      });
      const filledTwice: Record<string, number> = {};
      TWICE_MONTHLY_GROUPS.flatMap(g => g.items).forEach(item => {
        filledTwice[item.key] = twice[item.key] ?? item.default;
      });
      setDailyData(filledDaily);
      setTwiceMonthlyData(filledTwice);
    }
  }, [rmPrices]);

  const handleDailyChange = (key: string, value: string) => {
    setDailyData(prev => ({ ...prev, [key]: Number(value) || 0 }));
  };

  const handleTwiceMonthlyChange = (key: string, value: string) => {
    setTwiceMonthlyData(prev => ({ ...prev, [key]: Number(value) || 0 }));
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

  // Handle file import
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
    // Reset so same file can be re-imported
    e.target.value = "";
  };

  const handleApplyImport = () => {
    if (!importPreview) return;
    const newDaily = { ...dailyData };
    const newTwice = { ...twiceMonthlyData };
    DAILY_GROUPS.flatMap(g => g.items).forEach(item => {
      if (importPreview[item.key] !== undefined) newDaily[item.key] = importPreview[item.key];
    });
    TWICE_MONTHLY_GROUPS.flatMap(g => g.items).forEach(item => {
      if (importPreview[item.key] !== undefined) newTwice[item.key] = importPreview[item.key];
    });
    setDailyData(newDaily);
    setTwiceMonthlyData(newTwice);
    setShowImport(false);
    setImportPreview(null);
    toast({ title: "Imported", description: "Values loaded from file. Review and click Save Prices to confirm." });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-24 text-muted-foreground text-sm animate-pulse">Loading RM prices…</div>
  );

  const allDailyItems = DAILY_GROUPS.flatMap(g => g.items);
  const allTwiceItems = TWICE_MONTHLY_GROUPS.flatMap(g => g.items);

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
          {/* Import button */}
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
          {/* Save button — always enabled, triggers verify dialog */}
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
            {DAILY_GROUPS.map(group => (
              <div key={group.name} className="space-y-3">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{group.name}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.items.map(item => (
                    <div key={item.key} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground truncate block" title={item.label}>{item.label}</Label>
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
            {TWICE_MONTHLY_GROUPS.map(group => (
              <div key={group.name} className="space-y-3">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{group.name}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.items.map(item => (
                    <div key={item.key} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground truncate block" title={item.label}>{item.label}</Label>
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
                {allDailyItems.map(item => (
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
                {allTwiceItems.map(item => (
                  <TableRow key={item.key} className={!isWindowOpen ? "opacity-50" : ""}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{item.key}</TableCell>
                    <TableCell className="text-sm">HR {item.key.startsWith("C12") || item.key.startsWith("D12") || item.key.startsWith("E12") ? "Plate/Coil" : "Coil"} [{item.label}]</TableCell>
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
                  const item = ALL_ITEMS.find(i => i.key === key);
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
