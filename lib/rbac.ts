export type PlatformRole = "platform_admin" | "platform_user";

/** Papel canónico do utilizador na organização. */
export type OrgMembershipRole = "gestor" | "membro" | "convidado";

/** Valores legados persistidos antes do redesenho RBAC. */
export type LegacyOrgRole = "org_manager" | "org_member";

/** Inclui legado para leitura de JWT/DB durante a transição. */
export type OrgRole = OrgMembershipRole | LegacyOrgRole;

export type TeamRole = "team_manager" | "member" | "guest";

export function normalizeTeamRole(role: unknown): TeamRole {
  if (role === "team_admin" || role === "team_manager") return "team_manager";
  if (role === "member") return "member";
  if (role === "guest") return "guest";
  return "member";
}

/**
 * Normaliza papel na org a partir do valor persistido ou de flags legadas.
 * Ordem: valores canónicos/legados explícitos; senão isAdmin/isExecutive → gestor; senão membro.
 */
export function normalizeOrgMembershipRole(
  raw: string | undefined,
  fallback: { isAdmin?: boolean; isExecutive?: boolean }
): OrgMembershipRole {
  if (raw === "gestor" || raw === "membro" || raw === "convidado") return raw;
  if (raw === "org_manager") return "gestor";
  if (raw === "org_member") return "membro";
  if (fallback.isAdmin || fallback.isExecutive) return "gestor";
  return "membro";
}

export type EffectiveRoles = {
  platformRole: PlatformRole;
  /** Papel na org (sempre canónico: gestor | membro | convidado). */
  orgRole: OrgMembershipRole;
};

export function deriveEffectiveRoles(input: {
  id?: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole | string;
}): EffectiveRoles {
  const platformRole =
    input.platformRole ?? (input.id === "admin" ? "platform_admin" : "platform_user");
  const legacy = input.id === "admin" ? { isAdmin: false, isExecutive: false } : { isAdmin: input.isAdmin, isExecutive: input.isExecutive };
  const orgRole = normalizeOrgMembershipRole(
    typeof input.orgRole === "string" ? input.orgRole : undefined,
    legacy
  );
  return { platformRole, orgRole };
}

export function isPlatformAdmin(roles: EffectiveRoles): boolean {
  return roles.platformRole === "platform_admin";
}

/** Sinónimo de `isPlatformAdmin` (administrador do domínio). */
export function isDomainAdmin(roles: EffectiveRoles): boolean {
  return isPlatformAdmin(roles);
}

export function isOrgGestor(roles: EffectiveRoles): boolean {
  return roles.orgRole === "gestor";
}

export function isOrgConvidado(roles: EffectiveRoles): boolean {
  return roles.orgRole === "convidado";
}

/** Vê todos os boards da org (sem depender só de vínculos por board). */
export function seesAllBoardsInOrg(roles: EffectiveRoles): boolean {
  return isPlatformAdmin(roles) || isOrgGestor(roles);
}

/** Cliente ou servidor: mesmo critério do JWT após `deriveEffectiveRoles` (ex.: utilizador seed `admin`). */
export function isPlatformAdminSession(user: {
  id: string;
  platformRole?: PlatformRole;
  orgRole?: OrgRole | string;
}): boolean {
  return isPlatformAdmin(deriveEffectiveRoles(user));
}

export function canManageOrganization(roles: EffectiveRoles): boolean {
  return isPlatformAdmin(roles) || isOrgGestor(roles);
}

/**
 * Papéis org que o convidador pode atribuir num convite: estritamente abaixo do próprio nível na org.
 * - Gestor ou admin da plataforma: membro ou convidado.
 * - Membro (se autorizado a convidar no futuro): apenas convidado.
 */
export function assignableInviteOrgRoles(roles: EffectiveRoles): OrgMembershipRole[] {
  if (!canManageOrganization(roles)) return [];
  if (isPlatformAdmin(roles) || isOrgGestor(roles)) {
    return ["membro", "convidado"];
  }
  if (roles.orgRole === "membro") return ["convidado"];
  return [];
}

export function isAssignableInviteOrgRole(
  inviter: EffectiveRoles,
  role: OrgMembershipRole
): boolean {
  return assignableInviteOrgRoles(inviter).includes(role);
}

/**
 * Billing, convites org, diretório de utilizadores, Equipe, definições da org.
 * Unificado: não depende de `isOrgTeamManager` no cliente.
 */
export function sessionCanManageOrgBilling(user: {
  id?: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole | string;
}): boolean {
  return canManageOrganization(deriveEffectiveRoles(user));
}

/** Igual a `sessionCanManageOrgBilling` (gestor ou admin do domínio). */
export function sessionCanManageMembersAndBilling(user: {
  id?: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole | string;
}): boolean {
  return sessionCanManageOrgBilling(user);
}

/** Para gates de plano: distingue admin da plataforma (fora do Stripe) de gestor da org. */
export function isPlatformAdminFromAuthPayload(payload: {
  id: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole | string;
}): boolean {
  return isPlatformAdmin(deriveEffectiveRoles(payload));
}

/** Incluir `llmDebug`, `provider`/`model` técnicos, etc. nas respostas JSON de rotas de IA. */
export function includeLlmTelemetryInApiResponse(payload: {
  id: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole | string;
}): boolean {
  return isPlatformAdminFromAuthPayload(payload);
}

export function isOrgGestorOrPlatformAdminFromPayload(payload: {
  id?: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole | string;
}): boolean {
  return canManageOrganization(deriveEffectiveRoles(payload));
}

export function seesAllBoardsInOrgFromPayload(payload: {
  id?: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole | string;
}): boolean {
  return seesAllBoardsInOrg(deriveEffectiveRoles(payload));
}

/**
 * Papel canónico na org (persistência + Equipe legada).
 * `teamGestor`: vínculo ativo `team_manager` sem board em `kv-team-members`.
 */
export function resolveCanonicalOrgMembershipRole(
  user: {
    id: string;
    orgRole?: OrgRole | string;
    isAdmin?: boolean;
    isExecutive?: boolean;
  },
  teamGestor: boolean
): OrgMembershipRole {
  if (user.id === "admin") {
    return normalizeOrgMembershipRole(typeof user.orgRole === "string" ? user.orgRole : undefined, {
      isAdmin: false,
      isExecutive: false,
    });
  }
  const raw = user.orgRole;
  if (raw === "convidado") return "convidado";
  if (raw === "gestor" || raw === "org_manager") return "gestor";
  if (raw === "membro" || raw === "org_member") {
    if (user.isAdmin || user.isExecutive || teamGestor) return "gestor";
    return "membro";
  }
  let c = normalizeOrgMembershipRole(typeof raw === "string" ? raw : undefined, {
    isAdmin: user.isAdmin,
    isExecutive: user.isExecutive,
  });
  if (c === "membro" && teamGestor) c = "gestor";
  return c;
}
