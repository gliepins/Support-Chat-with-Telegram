import { WebSocket } from 'ws';
export declare function addClientToConversation(conversationId: string, ws: WebSocket): void;
export declare function removeClientFromConversation(conversationId: string, ws: WebSocket): void;
export declare function broadcastToConversation(conversationId: string, payload: unknown): void;
export declare function getWsMetrics(): {
    wsConnections: number;
    wsMessagesOutbound: number;
};
//# sourceMappingURL=hub.d.ts.map