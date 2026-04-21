type SecurityAuditEvent = {
  event: string;
  actorUserId?: string;
  orgId?: string;
  route?: string;
  details?: Record<string, unknown>;
};

/** Log apenas no servidor; persistência em MongoDB usa `insertAuditEvent` em rotas/actions server-only. */
export function writeSecurityAudit(event: SecurityAuditEvent): void {
  console.info("[security-audit]", {
    at: new Date().toISOString(),
    ...event,
  });
}
