/**
 * Shape estável para chips / `flow-signal` API (Onda 4).
 * Agrega métricas já calculadas no cliente; o endpoint pode evoluir para Redis.
 */
export type BoardFlowSignalPayload = {
  boardId: string;
  generatedAt: string;
  health: {
    score: number | null;
    wipColumns: number;
    wipCards: number;
  };
  cadence: {
    label: string;
    status: "ok" | "warn" | "unknown";
  };
  workload: {
    label: string;
    activeAssignees: number;
  };
};
