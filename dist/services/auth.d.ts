export declare function hashIp(ipAddress: string): string;
export declare function signConversationToken(conversationId: string, ipHash: string, ttlSeconds?: number): string;
export declare function verifyConversationToken(token: string, ipHash: string): {
    conversationId: string;
};
//# sourceMappingURL=auth.d.ts.map