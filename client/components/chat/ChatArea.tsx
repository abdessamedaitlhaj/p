import { useEffect, useRef } from "react";
import { useStore } from "../../store/useStore";
import { toast } from "react-hot-toast";
import moment from "moment";

export const ChatArea = () => {
  const { socket, user, selectedUser, messages, lockedUsers }: any = useStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatMessages = messages.filter((msg) => {
    const isFromUser =
      String(msg.sender_id) === String(user?.id) &&
      String(msg.receiver_id) === String(selectedUser?.id);
    const isToUser =
      String(msg.receiver_id) === String(user?.id) &&
      String(msg.sender_id) === String(selectedUser?.id);

    return isFromUser || isToUser;
  });

  useEffect(() => {
    if (!socket || !user) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [socket, user, chatMessages]);

  return (
    <>
      {selectedUser && lockedUsers?.[String(selectedUser.id)]?.inMatch && (
        <div className="flex items-center gap-2 px-2 py-1 text-[10px] text-red-600 font-semibold">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> In game
        </div>
      )}
      {chatMessages.map((msg, index) => {
        const isFromCurrentUser = String(msg.sender_id) === String(user?.id);

        return (
          <div
            key={`${msg.sender_id}-${msg.receiver_id}-${msg.timestamp}-${index}`}
            className={`flex p-1 gap-2 ${
              isFromCurrentUser ? "justify-end" : "justify-start"
            }`}
          >
            {!isFromCurrentUser && (
              <div className="self-end">
                <img
                  src={selectedUser?.avatarurl}
                  alt="Profile"
                  className="size-6 rounded-full"
                />
              </div>
            )}

            <div
              className={`min-w-0 max-w-[70%] rounded-2xl p-2 ${
                isFromCurrentUser
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              <p className="text-xs break-words whitespace-pre-wrap">
                {msg.text}
              </p>
              <p
                className={`text-[10px] text-end ${
                  isFromCurrentUser ? "text-blue-100" : "text-gray-500"
                }`}
              >
                {moment(msg.timestamp).fromNow()}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </>
  );
};
