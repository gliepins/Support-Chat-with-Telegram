import { WebSocket } from 'ws';

let wsConnections = 0;
let wsMessagesOutbound = 0;

const conversationIdToClients = new Map<string, Set<WebSocket>>();

export function addClientToConversation(conversationId: string, ws: WebSocket): void {
  let set = conversationIdToClients.get(conversationId);
  if (!set) {
    set = new Set<WebSocket>();
    conversationIdToClients.set(conversationId, set);
  }
  set.add(ws);
  wsConnections += 1;
}

export function removeClientFromConversation(conversationId: string, ws: WebSocket): void {
  const set = conversationIdToClients.get(conversationId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) {
    conversationIdToClients.delete(conversationId);
  }
  wsConnections = Math.max(0, wsConnections - 1);
}

export function broadcastToConversation(conversationId: string, payload: unknown): void {
  const set = conversationIdToClients.get(conversationId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const client of set) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
        wsMessagesOutbound += 1;
      } catch {
        // ignore best-effort send
      }
    }
  }
}
export function getWsMetrics() {
  return { wsConnections, wsMessagesOutbound };
}


