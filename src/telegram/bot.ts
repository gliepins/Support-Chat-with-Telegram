import pino from 'pino';
import { getPrisma } from '../db/client';
import { addMessage, closeConversation, recordAudit, getAssignedAgentName } from '../services/conversationService';
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


function startsWithSlash(text: string): boolean {
  return text.trim().startsWith('/');
}

function isKnownCommandText(text: string): boolean {
  const first = (text.trim().split(/\s+/)[0] || '').toLowerCase();
  const [base = ''] = first.split('@');
  return ['/help','/claim','/close','/note','/codename','/myname','/whoami','/myid'].includes(base);
}

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
    const text: string = String(msg.text ?? msg.caption ?? '');
    if (text.length === 0) return;
    const safeText: string = text;
    if (/^\/help\b/.test(safeText)) {
      try { logger.info({ event: 'help_root_caught', text }); } catch {}
      const help = [
        'Commands:',
        '/claim — assign conversation to yourself (in topic)',
        '/close — close the conversation (in topic)',
        '/note <text> — set private note (in topic)',
        '/codename <text> — set codename (in topic)',
        '/myname or /whoami — your agent display name',
        '/myid — your Telegram id',
      ].join('\n');
      try { await sendGroupMessage(help); } catch {}
      return;
    }
    if ((/^\/myname\b/.test(safeText) || /^\/whoami\b/.test(safeText))) {
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
    if (/^\/myid\b/.test(safeText)) {
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

  const text: string = String(msg.text ?? msg.caption ?? '');
  if (text.length === 0) return;
  const safeText: string = text;
  // Log any slash messages for troubleshooting
  try {
    if (safeText.trim().startsWith('/')) {
      const base = (safeText.trim().split(/\s+/)[0] || '').toLowerCase();
      const baseNoBot = base.split('@')[0];
      logger.info({ event: 'slash_in_topic', raw: text, base, baseNoBot, threadId });
    }
  } catch {}
  // Robust base command extraction
  const baseCmd = (safeText.trim().split(/\s+/)[0] || '').toLowerCase().split('@')[0];
  if (baseCmd === '/help') {
    try { logger.info({ event: 'help_topic_caught', text, threadId }); } catch {}
    const help = [
      'Commands:',
      '/claim — assign conversation to yourself',
      '/close — close the conversation',
      '/note <text> — set private note',
      '/codename <text> — set codename',
      '/myname or /whoami — your agent display name',
      '/myid — your Telegram id',
    ].join('\n');
    try { await sendAgentMessage(conversation.id, help); } catch {}
    return;
  }
  // /codename (set conversation codename silently)
  if (safeText.startsWith('/codename')) {
    const rest = safeText.replace(/^\/codename\s*/, '').trim();
    if (rest.length < 2 || rest.length > 48) {
      try { await sendAgentMessage(conversation.id, 'Codename must be 2-48 characters.'); } catch {}
      return;
    }
    await prisma.conversation.update({ where: { id: conversation.id }, data: { codename: rest } });
    await recordAudit(conversation.id, `telegram:${msg.from?.id ?? 'unknown'}`, 'set_codename', { length: rest.length });
    try { await updateTopicTitleFromConversation(conversation.id); } catch {}
    try { await sendAgentMessage(conversation.id, `Codename updated.`); } catch {}
    return;
  }

  // /myname or /whoami (reply with assigned agent display name)
  if ((/^\/myname\b/.test(safeText) || /^\/whoami\b/.test(safeText))) {
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
  if (/^\/myid\b/.test(safeText)) {
    const tgIdNum = msg.from?.id as number | undefined;
    if (!tgIdNum) return;
    try { await sendAgentMessage(conversation.id, `Your Telegram user id: ${tgIdNum}`); } catch {}
    return;
  }

  // /note command (private note; not sent to customer)
  if (safeText.startsWith('/note')) {
    const note = safeText.replace(/^\/note\s*/, '').trim();
    await prisma.conversation.update({ where: { id: conversation.id }, data: { aboutNote: note || null } });
    await recordAudit(conversation.id, `telegram:${msg.from?.id ?? 'unknown'}`, 'set_note', { length: note.length });
    try { await updateTopicTitleFromConversation(conversation.id); } catch {}
    return;
  }

  // /claim (assign to current Telegram user)
  if (safeText.startsWith('/claim')) {
    const tgId = msg.from?.id as number | undefined;
    if (!tgId) return;
    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'OPEN_ASSIGNED', assignedAgentTgId: BigInt(tgId) } });
    await recordAudit(conversation.id, `telegram:${tgId}`, 'claim', {});
    try { await updateTopicTitleFromConversation(conversation.id); } catch {}
    try { await sendAgentMessage(conversation.id, `Claimed by @${msg.from?.username ?? tgId}`); } catch {}
    try {
      const label = await getAssignedAgentName(conversation.id);
      broadcastToConversation(conversation.id, { type: 'agent_joined', agent: label || 'Support' });
    } catch {}
    return;
  }

  // /close (close conversation and topic)
  if (safeText.startsWith('/close')) {
    const tgId = msg.from?.id as number | undefined;
    await closeConversation(conversation.id, `telegram:${tgId ?? 'unknown'}`, { suppressCustomerNote: true });
    try {
      const prisma = getPrisma();
      const agent = tgId ? await prisma.agent.findUnique({ where: { tgId: BigInt(tgId) } }) : null;
      const closing = agent?.closingMessage && agent.isActive ? agent.closingMessage : null;
      const closingText = closing || 'Conversation closed. You can write to reopen.';
      // First persist to customer transcript and broadcast
      const created = await addMessage(conversation.id, 'OUTBOUND', closingText);
      let label: string | null = null;
      try { label = await getAssignedAgentName(conversation.id); } catch {}
      broadcastToConversation(conversation.id, { direction: 'OUTBOUND', text: created.text, agent: label || (msg.from?.username ? '@'+msg.from.username : undefined) });
      // Notify closed state immediately to clients
      try { broadcastToConversation(conversation.id, { type: 'conversation_closed' }); } catch {}
      // Then post to Telegram topic
      try { await sendAgentMessage(conversation.id, closingText); } catch {}
    } catch {}
    try { await closeTopic(conversation.id); } catch {}
    return;
  }

  // Intercept any unknown slash command so it never reaches the customer
  if (startsWithSlash(safeText) && !isKnownCommandText(safeText)) {
    try { await sendAgentMessage(conversation.id, 'Unknown command. Send /help for available commands.'); } catch {}
    return;
  }

  // Prevent sending to customer until conversation is claimed
  if (conversation.status === 'OPEN_UNCLAIMED') {
    try { await sendAgentMessage(conversation.id, 'Please /claim this conversation before replying.'); } catch {}
    return;
  }
  if (conversation.status === 'CLOSED') {
    try { await sendAgentMessage(conversation.id, 'Conversation is closed. Send /claim to reopen or reply from customer will reopen.'); } catch {}
    return;
  }
  const created = await addMessage(conversation.id, 'OUTBOUND', safeText);
  let agentName: string | null = null;
  try {
    agentName = await getAssignedAgentName(conversation.id);
    if (!agentName && msg.from?.id) {
      agentName = await getAgentNameByTgId(BigInt(msg.from.id));
    }
  } catch {}
  broadcastToConversation(conversation.id, { direction: 'OUTBOUND', text: created.text, agent: agentName || (msg.from?.username ? '@'+msg.from.username : undefined) });
}


