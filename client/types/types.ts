export type User = {
  id: number;
  username: string;
  email: string;
  alias: string;
  avatarurl?: string;
  status: string;
  inMatch: boolean;
  inTournament: boolean;
  last_seen?: string | null;
  refreshToken?: string;
  createdAt: string;
};

export type Message = {
  id: number;
  sender_id: number;
  sender_avatarurl?: string;
  receiver_id: number;
  content: string;
  timestamp: string;
  conversation_id: number;
};

export type UResponse = {
  msg: string;
  user: {
    id: number;
    username: string;
    email: string;
    avatarurl?: string | null;
    status: string;
    alias: string | null;
    createdAt: string;
  };
  accessToken: string;
};

export type AuthState = {
  user: UResponse | null;
  loading: boolean;
  error: string | null;
};

export type Action =
  | { type: "Start_Login" }
  | { type: "Success_Login"; payload: UResponse }
  | { type: "Failed_Login"; payload: string }
  | { type: "Persist_Login"; payload: UResponse }
  | { type: "Update_User_Alias"; payload: string | null };

export type ContextType = {
  state: AuthState;
  dispatch: React.Dispatch<Action>;
  persist: boolean;
  setPersist: React.Dispatch<React.SetStateAction<boolean>>;
  lang: string;
  setLang: React.Dispatch<React.SetStateAction<string>>;
};
