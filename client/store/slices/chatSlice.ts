import { StateCreator } from "zustand";
import api from "@/utils/Axios";
import { User, Message } from "@/types/types";

export interface ChatSlice {
  users: User[];
  messages: Message[];
  conversation: Message[];
  unreadCounts: Record<string, number>;
  conversationOrder: string[];
  selectedUser: User | null;
  setUsers: (users: User[]) => void;
  updateUser: (userId: number, updates) => void;
  setMessages: (messages: Message[]) => void;
  setConversation: (messages: Message[]) => void;
  addMessage: (msg: Message, currentUserId?: string) => void;
  incrementUnreadCount: (userId: number) => void;
  resetUnreadCount: (userId: number) => void;
  updateConversationOrder: (userId: number) => void;
  setSelectedUser: (u: User) => void;
  loadConversation: (otherUserId: number) => Promise<void>;
}

export const createChatSlice: StateCreator<ChatSlice, [], [], ChatSlice> = (
  set,
  get
) => ({
  users: [],
  messages: [],
  conversation: [],
  unreadCounts: {},
  conversationOrder: [],
  selectedUser: null,
  setUsers: (users) => set({ users }),
  updateUser: (userId, updates) =>
    set((state) => ({
      users: state.users.map((user) =>
        String(user.id) === String(userId) ? { ...user, ...updates } : user
      ),
    })),
  setMessages: (messages) => set({ messages }),
  setConversation: (conversation) => set({ conversation }),
  updateConversationOrder: (userId) =>
    set((s) => ({
      conversationOrder: [
        String(userId),
        ...s.conversationOrder.filter((id) => id !== String(userId)),
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
    const selected = get().selectedUser;
    get().updateConversationOrder(selected.id);
    if (String(message.sender_id) !== String(selected?.id)) {
      get().incrementUnreadCount(message.sender_id);
    }
    set((s) => ({ conversation: [...s.conversation, message] }));
  },
  setSelectedUser: (user) => {
    if (user) get().resetUnreadCount(user.id);
    set({ selectedUser: user });
  },
  loadConversation: async (otherUserId) => {
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
