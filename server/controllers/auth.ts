import type { FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcrypt";
import {
  findByEmailOrUsername,
  createUser,
  FindByUser,
} from "../models/Users.ts";
import {
  createSession,
  deleteSessionByToken,
  findSessionByToken,
} from "../models/UserSessions.ts";
import { db } from "../db/db.ts";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../token/generateToken.ts";
import { number, string } from "zod";

interface LoginBody {
  username: string;
  password: string;
}

interface User {
  id: number;
  username: string;
  email: string;
  password: string;
}

interface SignUpBody {
  username: string;
  password: string;
  email: string;
}

export const Login = async (
  req: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply
) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return reply
      .status(400)
      .send({ message: "Username and password are required." });
  }

  // Find user by username

  try {
    const findUser: User | null = await FindByUser(username);
    if (!findUser) return reply.status(401).send({ message: "user not exist" });

    // Compare password
    const match = await bcrypt.compare(password, findUser.password);
    if (!match)
      return reply.status(401).send({ message: "incorrect password" });

    // Create tokens (per session refresh token)
    const accessToken = generateAccessToken(findUser);
    const refreshToken = generateRefreshToken(findUser);

    await createSession(findUser.id, refreshToken);

    if (req.cookies["jwt"]) req.cookies["jwt"] = ""; // replace older cookie if any

    // Set secure cookie configuration
    reply.setCookie("jwt", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Use HTTPS in production
      sameSite: "strict", // Prevent CSRF attacks
      path: "/",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    const {
      password: _pass,
      refreshToken: _rt,
      ...neat_user
    } = findUser as any;
    return reply
      .status(200)
      .send({ user: { ...neat_user }, accessToken, session: { refreshToken } });
  } catch (err: any) {
    console.error("SignIn error:", err.message);
    return reply.status(500).send({ message: "Internal server error" });
  }
};

// SignUp
export const SignUp = async (
  req: FastifyRequest<{ Body: SignUpBody }>,
  reply: FastifyReply
) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    return reply.status(400).send({ message: "Missing required fields" });
  }

  try {
    const existingUser = await findByEmailOrUsername(email, username);

    if (existingUser) {
      return reply.status(409).send({ message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(password, salt);
    // console.log("[[[[[[[[[[[[[[[[[[[[[[[[[")
    // console.log(hashedPass)
    // console.log("[[[[[[[[[[[[[[[[[[[[[[[[[")

    const userId = await createUser(username, email, hashedPass);

    // Player stats now initialized in DB
    // Player stats now initialized in DB

    return reply.status(201).send({ message: "User created", userId });
  } catch (err: any) {
    console.error("Signup error:", err.message);
    return reply.status(500).send({ message: "Internal server error" });
  }
};

export const Logout = async (req: FastifyRequest, res: FastifyReply) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.send(203);
  const refreshToken = cookies.jwt;
  try {
    await deleteSessionByToken(refreshToken); // delete only this session
    res.clearCookie("jwt", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
    res.send(204);
  } catch (err: any) {
    console.error("Logout error:", err.message);
    return res.status(500).send({ message: "Internal server error" });
  }
};
