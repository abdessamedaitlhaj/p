import { ChatArea } from "./ChatArea";
import { ChatLeftSidebar } from "./ChatLeftSidebar";
import { ChatRightSidebar } from "./ChatRightSidebar";
import { useStore } from "../../store/useStore";
import { useEffect, useState } from "react";
import { ChatMenu } from "./ChatMenu";
import { MessageSquare } from "lucide-react";

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
  const { selectedUser } = useStore();

  return (
    <div className="flex flex-col h-[900px] md:flex-row m-auto md:space-x-4 ma:max-w-[800px]">
      <ChatLeftSidebar />

      <div className="flex-1 bg-gray_3/80 rounded-2xl mt-4 md:mt-0 flex flex-col h-full">
        {selectedUser ? (
          <>
            <ChatMenu />
            <ChatArea />
          </>
        ) : (
          <div className="flex flex-col gap-4 items-center justify-center h-full">
            <MessageSquare className="text-white/50 size-8 sm:size-16" />
            <p className="text-white/50">No user is selected</p>
          </div>
        )}
      </div>
      <ChatRightSidebar />
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
