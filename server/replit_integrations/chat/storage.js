import { db } from "../../db";
import { conversations, messages } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
export const chatStorage = {
  async getConversation(id) {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return conversation;
  },
  async getAllConversations() {
    return db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.createdAt));
  },
  async createConversation(title) {
    const [conversation] = await db
      .insert(conversations)
      .values({ title })
      .returning();
    return conversation;
  },
  async deleteConversation(id) {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  },
  async getMessagesByConversation(conversationId) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  },
  async createMessage(conversationId, role, content) {
    const [message] = await db
      .insert(messages)
      .values({ conversationId, role, content })
      .returning();
    return message;
  },
};
