export declare function upsertAgent(tgId: bigint, displayName: string): Promise<{
    createdAt: Date;
    updatedAt: Date;
    tgId: bigint;
    displayName: string;
    isActive: boolean;
    closingMessage: string | null;
}>;
export declare function listAgents(): Promise<{
    tgId: string;
    createdAt: Date;
    updatedAt: Date;
    displayName: string;
    isActive: boolean;
    closingMessage: string | null;
}[]>;
export declare function disableAgent(tgId: bigint): Promise<{
    createdAt: Date;
    updatedAt: Date;
    tgId: bigint;
    displayName: string;
    isActive: boolean;
    closingMessage: string | null;
}>;
export declare function getAgentNameByTgId(tgId: bigint): Promise<string | null>;
export declare function setAgentClosingMessage(tgId: bigint, message: string): Promise<{
    createdAt: Date;
    updatedAt: Date;
    tgId: bigint;
    displayName: string;
    isActive: boolean;
    closingMessage: string | null;
}>;
export declare function enableAgent(tgId: bigint): Promise<{
    createdAt: Date;
    updatedAt: Date;
    tgId: bigint;
    displayName: string;
    isActive: boolean;
    closingMessage: string | null;
}>;
export declare function getClosingMessageForAgentLocale(tgId: bigint, locale?: string): Promise<string | null>;
//# sourceMappingURL=agentService.d.ts.map