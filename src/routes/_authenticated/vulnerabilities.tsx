import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState, PageHeader, Panel, SeverityBadge } from "@/components/common";
import {
  formatDateTime,
  severityOrder,
  slaState,
  vulnStatusLabel,
  type Severity,
  type VulnStatus,
} from "@/lib/domain";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const statuses: VulnStatus[] = [
  "new",
  "triaging",
  "confirmed",
  "false_positive",
  "mitigating",
  "resolved",
  "risk_accepted",
];

export const Route = createFileRoute("/_authenticated/vulnerabilities")({
  head: () => ({
    meta: [
      { title: "Vulnerabilidades — Órigo Cyber" },
      {
        name: "description",
        content: "Triagem das vulnerabilidades detectadas pelo agente Hermes com SLA e severidade.",
      },
      { property: "og:title", content: "Vulnerabilidades — Órigo Cyber" },
      { property: "og:description", content: "Triagem de vulnerabilidades detectadas pelo Hermes." },
    ],
  }),
  component: VulnerabilitiesPage;
});

function VulnerabilitiesPage() {
  return null;
}
