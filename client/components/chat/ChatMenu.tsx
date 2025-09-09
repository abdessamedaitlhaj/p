import React, { useEffect, useRef, useState } from "react";
import { EllipsisVertical } from "lucide-react";
import { useStore } from "@/store/useStore";
import toast from "react-hot-toast";

export const ChatMenu = () => {
  const [isToggle, setToggle] = useState(false);
  const { selectedUser } = useStore();

  const onlineUsers = useStore((state) => state.onlineUsers);
  const lockedUsers: any = useStore((state: any) => state.lockedUsers);
  const ensureJoined = useStore((state) => state.ensureJoined);
  const socket = useStore((state) => state.socket); // Use socket from store
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isToggle &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setToggle(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isToggle]);

  const gameInvite = () => {
    if (!selectedUser || !socket) return;
    ensureJoined();

    console.log("🎮 CLIENT: Sending invite to:", selectedUser);
    console.log("🎮 CLIENT: Socket connected:", socket?.connected);
    console.log("🎮 CLIENT: Socket ID:", socket?.id);
    socket.emit("send_invite", selectedUser);
    toast.success(`🎮 Invite sent to ${selectedUser.username}!`);
    setToggle(!isToggle);
  };

  return (
    <>
      <div ref={menuRef} className="flex-shrink-0">
        <div className="flex flex-col p-2">
          <div className="flex items-center p-2">
            <span className="text-center flex-1">{selectedUser?.username}</span>
            <button onClick={() => setToggle(!isToggle)}>
              <EllipsisVertical
                className="hover:bg-gray_1 cursor-pointer hover:rounded-full p-1"
                size={30}
              />
            </button>
          </div>
        </div>
        <hr className="border-t-1 border-white w-full" />

        {isToggle ? (
          <div className="relative flex min-h-0 z-40 justify-end">
            <div className="absolute flex flex-col bg-gray_1 rounded-xl w-48 -top-2 right-8">
              <div className="flex justify-center">
                <button
                  onClick={gameInvite}
                  className="py-3 w-full hover:bg-gray_3 hover:rounded-t-xl"
                >
                  <span className="">Play</span>
                </button>
              </div>
              <hr className="border-t-1 border-white w-full" />
              <div className="flex justify-center">
                <button
                  onClick={() => setToggle(!isToggle)}
                  className="py-3 w-full hover:bg-gray_3 hover:rounded-b-xl"
                >
                  <span className="">Block</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
};
