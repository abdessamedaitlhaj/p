// db/initTables.ts
import { initiateBlockedUsersTable } from "../models/chat/BlockedUsers";
import { initiateMessageTable } from "../models/chat/Message";
import { initiateConversationTable } from "../models/chat/Conversation";
import { initiateConversationParticipantsTable } from "../models/chat/ConversationParticipants";

export const initializeAllTables = () => {
  console.log("Initializing database tables...");

  initiateConversationTable();
  initiateMessageTable();
  initiateBlockedUsersTable();
  initiateConversationParticipantsTable();

  console.log("Database initialization complete");
};
