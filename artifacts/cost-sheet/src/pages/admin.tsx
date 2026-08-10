import { Fragment, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUsers, useCreateUser, useUpdateUser, useDeleteUser, useResetUserPassword,
  useUnlockTwiceMonthly, useToggleDailyLock, useGetRmPricesHistory, useGetRmPrices,
  useGetUserActivity, useGetMe, useGetTemplateDefaults, useSaveTemplateDefaults,
  getGetRmPricesQueryKey, getListUsersQueryKey, getGetTemplateDefaultsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Unlock, Lock, Shield, Trash2, UserCog, FileText, ChevronDown, ChevronRight, UserPlus, KeyRound, Settings2, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MASTER_SPECS } from "@/lib/v6/engine";

// ---------- Template Defaults Constants ----------

const STRUCTURE_FAMILIES: { group: string; items: string[] }[] = [
  { group: "Transmission Line Towers (TLT)", items: ["TLT >800 mt", "TLT 401-800 mt", "TLT 151 - 400 mt "] },
  { group: "Sub-Station (Lattice)", items: ["Sub-Station (L) >800 mt ", "Sub-Station (L) 401- 800 mt", "Sub Station (L) - 151 - 400 mt "] },
  { group: "Outsourced TLT", items: ["out source < 150 mt "] },
  { group: "Poles", items: ["A  H-Pole", "RSJ Pole - Base Plate "] },
  { group: "Fasteners & Foundation Bolts", items: ["Fasteners", "Foundation Bolts"] },
  { group: "Railways", items: ["RLY-Mast", "RLY - Portal", "Rly - SPS", "Rly - Sp. Masts ", "RLY-Drop Tubes", "RLY-BFBRSJ"] },
  { group: "NTLT", items: ["NTLT-MS", "NTLT-Earthing"] },
  { group: "Rural", items: ["Rural (Welded & Clamps)", "Rural (Non-Welded)"] },
  { group: "Buyout", items: ["Buyout"] },
];

const CONVERSION_FIELDS = [
  { key: "fab_labor", label: "Fabrication — Labour (₹/MT)", isPct: false },
  { key: "weld_cons", label: "Welding & Consumables (₹/MT)", isPct: false },
  { key: "galv_fl", label: "Galvanising Fuel & Labour (₹/MT)", isPct: false },
  { key: "pack_strn", label: "Packing & Straightening (₹/MT)", isPct: false },
  { key: "load_unload", label: "Loading & Unloading (₹/MT)", isPct: false },
  { key: "handover", label: "Handing Over Charge (₹/MT)", isPct: false },
  { key: "others_conv", label: "Others Conversion (₹/MT)", isPct: false },
];

const MATERIAL_FIELDS = [
  { key: "recovery_pct", label: "Recovery % (e.g. -40)", isPct: true },
  { key: "scrap_pct", label: "Scrap % (e.g. 4)", isPct: true },
  { key: "zinc_micron", label: "Zinc Micron (e.g. 0.045)", isPct: false },
];

const PROTO_FIELDS = [
  { key: "proto_cost", label: "Proto Cost (₹/MT)", isPct: false },
  { key: "proto_pct", label: "Amortisation %", isPct: true },
];

const FINANCE_FIELDS = [
  { key: "wip_steel_rate", label: "WIP Steel Rate % (monthly)", isPct: true },
  { key: "wip_steel_months", label: "WIP Steel Months", isPct: false },
  { key: "wip_zinc_rate", label: "WIP Zinc Rate % (monthly)", isPct: true },
  { key: "wip_zinc_months", label: "WIP Zinc Months", isPct: false },
];

const CONTRACTUAL_FIELDS = [
  { key: "inspect_ins", label: "Inspection & Insurance (₹/MT)", isPct: false },
  { key: "sp_packing", label: "Special Packing (₹/MT)", isPct: false },
  { key: "freight_out", label: "Freight Outward (₹/MT)", isPct: false },
  { key: "third_party", label: "Third Party Testing (₹/MT)", isPct: false },
  { key: "agency_comm", label: "Agency Commission (₹/MT)", isPct: false },
  { key: "bg_cost", label: "BG Cost (₹/MT)", isPct: false },
];

const CREDIT_COMPONENTS = [
  { id: "open_p", name: "Open PO" },
  { id: "open_f", name: "Open Final" },
  { id: "emd", name: "EMD" },
  { id: "lc", name: "LC" },
  { id: "vfs", name: "VFS" },
  { id: "abg", name: "ABG" },
  { id: "pbg", name: "PBG" },
  { id: "cpbg", name: "CPBG" },
  { id: "adv", name: "Advance" },
];

const FIELD_GROUPS = [
  { id: "conversion", label: "Conversion", fields: CONVERSION_FIELDS },
  { id: "material", label: "Material & Zinc", fields: MATERIAL_FIELDS },
  { id: "proto", label: "Prototype", fields: PROTO_FIELDS },
  { id: "finance", label: "Finance (WIP)", fields: FINANCE_FIELDS },
  { id: "contractual", label: "Contractual", fields: CONTRACTUAL_FIELDS },
];

// All credit field keys for a given credit component
function creditFieldsFor(id: string) {
  return [
    { key: `${id}_rate`, label: "Rate % (monthly)", isPct: true },
    { key: `${id}_months`, label: "Months", isPct: false },
    { key: `${id}_pct`, label: "% of Contract", isPct: true },
  ];
}

// Read spec default for a given field key
function getSpecDefault(structureName: string, key: string): number | null {
  const spec = (MASTER_SPECS as Record<string, any>)[structureName];
  if (!spec) return null;
  const d = spec.defaults ?? {};
  // margins[idx] stored under margin_0..margin_3 in defaults
  if (key.startsWith("margin_")) {
    const idx = parseInt(key.replace("margin_", ""), 10);
    return d.margins?.[idx] ?? null;
  }
  const val = d[key];
  return typeof val === "number" ? val : null;
}

// Format a stored value for display in the editor
// isPct: stored as decimal (0.05 = 5%), displayed as whole (5)
function fmtForInput(val: number, isPct: boolean): string {
  if (!Number.isFinite(val)) return "";
  if (isPct) return String(Number((val * 100).toFixed(6)));
  return String(val);
}

function parseInput(raw: string, isPct: boolean): number | null {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return isPct ? n / 100 : n;
}

// ---------- Per-Structure Template Defaults Editor ----------

interface StructureDefaultsEditorProps {
  structureName: string;
  dbRows: { structureName: string; fieldKey: string; fieldValue: number; updatedByName: string; updatedAt: string }[];
  onSave: (structureName: string, fields: Record<string, number>) => Promise<void>;
  isSaving: boolean;
}

function StructureDefaultsEditor({ structureName, dbRows, onSave, isSaving }: StructureDefaultsEditorProps) {
  // Build initial form state: DB value if present, else spec default
  const buildInitialState = () => {
    const state: Record<string, string> = {};
    const allFields = [
      ...CONVERSION_FIELDS, ...MATERIAL_FIELDS, ...PROTO_FIELDS, ...FINANCE_FIELDS, ...CONTRACTUAL_FIELDS,
      ...CREDIT_COMPONENTS.flatMap((c) => creditFieldsFor(c.id)),
      ...[0, 1, 2, 3].map((i) => ({ key: `margin_${i}`, label: `Margin ${i + 1}`, isPct: true })),
    ];
    for (const f of allFields) {
      const dbRow = dbRows.find((r) => r.fieldKey === f.key);
      if (dbRow) {
        state[f.key] = fmtForInput(dbRow.fieldValue, f.isPct);
      } else {
        const specVal = getSpecDefault(structureName, f.key);
        state[f.key] = specVal !== null ? fmtForInput(specVal, f.isPct) : "";
      }
    }
    return state;
  };

  const [form, setForm] = useState<Record<string, string>>(buildInitialState);
  const [showConfirm, setShowConfirm] = useState(false);

  const dbRowsForThis = dbRows.filter((r) => r.structureName === structureName);
  const lastEdited = dbRowsForThis.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

  const handleChange = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const handleSaveClick = () => setShowConfirm(true);

  const handleConfirmSave = async () => {
    setShowConfirm(false);
    const allFields = [
      ...CONVERSION_FIELDS, ...MATERIAL_FIELDS, ...PROTO_FIELDS, ...FINANCE_FIELDS, ...CONTRACTUAL_FIELDS,
      ...CREDIT_COMPONENTS.flatMap((c) => creditFieldsFor(c.id)),
      ...[0, 1, 2, 3].map((i) => ({ key: `margin_${i}`, label: `Margin ${i + 1}`, isPct: true })),
    ];
    const fields: Record<string, number> = {};
    for (const f of allFields) {
      const raw = form[f.key];
      if (raw === undefined || raw === "") continue;
      const parsed = parseInput(raw, f.isPct);
      if (parsed !== null) fields[f.key] = parsed;
    }
    await onSave(structureName, fields);
  };

  const renderField = (key: string, label: string, isPct: boolean) => {
    const dbRow = dbRows.find((r) => r.fieldKey === key && r.structureName === structureName);
    const specVal = getSpecDefault(structureName, key);
    const isOverridden = !!dbRow;
    return (
      <div key={key} className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
          {label}
          {isOverridden && <span className="text-[10px] bg-primary/10 text-primary px-1 rounded font-mono">DB</span>}
        </label>
        <Input
          type="number"
          step={isPct ? "0.001" : "1"}
          value={form[key] ?? ""}
          onChange={(e) => handleChange(key, e.target.value)}
          placeholder={specVal !== null ? `spec: ${fmtForInput(specVal, isPct)}` : "—"}
          className="h-8 text-sm font-mono bg-background/60"
          data-testid={`input-tmpl-${structureName.replace(/\s+/g, "-")}-${key}`}
        />
      </div>
    );
  };

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="space-y-5 p-4">
        {FIELD_GROUPS.map((g) => (
          <div key={g.id} className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{g.label}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {g.fields.map((f) => renderField(f.key, f.label, f.isPct))}
            </div>
          </div>
        ))}

        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Credit Terms</h4>
          <div className="rounded-md border border-border/40 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-2 font-semibold text-muted-foreground w-24">Component</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground">Rate % (monthly)</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground">Months</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground">% of Contract</th>
                </tr>
              </thead>
              <tbody>
                {CREDIT_COMPONENTS.map((cc) => (
                  <tr key={cc.id} className="border-t border-border/30">
                    <td className="p-2 font-medium text-foreground">{cc.name}</td>
                    {creditFieldsFor(cc.id).map((f) => (
                      <td key={f.key} className="p-1.5">
                        <Input
                          type="number"
                          step="0.001"
                          value={form[f.key] ?? ""}
                          onChange={(e) => handleChange(f.key, e.target.value)}
                          placeholder="—"
                          className="h-7 text-xs font-mono bg-background/60 w-24"
                          data-testid={`input-tmpl-${structureName.replace(/\s+/g, "-")}-${f.key}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Margin Defaults</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => renderField(`margin_${i}`, `Margin ${i + 1} %`, true))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between bg-muted/20 border-t border-border/40 px-4 py-2.5">
        {lastEdited ? (
          <span className="text-xs text-muted-foreground font-mono">
            Last edited by {lastEdited.updatedByName} on {format(new Date(lastEdited.updatedAt), "dd MMM yyyy, HH:mm")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground italic">No overrides saved yet — using workbook defaults</span>
        )}
        <Button
          size="sm"
          onClick={handleSaveClick}
          disabled={isSaving}
          className="font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
          data-testid={`btn-save-tmpl-${structureName.replace(/\s+/g, "-")}`}
        >
          {isSaving ? "Saving…" : "Save Defaults"}
        </Button>
      </div>

      {/* Warning dialog before save */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Confirm Template Changes
            </DialogTitle>
            <DialogDescription className="pt-2">
              These values become the <strong>starting defaults</strong> for every new quote generated for{" "}
              <strong>{structureName.trim()}</strong> from this point forward. Existing saved quotes are not affected.
              <br /><br />
              Are you sure you want to save these template defaults?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={handleConfirmSave} className="font-bold" data-testid="btn-confirm-save-tmpl">
              Yes, Save Defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Main Admin Page ----------

export default function Admin() {
  const { data: users, isLoading: loadingUsers } = useListUsers();
  const { data: history, isLoading: loadingHistory } = useGetRmPricesHistory();
  const { data: activity, isLoading: loadingActivity } = useGetUserActivity();
  const { data: templateDefaults } = useGetTemplateDefaults();
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedStructure, setExpandedStructure] = useState<string | null>(null);
  const [expandedTmplFamily, setExpandedTmplFamily] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<'admin' | 'user'>("user");
  const { data: rmPrices } = useGetRmPrices();
  const { data: me } = useGetMe();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const resetPassword = useResetUserPassword();
  const unlockWindow = useUnlockTwiceMonthly();
  const toggleDailyLock = useToggleDailyLock();
  const saveTemplateDefaults = useSaveTemplateDefaults();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isWindowOpen = !!rmPrices?.isWindowUnlocked;
  const isOverrideOn = !!rmPrices?.isWindowOverride;
  const isScheduleOpen = isWindowOpen && !isOverrideOn;
  const isDailyLocked = !!rmPrices?.isDailyLocked;
  const isAdmin = me?.role === "admin";

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const handleAddUser = async () => {
    const name = newName.trim();
    const email = newEmail.trim().toLowerCase();
    if (!name || !email) {
      toast({ variant: "destructive", title: "Error", description: "Name and email are required" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ variant: "destructive", title: "Error", description: "Enter a valid email address" });
      return;
    }
    try {
      await createUser.mutateAsync({ data: { name, email, role: newRole } });
      await invalidateUsers();
      setNewName("");
      setNewEmail("");
      setNewRole("user");
      toast({ title: "User added", description: `${name} can now log in with the default password.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await updateUser.mutateAsync({ id, data: { isActive } });
      await invalidateUsers();
      toast({ title: "Updated", description: "User status updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleRoleChange = async (id: number, role: 'admin' | 'user') => {
    try {
      await updateUser.mutateAsync({ id, data: { role } });
      await invalidateUsers();
      toast({ title: "Updated", description: "User role updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await deleteUser.mutateAsync({ id });
      await invalidateUsers();
      toast({ title: "Deleted", description: "User deleted" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleResetPassword = async (id: number, name: string) => {
    const isSelf = me?.id === id;
    const message = isSelf
      ? "Reset YOUR OWN password to the default? You will be logged out immediately and must log back in with the default password, then set a new one."
      : `Reset ${name}'s password to the default? They will be logged out and must set a new password on next login.`;
    if (!confirm(message)) return;
    try {
      await resetPassword.mutateAsync({ id });
      await invalidateUsers();
      toast({ title: "Password reset", description: `${name} is back on the default password.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleToggleDailyLock = async () => {
    const nextLocked = !isDailyLocked;
    try {
      await toggleDailyLock.mutateAsync({ data: { locked: nextLocked } });
      await queryClient.invalidateQueries({ queryKey: getGetRmPricesQueryKey() });
      toast({
        title: nextLocked ? "Locked" : "Unlocked",
        description: nextLocked
          ? "RM file inputs are locked for today. They reopen automatically tomorrow."
          : "RM file inputs are unlocked.",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleToggleWindow = async () => {
    const nextUnlocked = !isOverrideOn;
    try {
      await unlockWindow.mutateAsync({ data: { unlocked: nextUnlocked } });
      await queryClient.invalidateQueries({ queryKey: getGetRmPricesQueryKey() });
      toast({
        title: nextUnlocked ? "Unlocked" : "Locked",
        description: nextUnlocked
          ? "Twice-monthly window unlocked for the rest of the day."
          : "Twice-monthly window locked.",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleSaveTemplateDefaults = async (structureName: string, fields: Record<string, number>) => {
    try {
      await saveTemplateDefaults.mutateAsync({
        structureName: encodeURIComponent(structureName),
        data: { fields },
      });
      await queryClient.invalidateQueries({ queryKey: getGetTemplateDefaultsQueryKey() });
      toast({ title: "Saved", description: `Template defaults for "${structureName.trim()}" updated. New quotes will pick up these values.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-muted-foreground">Manage users and system settings</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border/50">
          <CardHeader className="bg-card/50 border-b border-border/50">
            <div className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              <CardTitle>User Management</CardTitle>
            </div>
            <CardDescription>Control who has access to the suite and their roles.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 border-b border-border/50 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserPlus className="h-4 w-4 text-primary" />
                Add User
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto]">
                <Input
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-testid="input-new-user-name"
                />
                <Input
                  type="email"
                  placeholder="email@vijaytransmission.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  data-testid="input-new-user-email"
                />
                <Select value={newRole} onValueChange={(v: 'admin' | 'user') => setNewRole(v)}>
                  <SelectTrigger className="w-full sm:w-[110px]" data-testid="select-new-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent side="bottom">
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddUser}
                  disabled={createUser.isPending}
                  className="font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
                  data-testid="button-add-user"
                >
                  {createUser.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                New users log in with the default password and must change it on first login.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingUsers ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-4">Loading...</TableCell></TableRow>
                ) : users?.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="pl-4 font-medium">{u.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Select value={u.role} onValueChange={(v: 'admin' | 'user') => handleRoleChange(u.id, v)}>
                        <SelectTrigger className="w-[100px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent side="bottom">
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.isActive}
                        onCheckedChange={(v) => handleToggleActive(u.id, v)}
                      />
                    </TableCell>
                    <TableCell className="text-right pr-4 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleResetPassword(u.id, u.name)}
                        disabled={resetPassword.isPending}
                        className="text-muted-foreground hover:bg-accent/10 hover:text-accent"
                        title="Reset password to default"
                        data-testid={`button-reset-password-${u.id}`}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)} className="text-destructive hover:bg-destructive/10" data-testid={`button-delete-user-${u.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/50 border-t-4 border-t-accent">
            <CardHeader>
              <div className="flex items-center gap-2">
                {isDailyLocked ? (
                  <Lock className="h-5 w-5 text-accent" />
                ) : (
                  <Unlock className="h-5 w-5 text-accent" />
                )}
                <CardTitle>Daily RM Lock</CardTitle>
              </div>
              <CardDescription>
                {isDailyLocked
                  ? "RM file inputs are locked. They auto-lock daily at 2:00 PM; unlock to reopen them for the rest of today."
                  : "RM file inputs auto-lock daily at 2:00 PM. You can also lock them now."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleToggleDailyLock}
                disabled={toggleDailyLock.isPending}
                className={
                  isDailyLocked
                    ? "w-full font-bold bg-muted hover:bg-muted/80 text-foreground border border-border"
                    : "w-full font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
                }
              >
                {toggleDailyLock.isPending
                  ? isDailyLocked
                    ? "Unlocking..."
                    : "Locking..."
                  : isDailyLocked
                    ? "Unlock RM Inputs"
                    : "Lock RM Inputs Today"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/50 border-t-4 border-t-accent">
            <CardHeader>
              <div className="flex items-center gap-2">
                {isWindowOpen ? (
                  <Unlock className="h-5 w-5 text-accent" />
                ) : (
                  <Lock className="h-5 w-5 text-accent" />
                )}
                <CardTitle>Window Override</CardTitle>
              </div>
              <CardDescription>
                {isScheduleOpen
                  ? "The window is open by schedule today (1st/16th); no override needed."
                  : isOverrideOn
                    ? "The Twice-Monthly RM price window is currently open."
                    : "Manually open the Twice-Monthly RM price window."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleToggleWindow}
                disabled={unlockWindow.isPending || isScheduleOpen}
                className={
                  isOverrideOn
                    ? "w-full font-bold bg-muted hover:bg-muted/80 text-foreground border border-border"
                    : "w-full font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
                }
              >
                {unlockWindow.isPending
                  ? isOverrideOn
                    ? "Locking..."
                    : "Unlocking..."
                  : isScheduleOpen
                    ? "Open by Schedule"
                    : isOverrideOn
                      ? "Lock Window"
                      : "Unlock Window Today"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">System Info</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono">1.0.0</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Database</span>
                <span className="font-mono text-emerald-500">Connected</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Template Defaults — Admin only */}
      {isAdmin && (
        <Card className="border-border/50">
          <CardHeader className="bg-card/50 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              <CardTitle>Template Defaults (Fixed / Set-and-Forget)</CardTitle>
            </div>
            <CardDescription>
              Per-structure starting values for every new quote — the "purple-coded" fixed cells from the workbook.
              Changes take effect for new quotes only; existing saved quotes are never touched.
              Fields marked <span className="text-[11px] bg-primary/10 text-primary px-1 rounded font-mono">DB</span> have been saved previously; others show the embedded workbook default as a placeholder.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {STRUCTURE_FAMILIES.map((family) => {
              const isFamilyOpen = expandedTmplFamily === family.group;
              return (
                <div key={family.group} className="border-b border-border/50 last:border-b-0">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-card/60 transition-colors"
                    onClick={() => setExpandedTmplFamily(isFamilyOpen ? null : family.group)}
                    data-testid={`btn-tmpl-family-${family.group.replace(/\s+/g, "-")}`}
                  >
                    <span>{family.group}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-xs font-normal">{family.items.length} structure{family.items.length !== 1 ? "s" : ""}</span>
                      {isFamilyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </button>

                  {isFamilyOpen && (
                    <div className="bg-background/50 px-4 pb-4 space-y-3">
                      {family.items.map((sName) => {
                        const isStructOpen = expandedStructure === sName;
                        const dbCount = (templateDefaults ?? []).filter((r) => r.structureName === sName).length;
                        return (
                          <div key={sName} className="rounded-lg border border-border/40 overflow-hidden">
                            <button
                              type="button"
                              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium bg-card/50 hover:bg-card/80 transition-colors"
                              onClick={() => setExpandedStructure(isStructOpen ? null : sName)}
                              data-testid={`btn-tmpl-struct-${sName.trim().replace(/\s+/g, "-")}`}
                            >
                              <span>{sName.trim()}</span>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                {dbCount > 0 && (
                                  <Badge variant="outline" className="text-[10px] h-5 bg-primary/10 text-primary border-primary/20 font-mono">
                                    {dbCount} override{dbCount !== 1 ? "s" : ""}
                                  </Badge>
                                )}
                                {isStructOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </div>
                            </button>
                            {isStructOpen && (
                              <StructureDefaultsEditor
                                structureName={sName}
                                dbRows={(templateDefaults ?? []).map((r) => ({
                                  structureName: r.structureName,
                                  fieldKey: r.fieldKey,
                                  fieldValue: r.fieldValue,
                                  updatedByName: r.updatedByName,
                                  updatedAt: r.updatedAt,
                                }))}
                                onSave={handleSaveTemplateDefaults}
                                isSaving={saveTemplateDefaults.isPending}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardHeader className="bg-card/50 border-b border-border/50">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>User Quote Activity</CardTitle>
          </div>
          <CardDescription>Quotes generated by each user. Tap a user to see their quotes.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 w-8"></TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-right pr-4">Quotes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingActivity ? (
                <TableRow><TableCell colSpan={3} className="text-center py-4">Loading...</TableCell></TableRow>
              ) : !activity?.length ? (
                <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No quotes yet</TableCell></TableRow>
              ) : activity.map((a) => (
                <Fragment key={a.userName}>
                  <TableRow
                    className="cursor-pointer hover:bg-card/50"
                    onClick={() => setExpandedUser(expandedUser === a.userName ? null : a.userName)}
                    data-testid={`row-activity-${a.userName}`}
                  >
                    <TableCell className="pl-4">
                      {expandedUser === a.userName
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="font-medium">{a.userName}</TableCell>
                    <TableCell className="text-right pr-4 font-mono">{a.quoteCount}</TableCell>
                  </TableRow>
                  {expandedUser === a.userName && (
                    <TableRow key={`${a.userName}-detail`}>
                      <TableCell colSpan={3} className="p-0 bg-background/50">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="pl-8">Customer</TableHead>
                                <TableHead>Project</TableHead>
                                <TableHead>Structure</TableHead>
                                <TableHead>Rev</TableHead>
                                <TableHead className="pr-4">Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {a.quotes.map((q) => (
                                <TableRow key={q.id}>
                                  <TableCell className="pl-8 text-sm max-w-[220px] truncate">{q.customerName}</TableCell>
                                  <TableCell className="text-sm">{q.projectRef}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{q.structureType}</TableCell>
                                  <TableCell className="font-mono text-sm">Rev {q.revision}</TableCell>
                                  <TableCell className="pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                    {format(new Date(q.createdAt), 'dd MMM yyyy, HH:mm')}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="bg-card/50 border-b border-border/50">
          <CardTitle>RM Prices Audit Log</CardTitle>
          <CardDescription>History of all price updates.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>Updated By</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingHistory ? (
                <TableRow><TableCell colSpan={3} className="text-center py-4">Loading...</TableCell></TableRow>
              ) : history?.slice(0, 10).map((h: any) => (
                <TableRow key={h.id}>
                  <TableCell className="pl-4 font-mono text-sm">
                    {format(new Date(h.createdAt), 'dd MMM yyyy, HH:mm')}
                  </TableCell>
                  <TableCell>{h.createdByName}</TableCell>
                  <TableCell>
                    {h.isWindowUnlocked ? (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Unlocked Window</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-card">Standard</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
