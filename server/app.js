import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env, isProduction } from "./config/env.js";
import routes from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errorMiddleware.js";
import { UPLOAD_ROOT } from "./services/storageService.js";

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    // Uploaded PDFs and scan images are served to the Vite dev origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

if (!isProduction) app.use(morgan("dev"));

app.use("/uploads", express.static(UPLOAD_ROOT, { maxAge: "1h" }));

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
