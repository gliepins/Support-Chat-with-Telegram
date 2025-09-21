"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertAgent = upsertAgent;
exports.listAgents = listAgents;
exports.disableAgent = disableAgent;
exports.getAgentNameByTgId = getAgentNameByTgId;
exports.setAgentClosingMessage = setAgentClosingMessage;
exports.enableAgent = enableAgent;
exports.getClosingMessageForAgentLocale = getClosingMessageForAgentLocale;
const client_1 = require("../db/client");
async function upsertAgent(tgId, displayName) {
    const prisma = (0, client_1.getPrisma)();
    return prisma.agent.upsert({
        where: { tgId },
        update: { displayName, isActive: true },
        create: { tgId, displayName },
    });
}
async function listAgents() {
    const prisma = (0, client_1.getPrisma)();
    const list = await prisma.agent.findMany({ orderBy: { updatedAt: 'desc' } });
    return list.map(a => ({ ...a, tgId: a.tgId.toString() }));
}
async function disableAgent(tgId) {
    const prisma = (0, client_1.getPrisma)();
    return prisma.agent.update({ where: { tgId }, data: { isActive: false } });
}
async function getAgentNameByTgId(tgId) {
    const prisma = (0, client_1.getPrisma)();
    const a = await prisma.agent.findUnique({ where: { tgId } });
    return a?.isActive ? a.displayName : null;
}
async function setAgentClosingMessage(tgId, message) {
    const prisma = (0, client_1.getPrisma)();
    return prisma.agent.update({ where: { tgId }, data: { closingMessage: message } });
}
async function enableAgent(tgId) {
    const prisma = (0, client_1.getPrisma)();
    return prisma.agent.update({ where: { tgId }, data: { isActive: true } });
}
// Fetch agent closing message with locale fallback: exact -> 2-letter -> default -> legacy field
async function getClosingMessageForAgentLocale(tgId, locale) {
    const prisma = (0, client_1.getPrisma)();
    const loc = (locale && locale.trim()) ? locale.trim().toLowerCase() : '';
    const lc2 = loc ? loc.slice(0, 2) : '';
    try {
        let row = null;
        if (loc) {
            row = await prisma.agentClosingMessage.findFirst({ where: { tgId, locale: loc } });
            if (!row && lc2 && lc2 !== loc) {
                row = await prisma.agentClosingMessage.findFirst({ where: { tgId, locale: lc2 } });
            }
        }
        if (!row) {
            row = await prisma.agentClosingMessage.findFirst({ where: { tgId, locale: 'default' } });
        }
        if (row && row.message)
            return String(row.message);
    }
    catch { }
    try {
        const a = await prisma.agent.findUnique({ where: { tgId } });
        return a?.closingMessage || null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=agentService.js.map