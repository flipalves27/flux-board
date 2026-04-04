/** Matriz 4×4 (dois eixos “nível” discretos): referência comum em priorização visual. */

export const MATRIX_GRID_SIZE = 4;

/** row 0 = topo (nível alto no eixo vertical), col 0 = esquerda (nível baixo no horizontal). */
export function matrixCellKey(row: number, col: number): string {
  return `cell_r${row}_c${col}`;
}

export function parseMatrixCellKey(key: string): { row: number; col: number } | null {
  const m = /^cell_r(\d)_c(\d)$/.exec(key);
  if (!m) return null;
  const row = Number(m[1]);
  const col = Number(m[2]);
  if (row < 0 || row > 3 || col < 0 || col > 3) return null;
  return { row, col };
}

/** Interpola diagonal inferior-esquerda (baixo/baixo) → superior-direita (alto/alto), estilo mercado. */
export function matrixCellColorHex(row: number, col: number): string {
  const t = Math.min(1, Math.max(0, ((3 - row) + col) / 6));
  const c0 = { r: 12, g: 31, b: 74 }; // azul escuro
  const c1 = { r: 13, g: 148, b: 136 }; // teal
  const c2 = { r: 99, g: 102, b: 241 }; // índigo
  let r: number;
  let g: number;
  let b: number;
  if (t <= 0.5) {
    const u = t * 2;
    r = Math.round(c0.r + (c1.r - c0.r) * u);
    g = Math.round(c0.g + (c1.g - c0.g) * u);
    b = Math.round(c0.b + (c1.b - c0.b) * u);
  } else {
    const u = (t - 0.5) * 2;
    r = Math.round(c1.r + (c2.r - c1.r) * u);
    g = Math.round(c1.g + (c2.g - c1.g) * u);
    b = Math.round(c1.b + (c2.b - c1.b) * u);
  }
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const VERTICAL_LABELS_PT = ["Alta", "Média-alta", "Média-baixa", "Baixa"] as const;
const HORIZONTAL_LABELS_PT = ["Baixa", "Média-baixa", "Média-alta", "Alta"] as const;

export function matrixCellLabelPt(row: number, col: number): string {
  const v = VERTICAL_LABELS_PT[row] ?? "?";
  const h = HORIZONTAL_LABELS_PT[col] ?? "?";
  return `${v} × ${h}`;
}

export type MatrixGridBucket = { key: string; label: string; color: string };

/** 16 colunas na ordem row-major (compatível com Kanban em scroll horizontal). */
export function priorityMatrixGrid4BucketOrder(): MatrixGridBucket[] {
  const out: MatrixGridBucket[] = [];
  for (let row = 0; row < MATRIX_GRID_SIZE; row++) {
    for (let col = 0; col < MATRIX_GRID_SIZE; col++) {
      const key = matrixCellKey(row, col);
      out.push({
        key,
        label: matrixCellLabelPt(row, col),
        color: matrixCellColorHex(row, col),
      });
    }
  }
  return out;
}
