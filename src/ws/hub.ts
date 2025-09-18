import { WebSocket } from 'ws';

const conversationIdToClients = new Map<string, Set<WebSocket>>();

export function addClientToConversation(conversationId: string, ws: WebSocket): void {
  let set = conversationIdToClients.get(conversationId);
  if (!set) {
    set = new Set<WebSocket>();
    conversationIdToClients.set(conversationId, set);
  }
  set.add(ws);
}

export function removeClientFromConversation(conversationId: string, ws: WebSocket): void {
  const set = conversationIdToClients.get(conversationId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) {
    conversationIdToClients.delete(conversationId);
  }
}

export function broadcastToConversation(conversationId: string, payload: unknown): void {
  const set = conversationIdToClients.get(conversationId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const client of set) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch {
        // ignore best-effort send
      }
    }
  }
}


