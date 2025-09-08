import { useEffect } from "react";
import { useStore } from "../../store/useStore";
import { useUsers } from "../../store/useUsers";
import { queryClient } from "@/App";
import { M } from "vite/dist/node/moduleRunnerTransport.d-DJ_mE5sf";

interface User {
  id: string;
  username: string;
  email: string;
  avatarurl?: string;
  status: string;
  last_seen?: string | null;
  createdAt: string;
}

export const ChatSidebar = () => {
  const { data, isLoading } = useUsers();
  const setSelectedUser = useStore((state) => state.setSelectedUser);
  const { user, socket, onlineUsers, unreadCounts, conversationOrder, lockedUsers } =
    useStore() as any;

  const filtredUsers = data?.filter((u) => user?.id && String(u.id) !== String(user.id));

  return (
    <div className="flex flex-col overflow-y-auto scrollbar-hidden border border-gray-300 rounded-md w-full">
      {filtredUsers?.map((user: User) => {
        const unreadCount = filtredUsers[user.id] || 0;

        return (
          <div
            key={user.id}
            onClick={() => setSelectedUser(user)}
            className="relative flex items-center justify-between gap-4 p-4 hover:bg-gray-200 cursor-pointer"
          >
            <div className="flex gap-4">
              <div className="relative">
                <img
                  src={user?.avatarurl}
                  alt="Profile"
                  className="w-8 h-8 rounded-full"
                />
                <span
                  className={`absolute bottom-0 right-0 ring-2 ring-white w-2 h-2 rounded-full ${
                    lockedUsers?.[String(user.id)]?.inMatch
                      ? 'bg-red-500'
                      : onlineUsers.includes(String(user.id))
                        ? 'bg-green-500'
                        : 'bg-gray-400'
                  }`}
                />
                {/* Unread count badge */}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <div>
                <p
                  className={`text-xs ${
                    unreadCount > 0
                      ? "text-gray-900 font-semibold"
                      : "text-gray-700"
                  }`}
                >
                  {user.username}
                </p>
                <p className="text-[10px] text-gray-500 truncate">
                  Hi what is your op
                </p>
              </div>
            </div>
            <span className="text-[10px] text-gray-400">
              {!user.last_seen ? new Date().getHours() + " h" : null}
            </span>
          </div>
        );
      })}
    </div>
  );
};
