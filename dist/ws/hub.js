"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addClientToConversation = addClientToConversation;
exports.removeClientFromConversation = removeClientFromConversation;
exports.broadcastToConversation = broadcastToConversation;
exports.getWsMetrics = getWsMetrics;
const ws_1 = require("ws");
let wsConnections = 0;
let wsMessagesOutbound = 0;
const conversationIdToClients = new Map();
function addClientToConversation(conversationId, ws) {
    let set = conversationIdToClients.get(conversationId);
    if (!set) {
        set = new Set();
        conversationIdToClients.set(conversationId, set);
    }
    set.add(ws);
    wsConnections += 1;
}
function removeClientFromConversation(conversationId, ws) {
    const set = conversationIdToClients.get(conversationId);
    if (!set)
        return;
    set.delete(ws);
    if (set.size === 0) {
        conversationIdToClients.delete(conversationId);
    }
    wsConnections = Math.max(0, wsConnections - 1);
}
function broadcastToConversation(conversationId, payload) {
    const set = conversationIdToClients.get(conversationId);
    if (!set)
        return;
    const data = JSON.stringify(payload);
    for (const client of set) {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            try {
                client.send(data);
                wsMessagesOutbound += 1;
            }
            catch {
                // ignore best-effort send
            }
        }
    }
}
function getWsMetrics() {
    return { wsConnections, wsMessagesOutbound };
}
//# sourceMappingURL=hub.js.map