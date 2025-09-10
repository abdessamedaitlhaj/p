import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import { useUsers } from "../../store/useUsers";
import { queryClient } from "@/App";
import { M } from "vite/dist/node/moduleRunnerTransport.d-DJ_mE5sf";
import { Ban, Search } from "lucide-react";
import moment from "moment";
import { User } from "@/types/types";

export const ChatLeftSidebar = () => {
  const { data, isLoading } = useUsers();
  const setSelectedUser = useStore((state) => state.setSelectedUser);
  const {
    user,
    users,
    updateUser,
    setUsers,
    setOnlineUsers,
    socket,
    onlineUsers,
    unreadCounts,
    conversationOrder,
    lockedUsers,
  } = useStore();

  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (data && user?.id) {
      const filteredUsers = data?.filter(
        (u) => String(u.id) !== String(user.id)
      );
      setUsers(filteredUsers);
    }
  }, [data, user?.id, setUsers]);

  const orderMap = new Map();
  conversationOrder.forEach((id, index) => {
    orderMap.set(id, index);
  });

  const sortedUsers = users.sort((a, b) => {
    const indexA = orderMap.get(String(a.id)) ?? Infinity;
    const indexB = orderMap.get(String(b.id)) ?? Infinity;

    return indexA - indexB;
  });

  const formatTimeDifference = (timestamp) => {
    const messageDate = new Date(timestamp);
    const now = new Date(currentTime);
    const diffMs = now.getTime() - messageDate.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 60) return "Now";

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 365) return `${diffDays}d`;

    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears}y`;
  };

  useEffect(() => {
    if (!socket) return;

    const handleUserStatusUpdate = (data) => {
      updateUser(data.userId, {
        status: data.status,
        last_seen: data.last_seen,
      });
    };

    socket.on("user_status_updated", handleUserStatusUpdate);

    return () => {
      socket.off("user_status_updated", handleUserStatusUpdate);
    };
  }, [socket, updateUser, setOnlineUsers]);

  return (
    <div className="flex flex-col w-full md:w-1/4">
      <div className="bg-gray_2 rounded-lg">
        <div className="relative flex w-full items-center p-2">
          <Search className="absolute left-2 text-white h-5 w-5" />
          <input
            type="text"
            placeholder="search"
            className="placeholder-white w-full pl-8 pr-2 py-1 text-sm focus:outline-none bg-transparent"
          />
        </div>
      </div>

      <div className="bg-gray_3/80 p-4 mt-4 h-[200px] md:flex-1 rounded-2xl overflow-y-auto scrollbar-hidden">
        <div className="flex flex-col space-y-2">
          {isLoading ? <p>Loading...</p> : null}
          {sortedUsers?.map((user: User) => {
            const unreadCount = unreadCounts[user.id] || 0;
            return (
              <div
                className={`flex items-center p-3 rounded-2xl cursor-pointer transition-colors duration-200 hover:bg-gray_1`}
                key={user.id}
                onClick={() => setSelectedUser(user)}
              >
                <div className="relative flex-shrink-0">
                  <img
                    src={user?.avatarurl}
                    alt="Profile"
                    className="size-10 rounded-full"
                  />
                </div>

                <div className="flex-1 ml-3 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-medium text-sm truncate">
                      {user.username}
                    </h3>
                    <div className="flex flex-col gap-4 items-center space-x-2 flex-shrink-0">
                      <span className="text-white/70 text-xs">
                        {onlineUsers.includes(String(user.id))
                          ? "Online"
                          : formatTimeDifference(user.last_seen)}
                      </span>
                      {unreadCount > 0 ? (
                        <div
                          className={`size-6 bg-yellow_4 rounded-full flex items-center justify-center`}
                        >
                          <span
                            className={`text-black  ${
                              unreadCount > 99 ? "text-[8px]" : "text-[10px]"
                            } font-bold`}
                          >
                            {unreadCount > 99 ? "+99" : unreadCount}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* <div className="flex items-center p-3 rounded-2xl cursor-pointer transition-colors duration-200 hover:bg-gray_1/30">
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 bg-avatar_color rounded-full"></div>
            </div>

            <div className="flex-1 ml-3 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-medium text-sm truncate">
                  Nameeeeee
                </h3>
                <div className="flex flex-col gap-4 items-center space-x-2 flex-shrink-0">
                  <span className="text-white/70 text-xs">online</span>
                  <div className="w-5 h-5 bg-yellow_3 rounded-full flex items-center justify-center">
                    <span className="text-black text-xs font-bold">4</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center p-3 rounded-2xl cursor-pointer transition-colors duration-200 hover:bg-gray_1/30">
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 bg-avatar_color rounded-full"></div>
            </div>

            <div className="flex-1 ml-3 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-medium text-sm truncate">
                  Nameeeeee
                </h3>
                <div className="flex flex-col gap-4 items-center justify-center space-x-2 flex-shrink-0">
                  <span className="text-white/70 text-xs">1y</span>
                  <Ban color="red" />
                </div>
              </div>
            </div>
          </div> */}
        </div>
      </div>
    </div>
  );
};
