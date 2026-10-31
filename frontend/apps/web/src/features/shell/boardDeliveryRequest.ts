import type { BoardDeliveryRequest, BoardDeliveryDecisionRequest, BoardRunStart } from '@eap/runtime-client';
export type PendingDeliveryRequest = (BoardDeliveryRequest | (BoardRunStart & { decisionRequest: BoardDeliveryDecisionRequest })) & { rejectionCode?: string };
import { readRunRequest, writeRunRequest } from './boardRunRequest';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
// Reuse the Run request journal, with an identity isolated by project/task/Run and service mode.
const key = (taskId: string, runId: string) => 'delivery.' + JSON.stringify([taskId, runId]);
// Syntax only; the server independently checks inventory, excluded files and complete scope.
export function validDeliveryPaths(paths: unknown): paths is string[] {
  return Array.isArray(paths) && paths.length > 0 && paths.length <= 8 && new Set(paths).size === paths.length && paths.every(path => typeof path === 'string' && path.length <= 512 && /^frontend\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(vue|ts|tsx|js|jsx|mjs|cjs|css|html)$/.test(path));
}
export function readDeliveryRequest(store: Store | null, taskId: string, runId: string, projectId: string, mock: boolean): PendingDeliveryRequest | null {
  const request = readRunRequest(store, key(taskId, runId), projectId, mock) as PendingDeliveryRequest | null;
  if (!request || (request.rejectionCode !== undefined && request.rejectionCode !== 'BOARD_DELIVERY_REQUEST_CONFLICT')) return null;
  if ('decisionRequest' in request) {
    if ('paths' in request || 'note' in request) return null;
    const decision = request.decisionRequest;
    if (!decision || decision.projectId !== projectId || decision.requestId !== request.requestId || decision.revision !== request.revision || typeof decision.deliveryId !== 'string' || !decision.deliveryId.trim() || !['ACCEPT', 'REJECT'].includes(decision.decision) || typeof decision.criteriaConfirmed !== 'boolean' || typeof decision.previewConfirmed !== 'boolean' || typeof decision.comment !== 'string') return null;
  } else if (!validDeliveryPaths(request.paths) || typeof request.note !== 'string') return null;
  return request;
}
export function writeDeliveryRequest(store: Store | null, taskId: string, runId: string, mock: boolean, request: PendingDeliveryRequest | null): boolean {
  return writeRunRequest(store, key(taskId, runId), mock, request);
}
