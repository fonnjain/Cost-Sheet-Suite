import { useState, useEffect } from "react";
import { useGetRmPrices, useSaveRmPrices, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

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

export default function RmPrices() {
  const { data: rmPrices, isLoading } = useGetRmPrices();
  const saveRmPrices = useSaveRmPrices();
  const { data: user } = useGetMe();
  const { toast } = useToast();

  const [dailyData, setDailyData] = useState<Record<string, number>>({});
  const [twiceMonthlyData, setTwiceMonthlyData] = useState<Record<string, number>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const today = new Date();
  const is1stOr15th = today.getDate() === 1 || today.getDate() === 15;
  const isWindowOpen = is1stOr15th || rmPrices?.isWindowUnlocked || user?.role === 'admin';

  useEffect(() => {
    if (rmPrices) {
      setDailyData(rmPrices.dailyData as Record<string, number>);
      setTwiceMonthlyData(rmPrices.twiceMonthlyData as Record<string, number>);
      setHasChanges(false);
    }
  }, [rmPrices]);

  const handleDailyChange = (key: string, value: string) => {
    setDailyData(prev => ({ ...prev, [key]: Number(value) || 0 }));
    setHasChanges(true);
  };

  const handleTwiceMonthlyChange = (key: string, value: string) => {
    setTwiceMonthlyData(prev => ({ ...prev, [key]: Number(value) || 0 }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await saveRmPrices.mutateAsync({
        data: {
          dailyData,
          twiceMonthlyData
        }
      });
      toast({ title: "Success", description: "RM Prices saved successfully." });
      setHasChanges(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to save prices." });
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RM Price Console</h1>
          <p className="text-muted-foreground">Manage raw material base rates</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm font-mono bg-card px-3 py-1.5 rounded-md border border-border">
            {format(today, 'dd MMM yyyy')}
          </div>
          <Button onClick={handleSave} disabled={!hasChanges || saveRmPrices.isPending} className="font-bold">
            {saveRmPrices.isPending ? "Saving..." : "Save Prices"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

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
                Only editable on 1st or 15th of the month.
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
    </div>
  );
}
