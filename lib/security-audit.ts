type SecurityAuditEvent = {
  event: string;
  actorUserId?: string;
  orgId?: string;
  route?: string;
  details?: Record<string, unknown>;
};

export function writeSecurityAudit(event: SecurityAuditEvent): void {
  console.info("[security-audit]", {
    at: new Date().toISOString(),
    ...event,
  });
}
