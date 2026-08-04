import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    // `prisma migrate dev` replays the full migration history into a scratch
    // database to detect drift. Without this it would reuse the primary
    // connection and fail on already-existing types.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
