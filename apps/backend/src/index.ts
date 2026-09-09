import "dotenv/config";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { ensureBucket } from "./lib/minio.js";
import videosRouter from "./routes/videos.js";
import imagesRouter from "./routes/images.js";
import faceSwapRouter from "./routes/faceswap.js";
import avatarsRouter from "./routes/avatars.js";
import templatesRouter from "./routes/templates.js";

const PORT = Number(process.env.PORT ?? 4000);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

const app = express();

app.use(
  cors({
    origin: WEB_ORIGIN,
    credentials: true,
  }),
);

// better-auth's handler must be mounted before express.json() - it parses
// the request body itself.
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/videos", videosRouter);
app.use("/api/images", imagesRouter);
app.use("/api/faceswap", faceSwapRouter);
app.use("/api/avatars", avatarsRouter);
app.use("/api/templates", templatesRouter);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
);

async function main() {
  await ensureBucket();
  const server = app.listen(PORT, () => {
    console.log(`backend listening on http://localhost:${PORT}`);
  });

  // Template renders generate many clips in one synchronous request and can
  // legitimately run for tens of minutes; the 5-minute default would kill
  // them mid-flight. Renders are resumable either way (see lib/render.ts),
  // but there's no reason to force that path in the normal case.
  server.requestTimeout = 0; // no limit
  server.headersTimeout = 0;
  server.timeout = 0;
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
