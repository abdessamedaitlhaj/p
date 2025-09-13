import { ChatArea } from "../components/chat/ChatArea";
import { ChatLeftSidebar } from "../components/chat/ChatLeftSidebar";
import { ChatRightSidebar } from "../components/chat/ChatRightSidebar";
import { useStore } from "../store/useStore";
import { useEffect, useState } from "react";
import { ChatMenu } from "../components/chat/ChatMenu";
import { MessageSquare } from "lucide-react";

export const ChatPage = () => {
  const { selectedUser } = useStore();

  return (
    <div className="flex flex-col h-[900px] md:flex-row  md:space-x-4 md:w-full">
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
};
