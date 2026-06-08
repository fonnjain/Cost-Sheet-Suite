import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  useListCustomers, 
  useCreateCustomer, 
  useGetMe, 
  useGetRmPrices, 
  useCreateQuote,
  useGetQuotesByProject
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { calculateCostSheet, formatINR } from "@/lib/costCalculator";
import { ChevronRight, ChevronLeft, Check, Plus, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const STRUCTURE_FAMILIES = [
  { group: "TLT (Towers)", items: ["TLT >800 mt", "TLT 401-800 mt", "TLT 151-400 mt", "TLT 51-150 mt", "TLT < 50 mt", "TLT Railway"] },
  { group: "Sub-Station", items: ["Sub-Station (L) 401-800 mt", "Sub Station (L) - 151-400 mt", "Sub Station (L) < 150 mt", "Sub-Station (P)", "Sub-Station (P2)", "out source < 150 mt"] },
  { group: "Poles", items: ["Swaged Pole", "Stepped Pole", "Monopole 50-150 mt", "Monopole < 50 mt"] },
  { group: "Railway", items: ["Railway OHE", "Railway OHE (Heavy)", "Railway Bridge"] },
  { group: "Hardware & Other", items: ["Transmission Hardware", "Distribution Hardware", "Earthing Hardware", "Clamps & Connectors", "GI Wire", "Conductor", "Cable Tray", "Misc"] },
];

const KV_OPTIONS = ["11kV", "33kV", "66kV", "132kV", "220kV", "400kV", "765kV"];

export default function Calculator() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: user } = useGetMe();
  const { data: customers } = useListCustomers();
  const createCustomer = useCreateCustomer();
  const createQuote = useCreateQuote();
  const { data: rmPrices } = useGetRmPrices();

  const [step, setStep] = useState(1);
  
  // Step 1 State
  const [customerId, setCustomerId] = useState<string>("");
  const [projectRef, setProjectRef] = useState("");
  const [isNewCustomerDialogOpen, setIsNewCustomerDialogOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");

  // Check revisions
  const custIdNum = parseInt(customerId, 10);
  const { data: existingQuotes } = useGetQuotesByProject(
    { customerId: custIdNum, projectRef },
    { query: { enabled: !!custIdNum && !!projectRef, queryKey: ["quotes", custIdNum, projectRef] } }
  );
  const nextRevision = existingQuotes ? existingQuotes.length : 0;

  // Step 2 State
  const [structureType, setStructureType] = useState("");
  const [kvOption, setKvOption] = useState("");

  // Step 3 State (Inputs)
  const [inputs, setInputs] = useState<Record<string, any>>({
    steelBasePrice: 0,
    incidental: 0,
    scrapPct: 0.04,
    recoveryPct: -0.4,
    zincPrice: 384400,
    zincMicron: 0.045,
    fabLabor: 0,
    weldCons: 0,
    galvFl: 0,
    packStrn: 0,
    loadUnload: 0,
    handover: 0,
    others: 0,
    protoCost: 0,
    protoPct: 0,
    wipSteelRate: 0.09,
    wipSteelMonths: 2,
    wipZincRate: 0.09,
    wipZincMonths: 1,
    inspectIns: 0,
    spPacking: 0,
    freightOut: 0,
    thirdParty: 0,
    agencyComm: 0,
    bgCost: 0,
    openPoRate: 0.09, openPoMonths: 0, openPoPct: 0,
    finalPaymentRate: 0.09, finalPaymentMonths: 0, finalPaymentPct: 0,
    emdRate: 0.09, emdMonths: 0, emdPct: 0,
    lcRate: 0.09, lcMonths: 0, lcPct: 0,
    vfsRate: 0.09, vfsMonths: 0, vfsPct: 0,
    abgRate: 0.09, abgMonths: 0, abgPct: 0,
    pbgRate: 0.09, pbgMonths: 0, pbgPct: 0,
    cpbgRate: 0.09, cpbgMonths: 0, cpbgPct: 0,
    advanceRate: 0.09, advanceMonths: 0, advancePct: 0,
    marginPct: 0.05,
    notes: ""
  });

  // Pre-fill from RM Prices when step 3 starts
  useEffect(() => {
    if (step === 3 && rmPrices) {
      // Just a simple default mapping, in reality this would be more complex based on structure type
      const defaultSteel = (rmPrices.dailyData as any)?.['C9'] || 0;
      const defaultZinc = (rmPrices.dailyData as any)?.['C6'] || 384400;
      
      setInputs(prev => ({
        ...prev,
        steelBasePrice: prev.steelBasePrice || defaultSteel,
        zincPrice: prev.zincPrice === 384400 ? defaultZinc : prev.zincPrice
      }));
    }
  }, [step, rmPrices]);

  const handleInputChange = (key: string, value: string) => {
    setInputs(prev => ({ ...prev, [key]: Number(value) || 0 }));
  };

  const handleStringChange = (key: string, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName) return;
    try {
      const res = await createCustomer.mutateAsync({ data: { name: newCustomerName } });
      setCustomerId(res.id.toString());
      setIsNewCustomerDialogOpen(false);
      setNewCustomerName("");
      toast({ title: "Success", description: "Customer created" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const costBreakdown = useMemo(() => calculateCostSheet(inputs, rmPrices), [inputs, rmPrices]);

  const handleSaveQuote = async () => {
    try {
      const custId = parseInt(customerId, 10);
      const customerName = customers?.find((c) => c.id === custId)?.name ?? "Unknown";
      await createQuote.mutateAsync({
        data: {
          customerId: custId,
          customerName,
          projectRef,
          structureType,
          kvOption: kvOption || null,
          quotePricePerMt: costBreakdown.quotePrice,
          totalCost: costBreakdown.totalBeforeMargin,
          steelPrice: inputs.steelBasePrice,
          zincPrice: inputs.zincPrice,
          inputs,
          costBreakdown,
          generatedByName: user?.name || "Unknown",
          notes: inputs.notes
        }
      });
      toast({ title: "Success", description: "Quote saved successfully" });
      setLocation("/dashboard");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const canProceedToStep2 = customerId && projectRef;
  const canProceedToStep3 = structureType && (!structureType.includes("Sub-Station") || kvOption);
  const canProceedToStep4 = true; // Add specific validation if needed

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calculator</h1>
          <p className="text-muted-foreground">Build a new cost sheet quote</p>
        </div>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted -z-10 rounded"></div>
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary -z-10 rounded transition-all duration-300" style={{ width: `${((step - 1) / 3) * 100}%` }}></div>
        
        {[1, 2, 3, 4].map(s => (
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
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map(c => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Input value={projectRef} onChange={(e) => setProjectRef(e.target.value)} placeholder="e.g. PO-2024-001" />
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
              <Button onClick={() => setStep(2)} disabled={!canProceedToStep2} className="font-bold">
                Next: Pick Structure <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-6 md:p-8 space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold mb-2">Step 2: Pick Structure</h2>
              <p className="text-sm text-muted-foreground">Select the type of structure for this quote.</p>
            </div>
            
            <div className="space-y-8">
              {STRUCTURE_FAMILIES.map(family => (
                <div key={family.group} className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
                    {family.group}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {family.items.map(item => (
                      <Card 
                        key={item} 
                        className={`cursor-pointer transition-all border ${structureType === item ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border/50 hover:border-primary/50 bg-card/50'}`}
                        onClick={() => setStructureType(item)}
                      >
                        <CardContent className="p-4 flex items-center justify-center text-center min-h-[80px]">
                          <span className="text-sm font-medium leading-tight">{item}</span>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {structureType.includes("Sub-Station") && (
              <div className="pt-6 border-t border-border/50 space-y-4 max-w-sm animate-in fade-in zoom-in duration-300">
                <Label className="text-primary font-bold">Requires kV Option</Label>
                <Select value={kvOption} onValueChange={setKvOption}>
                  <SelectTrigger className="border-primary/50">
                    <SelectValue placeholder="Select voltage..." />
                  </SelectTrigger>
                  <SelectContent>
                    {KV_OPTIONS.map(kv => (
                      <SelectItem key={kv} value={kv}>{kv}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <span className="font-medium text-foreground">{customers?.find(c => c.id.toString() === customerId)?.name}</span> • 
                <span className="font-mono">{projectRef}</span> • 
                <span>{structureType} {kvOption ? `(${kvOption})` : ''}</span>
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
                    <h3 className="font-bold text-lg border-b border-border/50 pb-2">Steel & Materials</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Steel Base Price (₹/mt)</Label>
                        <Input type="number" value={inputs.steelBasePrice} onChange={(e) => handleInputChange('steelBasePrice', e.target.value)} className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <Label>Incidental Charges (₹/mt)</Label>
                        <Input type="number" value={inputs.incidental} onChange={(e) => handleInputChange('incidental', e.target.value)} className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <Label>Scrap % (e.g. 0.04)</Label>
                        <Input type="number" step="0.001" value={inputs.scrapPct} onChange={(e) => handleInputChange('scrapPct', e.target.value)} className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <Label>Recovery % (e.g. -0.4)</Label>
                        <Input type="number" step="0.01" value={inputs.recoveryPct} onChange={(e) => handleInputChange('recoveryPct', e.target.value)} className="font-mono" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-bold text-lg border-b border-border/50 pb-2">Zinc / Galvanising</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Zinc Price (₹/mt)</Label>
                        <Input type="number" value={inputs.zincPrice} onChange={(e) => handleInputChange('zincPrice', e.target.value)} className="font-mono" />
                      </div>
                      <div className="space-y-2">
                        <Label>Micron Factor (e.g. 0.045)</Label>
                        <Input type="number" step="0.001" value={inputs.zincMicron} onChange={(e) => handleInputChange('zincMicron', e.target.value)} className="font-mono" />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="conversion" className="space-y-8 focus-visible:outline-none">
                  <div className="space-y-4">
                    <h3 className="font-bold text-lg border-b border-border/50 pb-2">Conversion Costs (₹/mt)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2"><Label>Fabrication Labor</Label><Input type="number" value={inputs.fabLabor} onChange={(e) => handleInputChange('fabLabor', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>Welding Consumables</Label><Input type="number" value={inputs.weldCons} onChange={(e) => handleInputChange('weldCons', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>Galvanising Charges</Label><Input type="number" value={inputs.galvFl} onChange={(e) => handleInputChange('galvFl', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>Packing & Strapping</Label><Input type="number" value={inputs.packStrn} onChange={(e) => handleInputChange('packStrn', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>Loading/Unloading</Label><Input type="number" value={inputs.loadUnload} onChange={(e) => handleInputChange('loadUnload', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>Handover Charges</Label><Input type="number" value={inputs.handover} onChange={(e) => handleInputChange('handover', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>Others</Label><Input type="number" value={inputs.others} onChange={(e) => handleInputChange('others', e.target.value)} className="font-mono" /></div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-bold text-lg border-b border-border/50 pb-2">Prototype</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2"><Label>Proto Cost (₹)</Label><Input type="number" value={inputs.protoCost} onChange={(e) => handleInputChange('protoCost', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>Proto %</Label><Input type="number" step="0.01" value={inputs.protoPct} onChange={(e) => handleInputChange('protoPct', e.target.value)} className="font-mono" /></div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="finance" className="space-y-8 focus-visible:outline-none">
                  <div className="space-y-4">
                    <h3 className="font-bold text-lg border-b border-border/50 pb-2">Finance Costs</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2"><Label>WIP Steel Rate %</Label><Input type="number" step="0.01" value={inputs.wipSteelRate} onChange={(e) => handleInputChange('wipSteelRate', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>WIP Steel Months</Label><Input type="number" step="0.1" value={inputs.wipSteelMonths} onChange={(e) => handleInputChange('wipSteelMonths', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>WIP Zinc Rate %</Label><Input type="number" step="0.01" value={inputs.wipZincRate} onChange={(e) => handleInputChange('wipZincRate', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>WIP Zinc Months</Label><Input type="number" step="0.1" value={inputs.wipZincMonths} onChange={(e) => handleInputChange('wipZincMonths', e.target.value)} className="font-mono" /></div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-bold text-lg border-b border-border/50 pb-2">Contingency (₹/mt)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2"><Label>Inspection & Ins.</Label><Input type="number" value={inputs.inspectIns} onChange={(e) => handleInputChange('inspectIns', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>Special Packing</Label><Input type="number" value={inputs.spPacking} onChange={(e) => handleInputChange('spPacking', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>Freight Out</Label><Input type="number" value={inputs.freightOut} onChange={(e) => handleInputChange('freightOut', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>Third Party Trans.</Label><Input type="number" value={inputs.thirdParty} onChange={(e) => handleInputChange('thirdParty', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>Agency Comm.</Label><Input type="number" value={inputs.agencyComm} onChange={(e) => handleInputChange('agencyComm', e.target.value)} className="font-mono" /></div>
                      <div className="space-y-2"><Label>BG Cost</Label><Input type="number" value={inputs.bgCost} onChange={(e) => handleInputChange('bgCost', e.target.value)} className="font-mono" /></div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="credit" className="space-y-8 focus-visible:outline-none">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <h3 className="font-bold text-lg">Credit Costs</h3>
                    </div>
                    
                    <div className="bg-muted/30 rounded-lg p-1 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/50">
                            <TableHead className="w-[150px]">Component</TableHead>
                            <TableHead>Rate %</TableHead>
                            <TableHead>Months</TableHead>
                            <TableHead>% of Contract</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[
                            { id: 'openPo', name: 'Open PO' },
                            { id: 'finalPayment', name: 'Final Payment' },
                            { id: 'emd', name: 'EMD' },
                            { id: 'lc', name: 'LC' },
                            { id: 'vfs', name: 'VFS' },
                            { id: 'abg', name: 'ABG' },
                            { id: 'pbg', name: 'PBG' },
                            { id: 'cpbg', name: 'CPBG' },
                            { id: 'advance', name: 'Advance' }
                          ].map(item => (
                            <TableRow key={item.id} className="border-border/50">
                              <TableCell className="font-medium text-xs sm:text-sm">{item.name}</TableCell>
                              <TableCell className="p-2"><Input type="number" step="0.01" className="h-8 font-mono text-sm bg-background" value={inputs[`${item.id}Rate`]} onChange={(e) => handleInputChange(`${item.id}Rate`, e.target.value)} /></TableCell>
                              <TableCell className="p-2"><Input type="number" step="0.1" className="h-8 font-mono text-sm bg-background" value={inputs[`${item.id}Months`]} onChange={(e) => handleInputChange(`${item.id}Months`, e.target.value)} /></TableCell>
                              <TableCell className="p-2"><Input type="number" step="0.01" className="h-8 font-mono text-sm bg-background" value={inputs[`${item.id}Pct`]} onChange={(e) => handleInputChange(`${item.id}Pct`, e.target.value)} /></TableCell>
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
                        {[0.03, 0.05, 0.08, 0.10].map(val => (
                          <Card 
                            key={val} 
                            className={`cursor-pointer transition-all border ${inputs.marginPct === val ? 'border-primary ring-1 ring-primary bg-primary/10' : 'border-border/50 hover:border-primary/50'}`}
                            onClick={() => handleInputChange('marginPct', val.toString())}
                          >
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                              <span className="text-3xl font-bold font-mono">{(val * 100).toFixed(0)}%</span>
                              <span className="text-xs text-muted-foreground mt-1">Margin</span>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-2 max-w-sm">
                      <Label>Custom Margin %</Label>
                      <Input type="number" step="0.01" value={inputs.marginPct} onChange={(e) => handleInputChange('marginPct', e.target.value)} className="font-mono" />
                    </div>

                    <div className="space-y-2">
                      <Label>Quote Notes</Label>
                      <Input value={inputs.notes} onChange={(e) => handleStringChange('notes', e.target.value)} placeholder="Internal notes about this quote calculation..." />
                    </div>

                    <Alert className="bg-primary/5 border-primary/20">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      <AlertTitle className="text-primary font-bold">Live Estimate</AlertTitle>
                      <AlertDescription className="text-sm font-mono mt-1">
                        Current projected price: {formatINR(costBreakdown.quotePrice)} / MT
                      </AlertDescription>
                    </Alert>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <div className="flex justify-between pt-4 px-4 sm:px-0">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => setStep(4)} className="font-bold">
                Review & Save Quote <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
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
                    <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{customers?.find(c => c.id.toString() === customerId)?.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Project Ref</span><span className="font-mono">{projectRef}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Structure</span><span className="font-medium">{structureType} {kvOption ? `(${kvOption})` : ''}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Revision</span><span className="font-mono text-primary font-bold">Rev {nextRevision}</span></div>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Cost Buildup (per MT)</h3>
                  <div className="bg-muted/30 rounded-lg p-1">
                    <Table>
                      <TableBody>
                        <TableRow className="border-border/50"><TableCell>RM Net Cost</TableCell><TableCell className="text-right font-mono">{formatINR(costBreakdown.rmNet)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Zinc Cost</TableCell><TableCell className="text-right font-mono">{formatINR(costBreakdown.zincCost)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Conversion Total</TableCell><TableCell className="text-right font-mono">{formatINR(costBreakdown.convTotal)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Prototype Cost</TableCell><TableCell className="text-right font-mono">{formatINR(costBreakdown.protoCostPerMt)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Finance Cost</TableCell><TableCell className="text-right font-mono">{formatINR(costBreakdown.financeCost)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Contingency</TableCell><TableCell className="text-right font-mono">{formatINR(costBreakdown.contingency)}</TableCell></TableRow>
                        <TableRow className="border-border/50"><TableCell>Credit Costs</TableCell><TableCell className="text-right font-mono">{formatINR(costBreakdown.creditTotal)}</TableCell></TableRow>
                        <TableRow className="border-border/50 bg-accent/5"><TableCell className="font-bold">Total Before Margin</TableCell><TableCell className="text-right font-mono font-bold text-accent">{formatINR(costBreakdown.totalBeforeMargin)}</TableCell></TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <div className="space-y-6 flex flex-col justify-start">
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-sm font-bold text-primary uppercase tracking-wider">Final Quote Price</CardTitle>
                    <CardDescription>Based on {(inputs.marginPct * 100).toFixed(1)}% margin</CardDescription>
                  </CardHeader>
                  <CardContent className="text-center pb-6">
                    <div className="text-5xl font-mono font-bold text-primary tracking-tighter">
                      {formatINR(costBreakdown.quotePrice)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-2 font-mono">per Metric Ton</div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      size="lg" 
                      className="w-full font-bold text-lg h-14" 
                      onClick={handleSaveQuote}
                      disabled={createQuote.isPending}
                    >
                      {createQuote.isPending ? "Saving..." : "Confirm & Save Quote"}
                    </Button>
                  </CardFooter>
                </Card>

                {inputs.notes && (
                  <Card className="border-border/50 bg-card/50">
                    <CardHeader className="py-3 px-4 border-b border-border/50">
                      <CardTitle className="text-sm font-bold">Notes</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      {inputs.notes}
                    </CardContent>
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
