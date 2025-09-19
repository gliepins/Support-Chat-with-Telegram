import pino from 'pino';
import { getPrisma } from '../db/client';
import { addMessage, closeConversation, recordAudit } from '../services/conversationService';
import { getAgentNameByTgId } from '../services/agentService';
import { closeTopic, updateTopicTitleFromConversation, sendAgentMessage, sendGroupMessage } from '../services/telegramApi';
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
  if (!msg || !msg.chat) { return; }
  if (msg.from?.is_bot) {
    return; // ignore bot's own messages
  }
  const chatId = msg.chat.id as number;
  const threadId = msg.message_thread_id as number | undefined;

  const supportGroupIdEnv = process.env.SUPPORT_GROUP_ID;
  if (!supportGroupIdEnv || chatId.toString() !== supportGroupIdEnv) {
    return; // ignore other chats
  }

  // If in group root (no thread), handle only agent utility commands and exit
  if (!threadId) {
    const text: string | undefined = msg.text || msg.caption;
    if (!text) return;
    if (typeof text === 'string' && (/^\/myname\b/.test(text) || /^\/whoami\b/.test(text))) {
      const tgIdNum = msg.from?.id as number | undefined;
      if (!tgIdNum) return;
      try {
        const name = await getAgentNameByTgId(BigInt(tgIdNum));
        const reply = name ? `Your agent name is: ${name}` : 'No agent name set. Ask an admin to assign one in Admin → Agents.';
        await sendGroupMessage(reply);
      } catch {
        await sendGroupMessage('Could not look up your agent name right now.');
      }
    }
    if (typeof text === 'string' && /^\/myid\b/.test(text)) {
      const tgIdNum = msg.from?.id as number | undefined;
      if (!tgIdNum) return;
      try { await sendGroupMessage(`Your Telegram user id: ${tgIdNum}`); } catch {}
    }
    return;
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

  // /myid (reply with numeric Telegram user id)
  if (typeof text === 'string' && /^\/myid\b/.test(text)) {
    const tgIdNum = msg.from?.id as number | undefined;
    if (!tgIdNum) return;
    try { await sendAgentMessage(conversation.id, `Your Telegram user id: ${tgIdNum}`); } catch {}
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
    try { broadcastToConversation(conversation.id, { type: 'agent_joined', agent: msg.from?.username ? '@'+msg.from.username : String(tgId) }); } catch {}
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

  // Prevent sending to customer until conversation is claimed
  if (conversation.status === 'OPEN_UNCLAIMED') {
    try { await sendAgentMessage(conversation.id, 'Please /claim this conversation before replying.'); } catch {}
    return;
  }
  const created = await addMessage(conversation.id, 'OUTBOUND', text);
  let agentName: string | null = null;
  if (msg.from?.id) {
    try { agentName = await getAgentNameByTgId(BigInt(msg.from.id)); } catch {}
  }
  broadcastToConversation(conversation.id, { direction: 'OUTBOUND', text: created.text, agent: agentName || (msg.from?.username ? '@'+msg.from.username : undefined) });
}


