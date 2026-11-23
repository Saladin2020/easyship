export { get, post } from "./api.base";
import type { ShipConfig, ShipPlan } from "../../src/shared/types";
export type { ShipConfig, ShipPlan };
export interface Diag { path: string; message: string }
export interface Summary {
  root: string;
  games: Array<{ id: string; name: { th: string; en: string; ms?: string }; version: string; engine: string; source: string; targets: string[]; itch: string | null }>;
  errors: Diag[];
  warnings: Diag[];
  targets: string[];
}
export interface Result { target: string; status: string; artifact?: string; bytes?: number; sha256?: string; files?: number; checks: Array<{ ok: boolean; label: string }>; error?: string }
export interface Report { game: string; version: string; at: string; results: Result[]; butler: ShipPlan["upload"] }
