import type { FastifyRequest, FastifyReply } from "fastify";
import { FindById, getAllUsers, SearchByName } from "../models/Users";
import {
  createFriendRequest,
  getFriendInvitations,
  AllreadyRequested,
  removeFriendship,
} from "../models/Friendships";
import { activityManager } from "../activityManager";
import { tournamentManager } from "../tournamentManager";
import { setAlias } from "../models/UserAliase";
import { Search } from "lucide-react";

interface Params {
  id: string;
}

export const getUserById = async (
  req: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply
) => {
  try {
    const { id }: { id: string } = req.query as { id: string };

    const current_user = await FindById(id);

    if (!current_user) {
      return reply
        .status(404)
        .send({ message: `User with id ${id} not found` });
    }
    return reply.status(200).send({ user: current_user });
  } catch (err: any) {
    console.error("getUSer : ", err.message);
    return reply.status(500).send({ message: err });
  }
};

// Get all users from db
export const getUsers = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    // Fetch raw users (includes sensitive columns we must NOT return directly)
    const users = await getAllUsers();

    // Whitelist only non‑sensitive public profile fields
    const sanitized = users.map((u: any) => {
      const uid = String(u.id);
      let inMatch = false;
      let inTournament = false;
      try {
        const lock = activityManager.isUserLocked(uid);
        inMatch = lock.reason === "match";
        inTournament = tournamentManager.isUserLocked(uid) || false;
      } catch {}
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        alias: u.alias ?? null,
        avatarurl: u.avatarurl,
        status: u.status,
        inMatch,
        inTournament,
        last_seen: u.last_seen,
        created_At: u.created_At,
        // Intentionally exclude: email, password, refreshToken, last_seen, createdAt
      };
    });
    return { users: sanitized };
  } catch (err: any) {
    console.error("getAllUsers : ", err.message);
    return reply.status(500).send({ message: err });
  }
};

export const newAlias = async (req: FastifyRequest, reply: FastifyReply) => {
  const { alias } = req.body as { alias: string };
  console.log("newAlias body:;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;");
  if (!alias) {
    return reply.status(400).send({ message: "alias and userId are required" });
  }

  try {
    await setAlias(alias, req.user_infos.id);
    try {
      tournamentManager.updateAlias(String(req.user_infos.id), alias);
    } catch {}
    return reply.status(201).send({ message: "Alias set", alias });
  } catch (err: Error | any) {
    console.error("newAlias Error : ", err.message);

    // Handle specific SQLITE constraint errors
    if (
      err.message &&
      err.message.includes("UNIQUE constraint failed: userAliases.alias")
    ) {
      return reply.status(400).send({
        message: "This alias is already taken. Please choose a different one.",
      });
    }

    return reply.status(500).send({ message: err.message });
  }
};

// decline , setDate
// accept  , setDate
export const NewFriendRequest = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const { recvId } = req.body as { recvId: string };
  const { id: forwId } = req.query as { id: string };

  if (!forwId || !recvId) {
    return reply
      .status(400)
      .send({ message: "forwId and recvId are required" });
  }

  try {
    const user_1 = await FindById(forwId);
    const user_2 = await FindById(recvId);
    if (!user_1 || !user_2) {
      return reply
        .status(404)
        .send({ message: "One of the users does not exist" });
    }
    if (forwId === recvId) {
      return reply
        .status(400)
        .send({ message: "You cannot send a friend request to yourself" });
    }

    // await getFriendRequests(forwId)

    // requester to receiver
    const alreadyRequested = await AllreadyRequested(forwId, recvId);
    if (alreadyRequested) {
      return reply.status(400).send({ message: "Friend request already sent" });
    }

    // receiver to requester
    const alreadyReceived = await AllreadyRequested(recvId, forwId);
    if (alreadyReceived) {
      return reply
        .status(400)
        .send({ message: "User has already sent you a friend request" });
    }

    const friendships = await createFriendRequest(forwId, recvId);
    return reply
      .status(201)
      .send({ message: "Friend request sent", friendships });
  } catch (err: Error | any) {
    console.error("FriendRequest Error : ", err.message);
    return reply.status(500).send({ message: err.message });
  }
};

// Remove , Decline friend request
export const RemoveRequst = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const { requesterId } = req.body as { requesterId: string };
  const { id: meinId } = req.params as { id: string };

  if (!meinId || !requesterId) {
    return reply
      .status(400)
      .send({ message: "meinId and requesterId are required" });
  }

  const user_1 = await FindById(meinId);
  const user_2 = await FindById(requesterId);
  if (!user_1 || !user_2) {
    return reply
      .status(404)
      .send({ message: "One of the users does not exist" });
  }
  if (meinId === requesterId) {
    return reply
      .status(400)
      .send({ message: "You cannot remove a friend request to yourself" });
  }

  console.log("**------ RemoveRequst: ", meinId, requesterId);
  try {
    const alreadyRequested_1 = await AllreadyRequested(meinId, requesterId); // me
    const alreadyRequested_2 = await AllreadyRequested(requesterId, meinId); // you
    if (!alreadyRequested_1 && !alreadyRequested_2) {
      return reply.status(400).send({ message: "No friend request to remove" });
    }

    await removeFriendship(meinId, requesterId);
    return reply.status(200).send({ message: "Friend request removed" });
  } catch (err: Error | any) {
    console.error("FriendRequest Error : ", err.message);
    return reply.status(500).send({ message: err.message });
  }
};

export const FriendRequests = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const { id: UserId } = req.query as { id: string };

  if (!UserId) {
    return reply.status(400).send({ message: "UserId is required" });
  }

  try {
    const friends = await getFriendInvitations(UserId);
    return reply.status(200).send({ friends });
  } catch (err: Error | any) {
    console.error("getFriendInvitations Error : ", err.message);
    return reply.status(500).send({ message: err.message });
  }
};

export const SearchRequest = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const { srch } = req.query as { srch: string };
  const { id } = req.user_infos as { id: string };

  if (!srch) {
    return reply.status(400).send({ message: "Search is required", users: [] });
  }

  try {
    const users = await SearchByName(srch, id);
    return reply.status(200).send({ users });
  } catch (err: Error | any) {
    console.error("SearchRequest Error : ", err.message);
    return reply.status(500).send({ message: err.message });
  }
};
