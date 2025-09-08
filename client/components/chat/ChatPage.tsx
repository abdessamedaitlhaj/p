import { Search, MessageSquare, EllipsisVertical, Image } from "lucide-react";
import { Input } from "./Input";
import { ChatArea } from "./ChatArea";
import { ChatAreaHeader } from "./ChatAreaHeader";
import { ChatSidebar } from "./ChatSidebar";
import { useStore } from "../../store/useStore";
import { useEffect, useState } from "react";

interface Message {
  sender_id: string;
  receiver_id: string;
  text: string;
  timestamp: Date;
}

interface User {
  id: string;
  username: string;
  email: string;
  avatarurl?: string;
  status: string;
  last_seen?: string | null;
  createdAt: string;
}

export const ChatPage = () => {
  const { socket, user, addMessage, loadConversation, selectedUser } =
    useStore();
  const [isTyping, setTyping] = useState(false);

  useEffect(() => {
    if (!socket || !user) {
      console.log("Socket or user not available");
      return;
    }

    socket.on("receive_message", (msg) => addMessage(msg));
    socket.on("typing", () => setTyping(true));
    socket.on("stop_typing", () => setTyping(false));

    return () => {
      socket.off("receive_message");
      socket.off("typing");
      socket.off("stop_typing");
    };
  }, [socket, user, selectedUser, addMessage]);

  useEffect(() => {
    if (selectedUser?.id && user?.id) {
      loadConversation(selectedUser.id);
    }
    setTyping(false);
  }, [selectedUser, user, loadConversation]);

  return (
    <>
      <div className="flex flex-col h-[900px] md:flex-row md:space-x-4">
        <div className="flex flex-col w-full md:w-1/4 p-4 bg-gray_3/80 rounded-2xl">
          <div className="bg-gray_2 rounded-2xl">
            <div className="relative flex w-full items-center p-1">
              <Search className="absolute left-2 text-white/50 h-5 w-5" />
              <input
                type="text"
                placeholder="search"
                className="placeholder-white/50 w-full pl-8 pr-2 py-1 text-sm focus:outline-none bg-transparent"
              />
            </div>
          </div>
          <div className="flex-1 bg-gray_3 p-4 mt-4 rounded-2xl">
            <div className="">Side</div>
          </div>
        </div>
        <div className="flex-1 bg-gray_3/80 rounded-2xl mt-4 md:mt-0">
          <div>
            <div className="flex flex-col p-2">
              <div className="flex items-center p-2">
                <span className="text-center flex-1">Name</span>
                <EllipsisVertical
                  className="hover:bg-gray_1/70 cursor-pointer hover:rounded-full p-1"
                  size={30}
                />
              </div>
            </div>
            <hr className="border-t-1 border-white w-full"></hr>
          </div>
          <div className=" flex flex-col gap-4 mt-4 p-4 overflow-auto">
            <div className="flex gap-4 items-center">
              <Image size={50} />
              <div className="relative bg-text_dark w-[300px] rounded-2xl p-3">
                {/* long word overflow */}
                <p className="text-sm mb-4 text-wrap">
                  Lorem ipsum dolor sit amasdasadasd aasdasdasdasdasda
                  sddasdasdaasdasdasasda
                </p>
                <span className="text-[10px] absolute right-6 bottom-2">
                  9:30
                </span>
              </div>
            </div>
            <div className="relative bg-text_yellow w-[300px] rounded-2xl p-3 self-end">
              {/* long word overflow */}
              <p className="text-sm mb-4 text-wrap">
                Lorem ipsum dolor sit amasdasadasd aasdasdasdasdasda
                sddasdasdaasdasdasasda
              </p>
              <span className="text-[10px] absolute right-6 bottom-2">
                9:30
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-row md:flex-col mt-4 md:mt-0 gap-4 w-full md:w-1/5 bg-gray-25">
          <div className="md:h-1/4 p-4 bg-gray_3/80 rounded-2xl w-1/3 md:w-full">
            Profile
          </div>
          <div className="md:h-full p-4 bg-gray_3/80 rounded-2xl w-full md:w-full">
            Online Users
          </div>
        </div>
      </div>
    </>
  );
  {
    /* <div className="flex flex-col p-4 w-64 h-3/4 gap-4">



        <ChatSidebar />
      </div>

      <div className="flex flex-col w-96 h-3/4 p-4 bg-transparent shadow-sm">
        {selectedUser ? (
          <>
            <ChatAreaHeader />
            <div className="overflow-y-auto scrollbar-hidden  h-full mt-4 p-1 border border-gray-300 rounded-md">
              <ChatArea />
            </div>
            {isTyping && (
              <div className="mt-2 mb-1 flex items-center gap-2 text-xs text-gray-500">
                <div className="flex items-center gap-1 bg-gray-200 rounded-full px-2 py-1">
                  <span className="flex -space-x-0.5 pr-1">
                    <span className="w-1.5 h-1.5 bg-gray-500/80 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-gray-500/60 rounded-full animate-bounce" style={{ animationDelay: '0.12s' }} />
                    <span className="w-1.5 h-1.5 bg-gray-500/40 rounded-full animate-bounce" style={{ animationDelay: '0.24s' }} />
                  </span>
                  <span className="text-[11px] font-medium text-gray-600 truncate max-w-[8rem]">
                    {selectedUser?.username || 'User'} typing...
                  </span>
                </div>
              </div>
            )}
            <div className="justify-self-end mt-1">
              <Input />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <MessageSquare className="text-gray-400 size-12" />
            <p className="text-gray-500">No user is selected</p>
          </div>
        )}
      </div> */
  }
  // </div>
  // );
};
