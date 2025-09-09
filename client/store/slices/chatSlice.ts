import { StateCreator } from "zustand";
import { User } from "./userSlice";
import api from "@/utils/Axios";

export interface Message {
  sender_id: string;
  receiver_id: string;
  text: string;
  timestamp: string;
}

export interface ChatSlice {
  messages: Message[];
  conversation: Message[];
  unreadCounts: Record<string, number>;
  conversationOrder: string[];
  selectedUser: User | null;
  setMessages: (messages: Message[]) => void;
  setConversation: (messages: Message[]) => void;
  addMessage: (msg: Message, currentUserId?: string) => void;
  incrementUnreadCount: (userId: string) => void;
  resetUnreadCount: (userId: string) => void;
  updateConversationOrder: (userId: string) => void;
  setSelectedUser: (u: User) => void;
  loadConversation: (otherUserId: string) => Promise<void>;
}

export const createChatSlice: StateCreator<ChatSlice, [], [], ChatSlice> = (
  set,
  get
) => ({
  messages: [],
  conversation: [],
  unreadCounts: {},
  conversationOrder: [],
  selectedUser: null,
  setMessages: (messages) => set({ messages }),
  setConversation: (conversation) => set({ conversation }),
  updateConversationOrder: (userId) =>
    set((s) => ({
      conversationOrder: [
        String(userId),
        ...s.conversationOrder.filter((id) => id !== userId),
      ],
    })),
  incrementUnreadCount: (userId) =>
    set((s) => ({
      unreadCounts: {
        ...s.unreadCounts,
        [userId]: (s.unreadCounts[userId] || 0) + 1,
      },
    })),
  resetUnreadCount: (userId) =>
    set((s) => ({ unreadCounts: { ...s.unreadCounts, [userId]: 0 } })),
  addMessage: (message, currentUserId) => {
    const otherUserId =
      String(message.sender_id) === String(currentUserId)
        ? message.receiver_id
        : message.sender_id;
    if (otherUserId) get().updateConversationOrder(otherUserId);
    const selected = get().selectedUser;
    if (String(message.sender_id) !== String(selected?.id))
      get().incrementUnreadCount(message.sender_id);
    set((s) => ({ conversation: [...s.conversation, message] }));
  },
  setSelectedUser: (user) => {
    if (user) get().resetUnreadCount(user.id);
    set({ selectedUser: user });
  },
  loadConversation: async (otherUserId: string) => {
    const state = get();
    const currentUserId = (state as any).user?.id;
    if (!currentUserId) return;
    try {
      const res = await api.get(
        `/messages/conversation/${currentUserId}/${otherUserId}`
      );
      if (!res) return;
      state.setConversation(res.data.messages || []);
    } catch {}
  },
});
