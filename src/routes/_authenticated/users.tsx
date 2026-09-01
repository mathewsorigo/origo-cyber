import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState, PageHeader, Panel, StatusPill } from "@/components/common";
import { formatDateTime } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

const roles = ["admin", "analyst", "viewer"] as const;
type AppRole = (typeof roles)[number];

const roleLabel: Record<AppRole, string> = {
  admin: "Administrador",
  analyst: "Analista",
  viewer: "Leitura",
};

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Usuários e papéis · Órigo Cyber Defense" },
      {
        name: "description",
        content:
          "Gestão de acessos do painel de cyber segurança da Órigo: administradores, analistas e perfis de leitura.",
      },
      { property: "og:title", content: "Usuários e papéis · Órigo Cyber Defense" },
      {
        property: "og:description",
        content: "Controle quem pode triar vulnerabilidades e aprovar ações do agente Hermes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  useRealtimeSync("users-live", ["user_roles", "profiles"], [["users-roles"], ["roles"]]);
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["users-roles"],
    queryFn: async () => {
      const [profiles, userRoles] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, created_at").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profiles.error) throw profiles.error;
      if (userRoles.error) throw userRoles.error;
      return { profiles: profiles.data ?? [], roles: userRoles.data ?? [] };
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (deleteError) throw deleteError;
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Papel atualizado");
      queryClient.invalidateQueries({ queryKey: ["users-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários e papéis"
        subtitle="Defina quem pode triar achados e aprovar ações de resposta do Hermes."
      />

      <Panel title="Equipe de segurança">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando usuários…</p>
        ) : !data || data.profiles.length === 0 ? (
          <EmptyState text="Nenhum usuário cadastrado." />
        ) : (
          <ul className="space-y-3">
            {data.profiles.map((p) => {
              const current = (data.roles.find((r) => r.user_id === p.id)?.role ??
                "viewer") as AppRole;
              return (
                <li key={p.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{p.full_name ?? p.email ?? p.id}</span>
                    <StatusPill
                      label={roleLabel[current]}
                      tone={current === "admin" ? "primary" : "muted"}
                    />
                    {p.id === user?.id && (
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">
                        você
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      desde {formatDateTime(p.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{p.email ?? "—"}</p>
                  {isAdmin && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {roles.map((r) => (
                        <Button
                          key={r}
                          size="sm"
                          variant={r === current ? "default" : "outline"}
                          disabled={r === current || setRole.isPending}
                          onClick={() => setRole.mutate({ userId: p.id, role: r })}
                        >
                          {roleLabel[r]}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!isAdmin && (
          <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Somente administradores podem alterar papéis.
          </p>
        )}
      </Panel>
    </div>
  );
}
