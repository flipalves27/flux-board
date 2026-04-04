import "server-only";

import { insertAuditEvent } from "@/lib/audit-events";

/** Valor de `action` em `audit_events` quando um convite de organização é aceite. */
export const ORG_INVITE_ACCEPTED_AUDIT_ACTION = "org.invite_accepted";

/** Registo para gestores (auditoria Mongo) quando um convite é consumido. */
export async function auditOrganizationInviteAccepted(params: {
  orgId: string;
  joiningUserId: string;
  inviteCode: string;
  emailLower: string;
}): Promise<void> {
  await insertAuditEvent({
    action: ORG_INVITE_ACCEPTED_AUDIT_ACTION,
    resourceType: "organization",
    actorUserId: params.joiningUserId,
    resourceId: params.inviteCode,
    orgId: params.orgId,
    metadata: {
      invitedEmailLower: params.emailLower,
    },
  });
}
