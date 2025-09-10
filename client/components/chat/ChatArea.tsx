import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import { toast } from "react-hot-toast";
import moment from "moment";
import {
  EllipsisVertical,
  MessageCircle,
  MessageSquare,
  Send,
} from "lucide-react";
import { Input } from "./Input";

export const ChatArea = () => {
  const {
    socket,
    user,
    selectedUser,
    conversation,
    loadConversation,
    lockedUsers,
  }: any = useStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isToggle, setToggle] = useState(false);
  const [isTyping, setTyping] = useState(false);
  const [isMultiple, setMultiple] = useState(true);

  useEffect(() => {
    if (!socket || !user) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [socket, user, conversation, isTyping]);

  useEffect(() => {
    if (!socket || !user) {
      console.log("Socket or user not available");
      return;
    }

    socket.on("typing", (sid) => {
      if (String(sid) === String(selectedUser.id)) setTyping(true);
    });
    socket.on("stop_typing", (sid) => {
      if (String(sid) === String(selectedUser.id)) setTyping(false);
    });

    return () => {
      socket.off("typing");
      socket.off("stop_typing");
    };
  }, [socket, user, selectedUser]);

  useEffect(() => {
    if (selectedUser?.id && user?.id) {
      loadConversation(selectedUser.id);
    }
    setTyping(false);
  }, [selectedUser, user, loadConversation]);

  const formatTimeDifference = (timestamp) => {
    const messageDate = new Date(timestamp);
    const now = new Date();
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

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 min-h-0 scrollbar-hidden">
        <div className="flex flex-col gap-4">
          {conversation.map((msg, index) => {
            const isFromCurrentUser =
              String(msg.sender_id) === String(user?.id);

            const isFirstMessageFromSender =
              index === 0 ||
              String(conversation[index - 1].sender_id) !==
                String(msg.sender_id);
            return (
              <div
                key={index}
                className={`flex items-center gap-4 ${
                  isFromCurrentUser ? "justify-end" : "justify-start"
                }`}
              >
                {!isFromCurrentUser && (
                  <div className="relative flex-shrink-0">
                    {isFirstMessageFromSender ? (
                      <img
                        src={msg.sender_avatarurl}
                        className="size-10 rounded-full"
                      />
                    ) : (
                      <div className="size-10" />
                    )}
                  </div>
                )}
                <div
                  className={`max-w-[300px] break-words  rounded-2xl p-3 ${
                    isFromCurrentUser ? "bg-yellow_3" : "bg-gray_1"
                  }`}
                >
                  <p className="text-sm mb-4  text-white">{msg.text}</p>
                  <p className="text-[10px] text-end m-0 text-white/70">
                    {formatTimeDifference(msg.timestamp)}
                  </p>
                </div>
              </div>
            );
          })}
          {isTyping && (
            <div className="flex space-x-1 pl-1 pt-6">
              <span className="size-2 bg-white/50 rounded-full animate-bounce" />
              <span
                className="size-2 bg-white/50 rounded-full animate-bounce"
                style={{ animationDelay: "0.12s" }}
              />
              <span
                className="size-2 bg-white/50 rounded-full animate-bounce"
                style={{ animationDelay: "0.24s" }}
              />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <Input />
    </>
  );
};
