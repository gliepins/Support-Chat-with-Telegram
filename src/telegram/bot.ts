import pino from 'pino';
import { getPrisma } from '../db/client';
import { addMessage, closeConversation, recordAudit } from '../services/conversationService';
import { getAgentNameByTgId } from '../services/agentService';
import { closeTopic, updateTopicTitleFromConversation, sendAgentMessage } from '../services/telegramApi';
import { broadcastToConversation } from '../ws/hub';
import { Prisma } from '@prisma/client';
import { setNickname } from '../services/conversationService';

const logger = pino({ transport: { target: 'pino-pretty' } });

type TgUpdate = {
  update_id: number;
  message?: any;
  edited_message?: any;
  channel_post?: any;
  callback_query?: any;
};

export async function handleTelegramUpdate(update: TgUpdate) {
  const prisma = getPrisma();
  const msg = update.message;
  if (!msg || !msg.chat || !msg.message_thread_id) {
    return; // ignore non-topic messages
  }
  if (msg.from?.is_bot) {
    return; // ignore bot's own messages
  }
  const chatId = msg.chat.id as number;
  const threadId = msg.message_thread_id as number;

  const supportGroupIdEnv = process.env.SUPPORT_GROUP_ID;
  if (!supportGroupIdEnv || chatId.toString() !== supportGroupIdEnv) {
    return; // ignore other chats
  }

  // Find conversation by threadId
  const conversation = await prisma.conversation.findFirst({ where: { threadId } });
  if (!conversation) {
    logger.warn({ threadId }, 'no conversation found for thread');
    return;
  }

  const text: string | undefined = msg.text || msg.caption;
  if (!text) return;

  // /myname or /whoami (reply with assigned agent display name)
  if (typeof text === 'string' && (/^\/myname\b/.test(text) || /^\/whoami\b/.test(text))) {
    const tgIdNum = msg.from?.id as number | undefined;
    if (!tgIdNum) return;
    let reply = '';
    try {
      const name = await getAgentNameByTgId(BigInt(tgIdNum));
      if (name) {
        reply = `Your agent name is: ${name}`;
      } else {
        reply = 'No agent name set. Ask an admin to assign one in Admin → Agents.';
      }
    } catch {
      reply = 'Could not look up your agent name right now.';
    }
    try { await sendAgentMessage(conversation.id, reply); } catch {}
    return;
  }

  // /note command (private note; not sent to customer)
  if (typeof text === 'string' && text.startsWith('/note')) {
    const note = text.replace(/^\/note\s*/, '').trim();
    await prisma.conversation.update({ where: { id: conversation.id }, data: { aboutNote: note || null } });
    await recordAudit(conversation.id, `telegram:${msg.from?.id ?? 'unknown'}`, 'set_note', { length: note.length });
    try { await updateTopicTitleFromConversation(conversation.id); } catch {}
    return;
  }

  // /claim (assign to current Telegram user)
  if (typeof text === 'string' && text.startsWith('/claim')) {
    const tgId = msg.from?.id as number | undefined;
    if (!tgId) return;
    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'OPEN_ASSIGNED', assignedAgentTgId: BigInt(tgId) } });
    await recordAudit(conversation.id, `telegram:${tgId}`, 'claim', {});
    try { await updateTopicTitleFromConversation(conversation.id); } catch {}
    try { await sendAgentMessage(conversation.id, `Claimed by @${msg.from?.username ?? tgId}`); } catch {}
    return;
  }

  // /close (close conversation and topic)
  if (typeof text === 'string' && text.startsWith('/close')) {
    const tgId = msg.from?.id as number | undefined;
    await closeConversation(conversation.id, `telegram:${tgId ?? 'unknown'}`);
    try { await closeTopic(conversation.id); } catch {}
    try { await sendAgentMessage(conversation.id, `Closed by @${msg.from?.username ?? tgId}`); } catch {}
    return;
  }

  const created = await addMessage(conversation.id, 'OUTBOUND', text);
  let agentName: string | null = null;
  if (msg.from?.id) {
    try { agentName = await getAgentNameByTgId(BigInt(msg.from.id)); } catch {}
  }
  broadcastToConversation(conversation.id, { direction: 'OUTBOUND', text: created.text, agent: agentName || (msg.from?.username ? '@'+msg.from.username : undefined) });
}


