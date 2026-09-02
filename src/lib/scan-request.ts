type ScanAsset = {
  id: string;
  identifier: string | null;
};

export function authorizedScanTarget(asset: ScanAsset | null): string {
  if (!asset) throw new Error("Ativo cadastrado não encontrado.");
  const identifier = asset.identifier?.trim();
  if (!identifier) throw new Error("Ativo cadastrado sem identificador válido.");
  return identifier;
}
