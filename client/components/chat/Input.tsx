import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { useStore } from "../../store/useStore";
import { stat } from "fs";

interface Message {
  sender_id: string;
  receiver_id: string;
  text: string;
  timestamp: string; // ISO string
}

export const Input = () => {
  const [newMessage, setNewMessage] = useState("");
  const { socket, user, selectedUser, addMessage } = useStore();
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    if (socket && selectedUser && e.target.value.trim() !== "") {
      if (!isTypingRef.current) {
        socket.emit("istyping", selectedUser.id);
        isTypingRef.current = true;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        if (socket && selectedUser) {
          socket.emit("stop_typing", selectedUser.id);
          isTypingRef.current = false;
        }
      }, 2000);
    } else if (e.target.value.trim() === "" && isTypingRef.current) {
      if (socket && selectedUser) {
        socket.emit("stop_typing", selectedUser.id);
        isTypingRef.current = false;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const handleSendMessage = (
    e:
      | React.MouseEvent<HTMLButtonElement>
      | React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (newMessage.trim() === "" || !socket || !user || !selectedUser) return;
    e.preventDefault();

    if (isTypingRef.current) {
      socket.emit("stop_typing", selectedUser.id);
      isTypingRef.current = false;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    const message: Message = {
      sender_id: user.id,
      receiver_id: selectedUser.id,
      text: newMessage,
      timestamp: new Date().toISOString(),
    };
    socket.emit("send_message", message);
    setNewMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <input
        onKeyDown={handleKeyDown}
        value={newMessage}
        onChange={handleInputChange}
        type="text"
        placeholder="Message..."
        className="text-gray-600 w-80 placeholder-gray-400 border border-gray-300 rounded-md px-2 py-1 focus:outline-none"
      />
      <button onClick={handleSendMessage} className="cursor-pointer">
        <Send className="text-gray-400 size-5 hover:text-gray-600 transition duration-600 ease-in-out" />
      </button>
    </div>
  );
};
