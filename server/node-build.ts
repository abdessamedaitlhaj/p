import path from "path";
import { createServer } from "./index";

const port = parseInt(process.env.PORT || "3000");
const host = process.env.HOST || "0.0.0.0";

async function startServer() {
  const app = await createServer();
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const distPath = path.join(__dirname, "../spa");

  // Serve static files in production
  if (process.env.NODE_ENV === "production") {
    app.register(import("@fastify/static"), {
      root: distPath,
      wildcard: false
    });

    // Handle React Router - serve index.html for all non-API routes
    app.setNotFoundHandler((_request, reply) => {
      reply.sendFile("./client/index.html", distPath);
    });
  }

  try {
    await app.listen({ port, host });
    console.log(`🚀 Fastify server running on port ${port}`);
    console.log(`📱 Frontend: http://localhost:${port}`);
    console.log(`🔧 API: http://localhost:${port}/api`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, async () => {
    console.log(`🛑 Received ${signal}, shutting down gracefully`);
    process.exit(0);
  });
});