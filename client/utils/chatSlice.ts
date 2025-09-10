import { StateCreator } from "zustand";
import { User } from "./userSlice";
import api from "../../utils/axios";

export interface Message {
  sender_id: string;
  sender_avatarurl?: string;
  receiver_id: string;
  content: string;
  timestamp: string;
}

export interface ChatSlice {
  messages: Message[];
  unreadCounts: Record<string, number>;
  conversationOrder: string[];
  selectedUser: User | null;
  setMessages: (messages: Message[]) => void;
  addMessage: (msg: Message, currentUserId?: string) => void;
  incrementUnreadCount: (userId: string) => void;
  resetUnreadCount: (userId: string) => void;
  updateConversationOrder: (userId: string) => void;
  setSelectedUser: (u: User) => void;
  loadConversation: (
    otherUserId: string,
    accessToken?: string
  ) => Promise<void>;
}

export const createChatSlice: StateCreator<ChatSlice, [], [], ChatSlice> = (
  set,
  get
) => ({
  messages: [],
  unreadCounts: {},
  conversationOrder: [],
  selectedUser: null,
  setMessages: (messages) => set({ messages }),
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
    set((s) => ({ messages: [...s.messages, message] }));
  },
  setSelectedUser: (user) => {
    if (user) get().resetUnreadCount(user.id);
    set({ selectedUser: user });
  },
  loadConversation: async (otherUserId: string, accessToken?: string) => {
    const state = get();
    const currentUserId = (state as any).user?.id;
    if (!currentUserId) {
      console.log("No current user ID found");
      return;
    }

    try {
      console.log(
        `Loading conversation between ${currentUserId} and ${otherUserId}`
      );
      console.log("Access token provided:", !!accessToken);

      // Add authorization header manually
      const headers: any = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const res = await api.get(
        `/messages/conversation/${currentUserId}/${otherUserId}`,
        {
          headers,
        }
      );

      console.log("API response:", res.data);
      const messages = res.data.messages || [];
      console.log("Setting messages:", messages);
      state.setMessages(messages);
    } catch (error) {
      console.error("Failed to load conversation:", error);
      if (error.response?.status === 401) {
        console.error("Authentication failed - token may be expired");
      }
    }
  },
});
