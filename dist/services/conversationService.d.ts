export declare function validateCustomerName(name: string): {
    ok: true;
} | {
    ok: false;
    reason: string;
};
export declare function createConversation(initialName?: string): Promise<{
    id: string;
    codename: string;
    customerName: string | null;
    aboutNote: string | null;
    threadId: number | null;
    status: import(".prisma/client").$Enums.ConversationStatus;
    assignedAgentTgId: bigint | null;
    lastCustomerAt: Date;
    lastAgentAt: Date;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare function setNickname(conversationId: string, name: string): Promise<{
    id: string;
    codename: string;
    customerName: string | null;
    aboutNote: string | null;
    threadId: number | null;
    status: import(".prisma/client").$Enums.ConversationStatus;
    assignedAgentTgId: bigint | null;
    lastCustomerAt: Date;
    lastAgentAt: Date;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare function listConversations(status?: string, q?: string): Promise<{
    assignedAgentTgId: string | null;
    id: string;
    codename: string;
    customerName: string | null;
    aboutNote: string | null;
    threadId: number | null;
    status: import(".prisma/client").$Enums.ConversationStatus;
    lastCustomerAt: Date;
    lastAgentAt: Date;
    createdAt: Date;
    updatedAt: Date;
}[]>;
export declare function getConversationWithMessages(conversationId: string): Promise<({
    messages: {
        id: string;
        createdAt: Date;
        conversationId: string;
        direction: import(".prisma/client").$Enums.MessageDirection;
        text: string;
    }[];
} & {
    id: string;
    codename: string;
    customerName: string | null;
    aboutNote: string | null;
    threadId: number | null;
    status: import(".prisma/client").$Enums.ConversationStatus;
    assignedAgentTgId: bigint | null;
    lastCustomerAt: Date;
    lastAgentAt: Date;
    createdAt: Date;
    updatedAt: Date;
}) | null>;
export declare function listMessagesForConversation(conversationId: string): Promise<{
    createdAt: Date;
    direction: import(".prisma/client").$Enums.MessageDirection;
    text: string;
}[]>;
export declare function getAssignedAgentName(conversationId: string): Promise<string | null>;
export declare function addMessage(conversationId: string, direction: 'INBOUND' | 'OUTBOUND', text: string): Promise<{
    id: string;
    createdAt: Date;
    conversationId: string;
    direction: import(".prisma/client").$Enums.MessageDirection;
    text: string;
}>;
export declare function closeConversation(conversationId: string, actor: string, opts?: {
    suppressCustomerNote?: boolean;
}): Promise<{
    id: string;
    codename: string;
    customerName: string | null;
    aboutNote: string | null;
    threadId: number | null;
    status: import(".prisma/client").$Enums.ConversationStatus;
    assignedAgentTgId: bigint | null;
    lastCustomerAt: Date;
    lastAgentAt: Date;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare function blockConversation(conversationId: string, actor: string): Promise<{
    id: string;
    codename: string;
    customerName: string | null;
    aboutNote: string | null;
    threadId: number | null;
    status: import(".prisma/client").$Enums.ConversationStatus;
    assignedAgentTgId: bigint | null;
    lastCustomerAt: Date;
    lastAgentAt: Date;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare function recordAudit(conversationId: string, actor: string, action: string, meta: unknown): Promise<void>;
//# sourceMappingURL=conversationService.d.ts.map