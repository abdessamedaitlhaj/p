import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifySocketIO from "fastify-socket.io";
import { roomManager } from "./roomManager";
import { tournamentManager } from "./tournamentManager";
import { registerSocketHandlers } from "./socket/registerHandlers";
import { socketAuthMiddleware } from "./middleware/socketAuth";
import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import fastifyHelmet from "@fastify/helmet";
import { globalRateLimit, authRateLimit } from "./middleware/rateLimit";
import dotenv from "dotenv";
import { Server as SocketIOServer } from "socket.io";
import { db } from "./db/db";
import { initializeAllTables } from "../server/db/initiateTables";

// routes
import { AuthRoutes } from "./routes/auth";
import { RefreshRoutes } from "./routes/refreshToken";
import { UserRoutes } from "./routes/users";
import { ChatRoutes } from "./routes/chat";
import { MessageRoutes } from "./routes/messages";
import { CliAuthRoutes, CliRoutes } from "./cli/cliRoutes";
import { verifyToken } from "./middleware/verifyToken";

dotenv.config();

declare module "fastify" {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}

export async function createServer() {
  const app = Fastify({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
      },
    },
  });

  // Secure CORS configuration - only allow specific origins
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
        "http://localhost:8080",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:5173",
      ];

      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return cb(null, true);

      if (allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        console.log(`🚫 CORS blocked origin: ${origin}`);
        cb(new Error("CORS policy violation"), false);
      }
    },
    methods: ["GET", "POST", "DELETE"],
    credentials: true,
  });

  await app.register(fastifyCookie);
  await app.register(fastifyFormbody);

  // Enhanced security headers with CSP
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Needed for React dev
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "ws://localhost:3000",
          "wss://localhost:3000",
          "http://localhost:3000",
        ],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Needed for Socket.IO
  });

  // Global rate limiting middleware
  app.addHook("preHandler", globalRateLimit);

  // Strict rate limiting for auth endpoints
  await app.register(async function authRoutes(fastify) {
    fastify.addHook("preHandler", authRateLimit);
    await fastify.register(AuthRoutes, { prefix: "api/auth" });
  });

  await app.register(RefreshRoutes, { prefix: "api/token" });
  await app.register(UserRoutes, { prefix: "api/users" });
  await app.register(ChatRoutes, { prefix: "api/users" });
  await app.register(MessageRoutes, { prefix: "api/messages" });

  // Moderate rate limiting for CLI endpoints - using global rate limit
  await app.register(CliAuthRoutes, { prefix: "api/authcli" });
  await app.register(CliRoutes, { prefix: "api/cli" });

  await app.register(fastifySocketIO, {
    cors: {
      origin: (origin, callback) => {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
          "http://localhost:8080",
          "http://localhost:5173",
          "http://127.0.0.1:8080",
          "http://127.0.0.1:5173",
        ];

        // Allow requests with no origin (development)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.log(`🚫 Socket.IO CORS blocked origin: ${origin}`);
          callback(new Error("CORS policy violation"));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Allow both polling and websocket so auth payload in handshake isn't stripped.
    // We'll tighten this later once auth stability confirmed.
    transports: ["polling", "websocket"],
  });

  // Periodic tournament tick - reduced from 2s to 10s for better performance
  // Tournament state changes are infrequent, so less frequent polling is adequate
  setInterval(() => {
    try {
      tournamentManager.tick(app.io);
    } catch (e) {
      console.error("Tournament tick error", e);
    }
  }, 10000); // Changed from 2000ms to 10000ms

  app.ready().then(() => {
    initializeAllTables();
    console.log("🎮 Socket.IO server ready, waiting for connections...");
    // Expose IO globally for modules that cannot import Fastify instance
    (global as any).io = app.io;
    (global as any).fastifyIo = app.io;

    // Add authentication middleware to all socket connections
    app.io.use(socketAuthMiddleware);

    // Register all Socket.IO event handlers (with authentication now added)
    registerSocketHandlers(app);
    // Clear stale non-tournament locks (tournament locks recalculated by tick)
    import("./activityManager").then((m) => {
      try {
        m.activityManager.forceUnlockAll(false);
        console.log("🧹 Cleared stale match/invite locks at startup");
      } catch {}
    });
  });

  // API endpoints
  app.get("/api/ping", async () => {
    return { message: "Pong! 🏓", timestamp: new Date().toISOString() };
  });

  // Stats API (prefixed under /api to work with Vite proxy)
  app.get("/api/stats/player", { preHandler: verifyToken }, (_req, reply) => {
    db.all("SELECT * FROM player_stats", [], (err, rows) => {
      if (err) return reply.code(500).send({ error: "db error" });
      return reply.send(rows);
    });
  });
  // Last 7 day daily stats for a player (requires userId query param)
  app.get(
    "/api/stats/player/daily7",
    { preHandler: verifyToken },
    (req, reply) => {
      const userId = Number((req.query as any).userId);
      if (!userId) return reply.code(400).send({ error: "userId required" });
      import("./models/PlayerStats").then((m) => {
        m.getLast7DayDailyStats(userId, (err, data) => {
          if (err) return reply.code(500).send({ error: "db error" });
          reply.send(data);
        });
      });
    }
  );
  app.get(
    "/api/stats/matches",
    { preHandler: verifyToken },
    async (_req, reply) => {
      return new Promise((resolve) => {
        db.all("SELECT * FROM game_results", [], (err, rows) => {
          if (err) {
            reply.code(500).send({ error: "db error" });
            resolve(null);
            return;
          }
          reply.send(rows);
          resolve(null);
        });
      });
    }
  );
  app.get(
    "/api/stats/tournaments",
    { preHandler: verifyToken },
    async (req, reply) => {
      const authenticatedUserId = req.user_infos?.id;

      if (!authenticatedUserId) {
        return reply.code(401).send({ error: "User not authenticated" });
      }

      return new Promise((resolve) => {
        db.all("SELECT * FROM tournaments", [], (err, rows) => {
          if (err) {
            reply.code(500).send({ error: "db error" });
            resolve(null);
            return;
          }

          // Filter tournaments to only show those the user participated in or created
          const userTournaments = rows.filter((tournament: any) => {
            // Check if user created the tournament
            if (tournament.created_by === authenticatedUserId) {
              return true;
            }

            // Check if user participated in the tournament
            try {
              const tournamentData = JSON.parse(tournament.data_json);
              if (
                tournamentData.players &&
                Array.isArray(tournamentData.players)
              ) {
                return tournamentData.players.includes(authenticatedUserId);
              }
            } catch (e) {
              console.error("Failed to parse tournament data_json:", e);
            }

            return false;
          });

          // Sanitize tournament data to remove sensitive information
          const sanitizedTournaments = userTournaments.map(
            (tournament: any) => {
              try {
                const tournamentData = JSON.parse(tournament.data_json);

                // Only include non-sensitive fields
                return {
                  id: tournament.id,
                  name: tournament.name,
                  created_by:
                    tournament.created_by === authenticatedUserId
                      ? tournament.created_by
                      : "other", // Hide other creators
                  starts_at: tournament.starts_at,
                  status: tournament.status,
                  result_winner: tournament.result_winner,
                  result_runners_up: tournament.result_runners_up,
                  result_completed_at: tournament.result_completed_at,
                  // Include basic tournament info but exclude sensitive socket IDs and detailed player data
                  player_count: tournamentData.players
                    ? tournamentData.players.length
                    : 0,
                  user_participated: tournamentData.players
                    ? tournamentData.players.includes(authenticatedUserId)
                    : false,
                };
              } catch (e) {
                console.error(
                  "Failed to parse tournament data for sanitization:",
                  e
                );
                return {
                  id: tournament.id,
                  name: tournament.name,
                  status: tournament.status,
                  error: "Failed to parse tournament data",
                };
              }
            }
          );

          reply.send(sanitizedTournaments);
          resolve(null);
        });
      });
    }
  );

  // Removed periodic public room count broadcast (privacy/noise reduction)

  return app;
}
let runningApp: FastifyInstance | null = null;
const startServer = async () => {
  const app = await createServer();
  runningApp = app;
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || "0.0.0.0";

  try {
    await app.listen({ port: Number(port), host });
    console.log(`🚀 Server running at http://${host}:${port}`);
    console.log(`🎮 Game server ready for connections`);
  } catch (err: any) {
    if (err?.code === "EADDRINUSE") {
      console.error(
        "🔥 Port already in use (" + port + "). Listing processes holding it:"
      );
      try {
        const { execSync } = await import("node:child_process");
        const list = execSync(`lsof -i:${port} | head -n 20`).toString();
        console.error(list);
      } catch {}
    }
    console.error("🔥 Server failed to start:", err);
    // Don't hard exit immediately; allow nodemon to attempt restart after cleanup
  }
};

async function gracefulExit(signal: string) {
  console.log(`🛑 ${signal} received, closing server...`);
  try {
    if (runningApp) {
      await runningApp.close();
      console.log("✅ Fastify server closed.");
    }
  } catch (e) {
    console.error("⚠️ Error during close:", e);
  } finally {
    if (signal === "SIGUSR2") {
      // Nodemon restart: allow process to continue so nodemon can restart
      process.kill(process.pid, "SIGUSR2");
    } else {
      process.exit(0);
    }
  }
}

["SIGINT", "SIGTERM", "SIGUSR2"].forEach((sig) => {
  process.once(sig as NodeJS.Signals, () => gracefulExit(sig));
});

startServer();
