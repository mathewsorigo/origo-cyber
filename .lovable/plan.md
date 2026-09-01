# Painel de Cyber Segurança Órigo — Hermes Command Center

Central de comando para receber, triar e responder a tudo que o agente Hermes encontra, com controle bidirecional do agente.

## Visual

Tema escuro "command center" com a paleta da Órigo Energia (verde/lima energético + azul profundo), grafite e vidro fosco. Tipografia técnica (títulos condensados + mono para IDs/hashes), linhas de grade sutis, indicadores de severidade em neon, gráficos de série temporal. Nada de gradiente roxo genérico.

## Backend (Lovable Cloud)

Ativar Lovable Cloud para banco, login e funções de servidor.

Tabelas principais:
- `profiles` — nome, e-mail, avatar (criado por trigger no signup)
- `user_roles` (tabela separada + enum `app_role`: admin, analyst, viewer) com função `has_role()` security definer
- `assets` — ativos monitorados (host, domínio, repo, cloud), criticidade, tags, owner
- `vulnerabilities` — asset, título, descrição, severidade (critical/high/medium/low/info), CVE, CVSS, evidência (jsonb), status (new/triaging/confirmed/false_positive/mitigating/resolved/risk_accepted), atribuído a, SLA/prazo, timestamps
- `incidents` — severidade, categoria, status (open/contained/eradicated/recovered/closed), ativos afetados, timeline
- `response_actions` — ação proposta pelo Hermes (isolar host, bloquear IP, revogar acesso, aplicar patch), risco, payload, status (pending_approval/approved/rejected/executing/succeeded/failed), aprovador, motivo
- `scans` — alvo, tipo, status (queued/running/completed/failed), progresso, achados, iniciado por
- `hermes_commands` — fila de comandos para o agente (start_scan, stop_scan, execute_action, update_policy, ping) com status e resultado
- `hermes_policies` — modo (autônomo/supervisionado), severidade mínima para agir, janelas de manutenção, agendamentos, ações auto-aprovadas
- `agent_status` — último heartbeat, versão, saúde, fila
- `audit_log` — quem fez o quê, quando (imutável)
- `hermes_api_keys` — chaves hash para autenticar o agente

Todas com RLS: leitura para autenticados, escrita/aprovação restrita por `has_role` (admin controla Hermes e aprova; analista tria e comenta; viewer só lê).

## Integração bidirecional com o Hermes

Endpoints públicos (autenticados por chave do agente via header + HMAC), sob `/api/public/hermes/*`:
- `POST /findings` — Hermes envia vulnerabilidades (ingestão idempotente por fingerprint)
- `POST /incidents` — abre/atualiza incidentes
- `POST /heartbeat` — status, versão, capacidade
- `POST /scan-events` — progresso e resultado de scans
- `GET /commands` — o agente busca comandos pendentes (long-poll simples)
- `POST /commands/:id/result` — devolve o resultado da execução

Saída para a API do Hermes: server functions autenticadas que, quando `HERMES_API_URL` + `HERMES_API_TOKEN` estiverem configurados, disparam a ação direto na API do agente; caso contrário, o comando fica na fila para o agente puxar. Assim o painel funciona nas duas direções sem quebrar.

Segredos necessários: `HERMES_INGEST_SECRET` (compartilhado com o agente), `HERMES_API_URL`, `HERMES_API_TOKEN` — pedidos após o backend estar pronto.

## Telas

1. **Login/Signup** (`/auth`) com pápeis; primeiro usuário vira admin.
2. **Overview** — postura de risco, contadores por severidade, SLA em risco, incidentes abertos, saúde do Hermes, feed ao vivo, gráfico de achados no tempo.
3. **Vulnerabilidades** — tabela com filtros (severidade, status, ativo, CVE, período), busca, ações em massa, painel de detalhe com evidência, histórico e mudança de status.
4. **Incidentes** — kanban por fase + detalhe com timeline, ativos afetados, ações tomadas e notas.
5. **Fila de aprovação** — ações propostas pelo Hermes com risco, diff/payload, aprovar/rejeitar (admin) e justificativa obrigatória.
6. **Scans** — iniciar/parar scan por alvo, agendamentos, histórico com progresso ao vivo.
7. **Ativos** — CRUD de hosts/domínios/repos, criticidade, dono, achados vinculados.
8. **Hermes Control** — status do agente, modo autônomo vs supervisionado, severidade mínima para agir, ações auto-aprovadas, janelas de manutenção, ping/pausar agente, chaves de API do agente.
9. **Auditoria** — log filtrável de todas as decisões humanas e do agente.
10. **Usuários & papéis** — admin gerencia papéis.

Dados de demonstração realistas via migração para o painel já nascer útil.

## Detalhes técnicos

- TanStack Start; rotas protegidas sob `src/routes/_authenticated/`; `/auth` público.
- Leituras via `createServerFn` + `requireSupabaseAuth`, cache com TanStack Query; realtime do Supabase para feed, scans e fila de aprovação.
- Ingestão do agente em server routes sob `src/routes/api/public/hermes/*` com verificação HMAC antes de qualquer escrita (service role só depois de verificado).
- Toda mutação sensível grava em `audit_log`.
- Recharts para gráficos; shadcn + sonner para UI e notificações.

## Ordem de execução

1. Cloud + schema, RLS, papéis, seed
2. Auth + layout/shell do painel + design system
3. Overview, Vulnerabilidades, Incidentes
4. Fila de aprovação, Scans, Ativos
5. Hermes Control + endpoints de ingestão/comandos + segredos
6. Auditoria, usuários, realtime e polimento
