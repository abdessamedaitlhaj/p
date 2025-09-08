import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import { EllipsisVertical } from "lucide-react";
import { toast } from "react-hot-toast";

export const ChatAreaHeader = () => {
  const selectedUser = useStore((state) => state.selectedUser);
  const onlineUsers = useStore((state) => state.onlineUsers);
  const lockedUsers: any = useStore((state: any) => state.lockedUsers);
  const ensureJoined = useStore((state) => state.ensureJoined);
  const socket = useStore((state) => state.socket); // Use socket from store
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // useEffect(() => {
  //   function handleClickOutside(event: MouseEvent) {
  //     if (
  //       open &&
  //       menuRef.current &&
  //       !menuRef.current.contains(event.target as Node)
  //     ) {
  //       setOpen(false);
  //     }
  //   }
  //   document.addEventListener("mousedown", handleClickOutside);
  //   return () => document.removeEventListener("mousedown", handleClickOutside);
  // }, [open]);

  const gameInvite = () => {
    if (!selectedUser || !socket) return;

    // Ensure we're properly joined before sending invite
    ensureJoined();

    console.log("🎮 CLIENT: Sending invite to:", selectedUser);
    console.log("🎮 CLIENT: Socket connected:", socket?.connected);
    console.log("🎮 CLIENT: Socket ID:", socket?.id);
    socket.emit("send_invite", selectedUser);
    toast.success(`🎮 Invite sent to ${selectedUser.username}!`);
    setOpen(false); // Close the menu
  };

  return (
    <>
      <div ref={menuRef} className="flex justify-between items-center">
        <div className="relative flex gap-4 items-center">
          <img
            src={selectedUser?.avatarurl}
            alt="Profile"
            className="w-8 h-8 rounded-full"
          />
          <span
            className={`absolute bottom-1 left-6 ring-2 ring-white w-2 h-2 rounded-full ${
              lockedUsers?.[String(selectedUser?.id)]?.inMatch
                ? 'bg-red-500'
                : selectedUser && onlineUsers.includes(String(selectedUser.id))
                  ? 'bg-green-500'
                  : 'bg-gray-400'
            }`}
          />
          <div className="">
            <p className="text-md text-gray-700">{selectedUser?.username}</p>
            <p className={`text-xs ${lockedUsers?.[String(selectedUser?.id)]?.inMatch ? 'text-red-500' : 'text-gray-500'}`}>
              {lockedUsers?.[String(selectedUser?.id)]?.inMatch
                ? 'in game'
                : selectedUser && onlineUsers.includes(String(selectedUser.id))
                  ? 'online'
                  : 'offline'}
            </p>
          </div>
        </div>
        {/* <div>
          <UserPlus className="text-gray-400 size-5 cursor-pointer" />
        </div> */}
        <div>
          <button onClick={() => setOpen(!open)}>
            <EllipsisVertical className=" text-gray-400 size-5 cursor-pointer" />
          </button>
        </div>
      </div>
      {open && (
        <div className="relative">
          <div className="absolute right-0 shadow-mdflex justify-end">
            <div className="flex flex-col bg-gray-200 w-24 rounded-md">
              <button
                onClick={gameInvite}
                className="text-gray-500 text-sm cursor-pointer p-2 hover:bg-gray-300 hover:rounded-t-md"
              >
                Play
              </button>
              <button className="text-gray-500 text-sm cursor-pointer p-2 hover:bg-gray-300 hover:rounded-b-md">
                Block
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
