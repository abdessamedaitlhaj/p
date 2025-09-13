import type { FastifyInstance } from "fastify";
import { createMessage } from "../controllers/chat/messages.ts"; // This is the only import needed for saving

export const registerSocketChatHandlers = (
  app: FastifyInstance,
  socket: any,
  socketToUser: Map<string, string>
) => {
  socket.on("stop_typing", (data: { rid: string; sid: string }) =>
    app.io.to(String(data.rid)).emit("stop_typing", data.sid)
  );
  socket.on("istyping", (data: { rid: string; sid: string }) =>
    app.io.to(String(data.rid)).emit("typing", data.sid)
  );

  socket.on(
    "send_message",
    async (payload: {
      sender_id: string;
      receiver_id: string;
      text: string;
      sender_avatarurl?: string;
    }) => {
      const senderId = payload.sender_id;
      const receiverId = payload.receiver_id;
      const authenticatedUserId = (socket as any).userId;

      if (authenticatedUserId !== senderId) {
        app.log.warn(
          `🚫 User ${authenticatedUserId} tried to send message as ${senderId}`
        );
        socket.emit("error", "Cannot send messages as another user");
        return;
      }

      if (!payload.text || typeof payload.text !== "string") {
        socket.emit("error", "Message text is required");
        return;
      }

      if (payload.text.length > 1000) {
        socket.emit("error", "Message too long (max 1000 characters)");
        return;
      }

      try {
        const newMessage = await createMessage(
          {
            sender_id: parseInt(senderId),
            sender_avatarurl: payload.sender_avatarurl,
            receiver_id: parseInt(receiverId),
            content: payload.text,
          },
          app.log.info
        );

        app.io.to(senderId).emit("receive_message", newMessage);
        app.io.to(receiverId).emit("receive_message", newMessage);
      } catch (e: any) {
        socket.emit("error", `Failed to send message: ${e.message}`);
      }
    }
  );
};
