import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ShieldCheck, Radar, Workflow } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Órigo Cyber — Central de comando Hermes" },
      {
        name: "description",
        content:
          "Painel de cyber segurança da Órigo: receba, triage e responda vulnerabilidades e incidentes detectados pelo agente Hermes.",
      },
      { property: "og:title", content: "Órigo Cyber — Central de comando Hermes" },
      {
        property: "og:description",
        content: "Vulnerabilidades, incidentes e controle total do agente Hermes.",
      },
    ],
  }),
  component: Landing,
});

const pillars = [
  {
    icon: Radar,
    title: "Ingestão contínua",
    text: "O Hermes envia achados e incidentes em tempo real via API assinada.",
  },
  {
    icon: ShieldCheck,
    title: "Resposta supervisionada",
    text: "Ações de alto impacto entram em fila de aprovação com trilha de auditoria.",
  },
  {
    icon: Workflow,
    title: "Controle do agente",
    text: "Inicie scans, ajuste políticas e pause o agente direto do painel.",
  },
];

function Landing() {
  const { session } = useAuth();

  return (
    <main className="grid-backdrop relative min-h-screen overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">
          <Activity className="size-4" /> Órigo Energia · Cyber Defense
        </div>
        <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-6xl">
          Central de comando <span className="text-primary text-glow">Hermes</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Todas as vulnerabilidades, incidentes e ações do agente Hermes em um único painel — com
          aprovação humana, políticas configuráveis e auditoria completa.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            to={session ? "/dashboard" : "/auth"}
            className="glow-primary inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            {session ? "Abrir painel" : "Entrar no painel"}
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary"
          >
            Criar acesso
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {pillars.map((pillar) => (
            <div key={pillar.title} className="panel rounded-lg p-5">
              <pillar.icon className="size-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">{pillar.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{pillar.text}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
