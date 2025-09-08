import { Reducer } from "./Reducer";
import { createContext, useEffect, useReducer, useState } from "react";
import { AuthState, ContextType } from "@/types/types";
import { useStore } from "../store/useStore";
import { setAuthToken } from "../utils/Axios";
import { toast } from "react-hot-toast";

const initialState: AuthState = {
  user: null,
  loading: false,
  error: null,
};

export const UserContext = createContext<ContextType | null>(null);

export const ContextProvider = ({ children }) => {
  const [lang, setLang] = useState(
    JSON.parse(localStorage.getItem("lang")) || "en"
  );
  const [persist, setPersist] = useState(
    JSON.parse(localStorage.getItem("persist")) || false
  );
  const [state, dispatch] = useReducer(Reducer, initialState);
  const { connect, disconnect, setUser } = useStore();

  useEffect(() => {
    console.log("🏠 CONTEXT: User state changed:", state.user?.user?.id);

    // Set auth token for axios
    const accessToken = state.user?.accessToken;
    console.log(accessToken);
    setAuthToken(accessToken || null);

    if (state.user?.user) {
      // Convert id to string if needed
      const userWithStringId = {
        ...state.user.user,
        id: String(state.user.user.id),
      };
      setUser(userWithStringId);
    }
  }, [state.user?.user, setUser]);

  useEffect(() => {
    console.log(
      "🏠 CONTEXT: Checking if should connect socket...",
      !!state.user?.user
    );
    if (state.user?.user && state.user?.accessToken) {
      console.log(
        "🏠 CONTEXT: Connecting socket for user:",
        state.user.user.id
      );
      console.log(
        "🏠 CONTEXT: Access token available:",
        !!state.user.accessToken
      );

      // Use environment variable for socket URL, fallback to localhost for development
      const socketUrl =
        import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";
      console.log("🔌 CONTEXT: Connecting to socket URL:", socketUrl);

      // Small delay to avoid race where store not yet updated
      setTimeout(() => {
        connect(socketUrl, {
          accessToken: state.user!.accessToken,
        });
      }, 50);

      return () => {
        console.log("🏠 CONTEXT: Disconnecting socket");
        disconnect();
      };
    } else {
      console.log("🏠 CONTEXT: Not connecting - missing user or token:", {
        hasUser: !!state.user?.user,
        hasToken: !!state.user?.accessToken,
      });
    }
  }, [state.user?.user, state.user?.accessToken, connect, disconnect]);

  return (
    <UserContext.Provider
      value={{ state, dispatch, persist, setPersist, lang, setLang }}
    >
      {children}
    </UserContext.Provider>
  );
};
