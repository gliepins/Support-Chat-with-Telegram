type EmitContext = {
    agentName?: string | null;
    customerName?: string | null;
    codename?: string | null;
    locale?: string | null;
    [k: string]: unknown;
};
export declare function getTemplateOrDefault(key: string, locale?: string): Promise<{
    enabled: boolean;
    text: string;
    toCustomerWs: boolean;
    toCustomerPersist: boolean;
    toTelegram: boolean;
    pinInTopic: boolean;
    rateLimitPerConvSec?: number | null;
}>;
export declare function emitServiceMessage(conversationId: string, key: string, extraContext?: EmitContext): Promise<void>;
export declare function seedDefaultMessageTemplates(): Promise<void>;
export {};
//# sourceMappingURL=systemMessages.d.ts.map