import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { ShieldAlert } from "lucide-react";
import { RmRatioEditor } from "@/components/rm-ratio-editor";

export default function RmRatios() {
  const { data: user, isLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (user?.role !== "admin") {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <ShieldAlert className="h-9 w-9 text-destructive mx-auto" />
        <h1 className="text-xl font-bold tracking-tight">Admins only</h1>
        <p className="text-sm text-muted-foreground">
          The Raw Material Ratio Editor is restricted to administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Raw Material Ratios</h1>
        <p className="text-muted-foreground">
          Voltage-weighted RM price ratios per structure — admin only.
        </p>
      </div>
      <RmRatioEditor />
    </div>
  );
}
