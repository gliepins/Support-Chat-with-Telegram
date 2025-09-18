export declare function ensureTopicForConversation(conversationId: string): Promise<number>;
export declare function sendAgentMessage(conversationId: string, text: string): Promise<void>;
export declare function updateTopicTitleFromConversation(conversationId: string): Promise<void>;
export declare function closeTopic(conversationId: string): Promise<void>;
export declare function sendTopicMessage(conversationId: string, text: string): Promise<{
    message_id: number;
}>;
export declare function pinTopicMessage(messageId: number): Promise<void>;
export declare function sendTopicControls(conversationId: string): Promise<void>;
export declare function answerCallback(callbackQueryId: string, text?: string): Promise<void>;
//# sourceMappingURL=telegramApi.d.ts.map