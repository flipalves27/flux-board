export type BoardPortalBranding = {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  /** Título exibido no portal (opcional; default = nome do board). */
  title?: string;
};

export type BoardPortalSettings = {
  enabled: boolean;
  /** Token opaco na URL pública (não expor o ID interno do board). */
  token: string;
  passwordHash?: string;
  /**
   * Se não vazio, apenas estas colunas (bucket key) entram no portal.
   * Se vazio ou omitido, todas as colunas com cards publicados entram.
   */
  visibleBucketKeys?: string[];
  /**
   * Se não vazio, restringe aos IDs listados (interseção com filtro de coluna).
   */
  cardIdsAllowlist?: string[];
  branding?: BoardPortalBranding;
};
