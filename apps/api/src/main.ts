import "./env.js";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";

const app = await NestFactory.create<NestExpressApplication>(AppModule);
// Behind one proxy on Render, so the client address comes from x-forwarded-for.
app.set("trust proxy", 1);
app.enableShutdownHooks();
// Hosts such as Render set PORT; API_PORT is the local default.
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
await app.listen(port);
console.log(`velaq-api listening on :${port}`);
