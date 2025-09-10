import api from "@/utils/Axios";
import { useQuery } from "@tanstack/react-query";

interface Message {
  sender_id: string;
  sender_avatarurl?: string;
  receiver_id: string;
  text: string;
  timestamp: Date;
}

export const useMessages = () => {
  const fetchMessages = () =>
    api
      .get<{ messages: Message[] }>("/messages")
      .then((response) => response.data.messages);

  return useQuery<Message[], Error>({
    queryKey: ["messages"],
    queryFn: fetchMessages,
    staleTime: 1000 * 10,
  });
};
