import { useState, useMemo } from "react";
import { useGetRmPrices, useGetRmOffsets, useSaveRmOffsets } from "@workspace/api-client-react";
import { computeAutoOverrides, DEFAULT_OFFSETS } from "@/lib/v6/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Save, RotateCcw } from "lucide-react";

const OFFSET_GROUPS: {
  group: string;
  description: string;
  items: {
    key: string;
    label: string;
    baseKey: string;
    baseLabel: string;
    chainNote?: string;
  }[];
}[] = [
  {
    group: "Ryp Billets",
    description: "Offsets applied to Ryp commercial billet prices",
    items: [
      {
        key: "E9",
        label: "Ryp_Test (L)",
        baseKey: "C9",
        baseLabel: "Ryp_Coml (L)",
      },
      {
        key: "F9",
        label: "Ryp_Test (H)",
        baseKey: "D9",
        baseLabel: "Ryp_Coml (H)",
      },
      {
        key: "G9",
        label: "Ngp_Test (H)",
        baseKey: "E9",
        baseLabel: "Ryp_Test (L)",
        chainNote: "chains off E9",
      },
    ],
  },
  {
    group: "SAIL Billets",
    description: "Offsets applied to SAIL Dgp billet price",
    items: [
      { key: "I9", label: "SAIL_Kol", baseKey: "H9", baseLabel: "SAIL_Dgp" },
      { key: "J9", label: "SAIL_Ryp", baseKey: "H9", baseLabel: "SAIL_Dgp" },
      { key: "K9", label: "SAIL_Ngp", baseKey: "H9", baseLabel: "SAIL_Dgp" },
      { key: "L9", label: "SAIL_Rour", baseKey: "H9", baseLabel: "SAIL_Dgp" },
    ],
  },
  {
    group: "Wire Rods",
    description: "Offsets applied to Ludhiana commercial wire rod price",
    items: [
      {
        key: "D18",
        label: "RINL/JSW (Pb)",
        baseKey: "C18",
        baseLabel: "Ludhiana_Coml",
      },
      {
        key: "E18",
        label: "RINL/JSW (Lkw)",
        baseKey: "C18",
        baseLabel: "Ludhiana_Coml",
      },
    ],
  },
];

const ALL_KEYS = OFFSET_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export default function RmDataVariation() {
  const { data: rmPrices } = useGetRmPrices();
  const { data: rmOffsets, refetch } = useGetRmOffsets();
  const saveRmOffsets = useSaveRmOffsets();
  const { toast } = useToast();

  const savedOffsets = useMemo(
    () => (rmOffsets?.offsetData as Record<string, number>) ?? {},
    [rmOffsets?.offsetData],
  );

  const [localOffsets, setLocalOffsets] = useState<Record<string, number>>({});
  const [initialized, setInitialized] = useState(false);

  if (!initialized && rmOffsets !== undefined) {
    const initial: Record<string, number> = {};
    ALL_KEYS.forEach((k) => {
      initial[k] = savedOffsets[k] ?? DEFAULT_OFFSETS[k] ?? 0;
    });
    setLocalOffsets(initial);
    setInitialized(true);
  }

  const dailyData = useMemo(
    () => (rmPrices?.dailyData as Record<string, number>) ?? {},
    [rmPrices?.dailyData],
  );

  const liveAutoValues = useMemo(
    () => computeAutoOverrides(dailyData, localOffsets),
    [dailyData, localOffsets],
  );

  const savedAutoValues = useMemo(
    () => computeAutoOverrides(dailyData, savedOffsets),
    [dailyData, savedOffsets],
  );

  const isDirty = useMemo(
    () => ALL_KEYS.some((k) => (localOffsets[k] ?? 0) !== (savedOffsets[k] ?? DEFAULT_OFFSETS[k] ?? 0)),
    [localOffsets, savedOffsets],
  );

  const handleOffsetChange = (key: string, raw: string) => {
    const v = parseInt(raw.replace(/[^0-9-]/g, ""), 10);
    setLocalOffsets((prev) => ({ ...prev, [key]: isNaN(v) ? 0 : v }));
  };

  const handleReset = () => {
    const reset: Record<string, number> = {};
    ALL_KEYS.forEach((k) => {
      reset[k] = savedOffsets[k] ?? DEFAULT_OFFSETS[k] ?? 0;
    });
    setLocalOffsets(reset);
  };

  const handleResetToDefaults = () => {
    const reset: Record<string, number> = {};
    ALL_KEYS.forEach((k) => {
      reset[k] = DEFAULT_OFFSETS[k] ?? 0;
    });
    setLocalOffsets(reset);
  };

  const handleSave = async () => {
    try {
      await saveRmOffsets.mutateAsync({ data: { offsetData: localOffsets } });
      await refetch();
      toast({ title: "Saved", description: "RM offset configuration saved." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save offsets.";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const getBaseValue = (baseKey: string): number | null => {
    return dailyData[baseKey] ?? null;
  };

  return (
    <div className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold font-sora tracking-tight">RM Data Variation</h1>
        <p className="text-sm text-muted-foreground">
          Configure additive offsets for auto-populated billet and wire rod cells.
          Changes persist across sessions and apply immediately to the RM console and Calculator.
        </p>
      </div>

      {OFFSET_GROUPS.map((group) => (
        <Card key={group.group} className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold font-sora text-foreground">
              {group.group}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{group.description}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.items.map((item) => {
              const baseVal = getBaseValue(item.baseKey);
              const offset = localOffsets[item.key] ?? DEFAULT_OFFSETS[item.key] ?? 0;
              const liveResult = liveAutoValues[item.key] ?? 0;
              const savedResult = savedAutoValues[item.key] ?? 0;
              const offsetChanged = offset !== (savedOffsets[item.key] ?? DEFAULT_OFFSETS[item.key] ?? 0);

              return (
                <div key={item.key} className="grid grid-cols-3 gap-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      BASE — {item.baseLabel}
                      {item.chainNote && (
                        <span className="ml-1 text-amber-400/70">({item.chainNote})</span>
                      )}
                    </Label>
                    <div className="h-9 flex items-center px-3 rounded-md bg-muted/40 border border-border">
                      <span className="text-sm font-mono text-muted-foreground">
                        {baseVal !== null
                          ? baseVal.toLocaleString("en-IN")
                          : <span className="text-xs italic">no data</span>
                        }
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`offset-${item.key}`} className="text-xs text-muted-foreground flex items-center gap-1">
                      OFFSET
                      {offsetChanged && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved change" />
                      )}
                    </Label>
                    <Input
                      id={`offset-${item.key}`}
                      type="number"
                      value={offset}
                      onChange={(e) => handleOffsetChange(item.key, e.target.value)}
                      className="font-mono h-9 text-right"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{item.label}</Label>
                    <div className={`h-9 flex items-center px-3 rounded-md border ${
                      liveResult !== savedResult
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                        : "bg-accent/20 border-accent/40 text-accent"
                    }`}>
                      <span className="text-sm font-mono font-semibold">
                        {liveResult.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <Button
          onClick={handleSave}
          disabled={!isDirty || saveRmOffsets.isPending}
          className="bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          <Save className="w-4 h-4 mr-2" />
          {saveRmOffsets.isPending ? "Saving…" : "Save Offsets"}
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={!isDirty}
          title="Revert unsaved changes"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Revert
        </Button>
        <Button
          variant="ghost"
          onClick={handleResetToDefaults}
          className="text-muted-foreground text-xs ml-auto"
        >
          Reset to defaults
        </Button>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-3 space-y-1">
        <div className="font-medium text-foreground/70">How offsets work</div>
        <div>Result = Base + Offset. The Ngp_Test (H) cell chains: it uses the computed Ryp_Test (L) as its base, not the raw market price.</div>
        <div>Amber highlight on a result means it differs from the last saved value — save to apply.</div>
      </div>
    </div>
  );
}
