import { create } from 'zustand';
import { createUserSlice, UserSlice } from './slices/userSlice';
import { createChatSlice, ChatSlice } from './slices/chatSlice';
import { createSocketSlice, SocketSlice } from './slices/socketSlice';
import { createGameEventsSlice, GameEventsSlice } from './slices/gameEventsSlice';
import { createActivitySlice, ActivitySlice } from './slices/activitySlice';

export type RootStore = UserSlice & ChatSlice & SocketSlice & GameEventsSlice & ActivitySlice;

export const useRootStore = create<RootStore>((set, get) => ({
  ...createUserSlice(set as any, get as any, undefined as any),
  ...createChatSlice(set as any, get as any, undefined as any),
  ...createSocketSlice(set as any, get as any, undefined as any),
  ...createGameEventsSlice(set as any, get as any, undefined as any),
  ...createActivitySlice(set as any, get as any, undefined as any),
}));

// Root store composed from modular slices.
