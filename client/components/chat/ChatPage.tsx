import {
  Search,
  MessageSquare,
  EllipsisVertical,
  Image,
  Ban,
  Send,
} from "lucide-react";
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
    <div className="flex flex-col h-[900px] md:flex-row md:space-x-4">
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

        <div className="flex-1 bg-gray_3/80 p-4 mt-4 rounded-2xl overflow-y-auto scrollbar-hidden">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center p-3 rounded-2xl cursor-pointer transition-colors duration-200 bg-gray_1">
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 bg-avatar_color rounded-full"></div>
              </div>

              <div className="flex-1 ml-3 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-medium text-sm truncate">
                    Nameeeeee
                  </h3>
                  <div className="flex flex-col gap-4 items-center space-x-2 flex-shrink-0">
                    <span className="text-white/70 text-xs">10h</span>
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
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-gray_3/80 rounded-2xl mt-4 md:mt-0 flex flex-col h-full">
        <div className="flex-shrink-0">
          <div className="flex flex-col p-2">
            <div className="flex items-center p-2">
              <span className="text-center flex-1">Name</span>
              <EllipsisVertical
                className="hover:bg-gray_1/70 cursor-pointer hover:rounded-full p-1"
                size={30}
              />
            </div>
          </div>
          <div className="bg-gray_1 rounded-xl min-h-0 w-48 items-center justify-center">
            <div className="flex flex-col space-y-4 w-full">
              <div className="flex justify-center ">
                <button className="">
                  <p className="">Play</p>
                </button>
              </div>
              <hr className="border-t-1 border-white w-full" />
              <div className="flex justify-center ">
                <button className="">
                  <p className="">Play</p>
                </button>
              </div>
              <hr className="border-t-1 border-white w-full" />
              <div className="flex justify-center ">
                <button className="">
                  <p className="">Play</p>
                </button>
              </div>
            </div>
          </div>
          <hr className="border-t-1 border-white w-full" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0 scrollbar-hidden">
          <div className="flex flex-col gap-4">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i}>
                {i % 2 === 0 ? (
                  <div className="flex items-center gap-4 items-start">
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 bg-avatar_color rounded-full"></div>
                    </div>
                    <div className="relative bg-gray_1 max-w-[300px] rounded-2xl p-3">
                      <p className="text-sm mb-4 text-wrap text-white">
                        Message {i + 1}: Lore
                      </p>
                      <span className="text-[10px] absolute right-6 bottom-2 text-white/70">
                        9:30
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <div className="relative bg-yellow_3 max-w-[300px] rounded-2xl p-3">
                      <p className="text-sm mb-4 text-wrap">
                        Reply {i + 1}: Lorem ipsum dolor sit amasdasadasd
                        aasdasdasdasdasda sddasdasdaasdasdasasda
                      </p>
                      <span className="text-[10px] absolute right-6 bottom-2">
                        9:30
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-shrink-0 p-4">
          <div className="bg-input_color/60 p-3 rounded-2xl">
            <div className="flex w-full items-center gap-2">
              <input
                className="flex-1 p-2 placeholder-white focus:outline-none bg-transparent"
                placeholder="message..."
              />
              <button className="self-end p-2 hover:bg-gray_3/80 hover:rounded-full">
                <Send className="text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-full flex-row md:flex-col mt-4 md:mt-0 gap-4 w-full md:w-1/5">
        <div className="md:h-1/2 p-4 bg-gray_3/80 rounded-2xl w-1/3 md:w-full ">
          <div className="text-center mb-6">
            <h3 className="text-white text-lg font-medium">Chat Info</h3>
          </div>

          <div className="text-white mb-6">
            <p className="text-base font-medium">Conversation started</p>
          </div>

          <div className="text-center mb-6">
            <p className="text-white text-base">21/07/2025 15:13</p>
          </div>

          <div>
            <button className="w-full bg-yellow_3 hover:bg-yellow_3/80 py-3 px-4 rounded-full font-medium text-base">
              Profile Link
            </button>
          </div>
        </div>
        <div className="min-h-0 p-4 bg-gray_3/80 rounded-2xl w-full md:w-full flex flex-col">
          <div className="mb-6 flex-shrink-0">
            <h2 className="text-white text-lg font-medium">
              <span className="text-yellow_1">23</span> online friends
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hidden min-h-0">
            <div className="space-y-4">
              {Array.from({ length: 12 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-4 p-2 rounded-lg hover:bg-gray_3/30 transition-colors cursor-pointer"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 bg-avatar_color rounded-full"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white text-base font-medium truncate">
                      Name
                    </h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
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
