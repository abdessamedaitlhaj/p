import { ChatArea } from "./ChatArea";
import { ChatLeftSidebar } from "./ChatLeftSidebar";
import { ChatRightSidebar } from "./ChatRightSidebar";
import { useStore } from "../../store/useStore";
import { useEffect, useState } from "react";
import { ChatMenu } from "./ChatMenu";
import { MessageSquare } from "lucide-react";

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
};
