import { BRANDING_ASSET_MAX_BYTES } from "@/lib/org-branding";

const ACCEPT = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];

export async function readImageFileAsDataUrl(file: File): Promise<string> {
  if (!ACCEPT.includes(file.type)) {
    throw new Error("Use PNG, SVG, JPEG ou WebP.");
  }
  if (file.size > BRANDING_ASSET_MAX_BYTES) {
    throw new Error("Arquivo excede 2MB.");
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    r.readAsDataURL(file);
  });
}
