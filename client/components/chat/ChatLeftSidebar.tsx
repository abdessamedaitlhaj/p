import { useEffect } from "react";
import { useStore } from "../../store/useStore";
import { useUsers } from "../../store/useUsers";
import { queryClient } from "@/App";
import { M } from "vite/dist/node/moduleRunnerTransport.d-DJ_mE5sf";
import { Ban, Search } from "lucide-react";
import moment from "moment";
interface User {
  id: string;
  username: string;
  email: string;
  avatarurl?: string;
  status: string;
  last_seen?: string | null;
  createdAt: string;
}

export const ChatLeftSidebar = () => {
  const { data, isLoading } = useUsers();
  const setSelectedUser = useStore((state) => state.setSelectedUser);
  const {
    user,
    socket,
    onlineUsers,
    unreadCounts,
    conversationOrder,
    lockedUsers,
  } = useStore() as any;

  const filtredUsers = data?.filter(
    (u) => user?.id && String(u.id) !== String(user.id)
  );

  // console.log("FISRT usssser timstamp: ", filtredUsers[0].last_seen);

  const formatTimeDifference = (timestamp) => {
    const diffMs = Date.now() - parseInt(timestamp);
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 365) return `${diffDays}d`;

    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears}y`;
  };

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
          {filtredUsers?.map((user: User) => {
            const unreadCount = filtredUsers[user.id] || 0;
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
                      <div className="w-5 h-5 bg-yellow_3 rounded-full flex items-center justify-center">
                        <span className="text-black text-xs font-bold">4</span>
                      </div>
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

    // <div className="flex flex-col overflow-y-auto scrollbar-hidden border border-gray-300 rounded-md w-full">
    //   {filtredUsers?.map((user: User) => {
    //     const unreadCount = filtredUsers[user.id] || 0;

    //     return (
    //       <div
    //         key={user.id}
    //         onClick={() => setSelectedUser(user)}
    //         className="relative flex items-center justify-between gap-4 p-4 hover:bg-gray-200 cursor-pointer"
    //       >
    //         <div className="flex gap-4">
    //           <div className="relative">
    //             <img
    //               src={user?.avatarurl}
    //               alt="Profile"
    //               className="w-8 h-8 rounded-full"
    //             />
    //             <span
    //               className={`absolute bottom-0 right-0 ring-2 ring-white w-2 h-2 rounded-full ${
    //                 lockedUsers?.[String(user.id)]?.inMatch
    //                   ? 'bg-red-500'
    //                   : onlineUsers.includes(String(user.id))
    //                     ? 'bg-green-500'
    //                     : 'bg-gray-400'
    //               }`}
    //             />
    //             {/* Unread count badge */}
    //             {unreadCount > 0 && (
    //               <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
    //                 {unreadCount > 99 ? "99+" : unreadCount}
    //               </span>
    //             )}
    //           </div>
    //           <div>
    //             <p
    //               className={`text-xs ${
    //                 unreadCount > 0
    //                   ? "text-gray-900 font-semibold"
    //                   : "text-gray-700"
    //               }`}
    //             >
    //               {user.username}
    //             </p>
    //             <p className="text-[10px] text-gray-500 truncate">
    //               Hi what is your op
    //             </p>
    //           </div>
    //         </div>
    //         <span className="text-[10px] text-gray-400">
    //           {!user.last_seen ? new Date().getHours() + " h" : null}
    //         </span>
    //       </div>
    //     );
    //   })}
    // </div>
  );
};
