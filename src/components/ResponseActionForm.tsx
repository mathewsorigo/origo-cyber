import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { runControlAction } from "@/lib/panel-control";
import {
  RESPONSE_ACTION_PLATFORMS,
  RESPONSE_ACTION_TYPES,
  type ResponseExecutionPlan,
} from "@/lib/response-action";
import type { Severity } from "@/lib/domain";

const actionLabels: Record<(typeof RESPONSE_ACTION_TYPES)[number], string> = {
  isolate_endpoint: "Isolar endpoint",
  release_endpoint: "Remover isolamento",
  block_ip: "Bloquear IP",
  unblock_ip: "Remover bloqueio de IP",
  quarantine_file: "Colocar arquivo em quarentena",
  restore_file: "Restaurar arquivo",
  deploy_patch: "Aplicar patch",
  revoke_sessions: "Revogar sessões",
  disable_account: "Desabilitar conta",
  enable_account: "Habilitar conta",
  collect_forensics: "Coletar evidências forenses",
  run_scan: "Executar scan de validação",
  manual_remediation: "Remediação manual assistida",
};

const platformLabels: Record<(typeof RESPONSE_ACTION_PLATFORMS)[number], string> = {
  bitdefender: "Bitdefender",
  compassone: "CompassOne",
  "microsoft-graph": "Microsoft Graph",
  azure: "Azure",
  intune: "Intune",
  defender: "Microsoft Defender",
  network: "Rede/Firewall",
  application: "Aplicação",
  manual: "Execução manual assistida",
};

type Props = {
  vulnerabilityId?: string;
  incidentId?: string;
  assetId?: string | null;
  defaultTarget?: string;
};

export function ResponseActionForm({
  vulnerabilityId,
  incidentId,
  assetId,
  defaultTarget = "",
}: Props) {
  const { canTriage } = useAuth();
  const queryClient = useQueryClient();
  const [actionType, setActionType] =
    useState<(typeof RESPONSE_ACTION_TYPES)[number]>("manual_remediation");
  const [platform, setPlatform] = useState<ResponseExecutionPlan["platform"]>("manual");
  const [risk, setRisk] = useState<Severity>("high");
  const [target, setTarget] = useState(defaultTarget);
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [execution, setExecution] = useState("");
  const [rollback, setRollback] = useState("");
  const [validation, setValidation] = useState("");

  useEffect(() => setTarget(defaultTarget), [defaultTarget]);

  const propose = useMutation({
    mutationFn: async () => {
      await runControlAction("response_action.create", {
        vulnerability_id: vulnerabilityId ?? null,
        incident_id: incidentId ?? null,
        asset_id: assetId ?? null,
        action_type: actionType,
        title,
        rationale,
        risk,
        plan: { platform, target, execution, rollback, validation },
      });
    },
    onSuccess: () => {
      toast.success("Ação proposta e enviada para aprovação");
      setTitle("");
      setRationale("");
      setExecution("");
      setRollback("");
      setValidation("");
      queryClient.invalidateQueries({ queryKey: ["response-actions"] });
      queryClient.invalidateQueries({ queryKey: ["pending-actions-count"] });
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canTriage) {
    return <p className="text-xs text-muted-foreground">Seu perfil não pode propor ações.</p>;
  }

  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-primary">
        Propor ação de resposta
      </summary>
      <div className="mt-3 space-y-2">
        <Select
          value={actionType}
          onValueChange={(value) => setActionType(value as typeof actionType)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESPONSE_ACTION_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {actionLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={platform} onValueChange={(value) => setPlatform(value as typeof platform)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESPONSE_ACTION_PLATFORMS.map((value) => (
                <SelectItem key={value} value={value}>
                  {platformLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={risk} onValueChange={(value) => setRisk(value as Severity)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["critical", "high", "medium", "low", "info"] as Severity[]).map((value) => (
                <SelectItem key={value} value={value}>
                  risco {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          placeholder="Título da ação"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Input
          placeholder="Alvo técnico estável"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
        <Textarea
          rows={2}
          placeholder="Evidência e justificativa"
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
        />
        <Textarea
          rows={2}
          placeholder="Procedimento de execução"
          value={execution}
          onChange={(event) => setExecution(event.target.value)}
        />
        <Textarea
          rows={2}
          placeholder="Rollback obrigatório"
          value={rollback}
          onChange={(event) => setRollback(event.target.value)}
        />
        <Textarea
          rows={2}
          placeholder="Como validar o resultado por leitura posterior"
          value={validation}
          onChange={(event) => setValidation(event.target.value)}
        />
        <Button className="w-full" disabled={propose.isPending} onClick={() => propose.mutate()}>
          Enviar para aprovação
        </Button>
      </div>
    </details>
  );
}
