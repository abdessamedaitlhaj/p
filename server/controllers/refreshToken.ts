import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { generateAccessToken } from "../token/generateToken.ts";
import { db } from "../db/db.ts";
import { findSessionByToken, touchSession } from "../models/UserSessions.ts";

interface User {
  id: number;
  username: string;
  password: string;
  refreshToken?: string;
}

interface JwtPayload {
  username: string;
  id: number;
  iat?: number;
  exp?: number;
}

export const handleRefreshToken = (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  const cookies = req.cookies;

  // console.log("++++++++++++++++++++++++++++")
  // console.log(cookies)
  // console.log("++++++++++++++++++++++++++++")
  if (!cookies?.jwt) return reply.status(401).send();

  const refreshToken = cookies.jwt;

  // Find refresh token in sessions table
  findSessionByToken(refreshToken)
    .then((session) => {
      if (!session) return reply.status(401).send();
      db.get(
        `SELECT u.id, u.username, u.email, u.avatarurl, u.status, u.password, ua.alias
          FROM users u
          LEFT JOIN userAliases ua ON u.id = ua.userId
          where u.id = ?`,
        [session.user_id],
        (err: any, current_user: User) => {
          if (err || !current_user) return reply.status(401).send();
          jwt.verify(
            refreshToken,
            process.env.REFRESH_TOKEN_SECRET as string,
            async (err: any, user: any) => {
              if (err || user.username !== current_user.username)
                return reply.status(403).send();
              try {
                await touchSession(refreshToken);
              } catch {}
              const accessToken = generateAccessToken(current_user);
              const {
                refreshToken: _rt,
                password: _pass,
                ...neat_user
              } = current_user as any;
              // console.log("/////////////////////////////++++++")
              // console.log(neat_user)
              // console.log("/////////////////////////////")
              reply.status(200).send({ user: { ...neat_user }, accessToken });
            }
          );
        }
      );
    })
    .catch(() => reply.status(500).send({ message: "Internal error" }));
};
