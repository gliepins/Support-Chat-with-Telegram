type TgUpdate = {
    update_id: number;
    message?: any;
    edited_message?: any;
    channel_post?: any;
    callback_query?: any;
};
export declare function handleTelegramUpdate(update: TgUpdate): Promise<void>;
export {};
//# sourceMappingURL=bot.d.ts.map