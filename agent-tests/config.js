import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

export const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
export const MAX_STEPS = parseInt(process.env.MAX_STEPS || "25", 10);
export const MODEL = process.env.AI_MODEL || "gpt-5.1";
export const ACTION_TIMEOUT = parseInt(process.env.ACTION_TIMEOUT || "8000", 10);
export const TESTS_DIR = __dirname;

export const QA_EMAIL = process.env.QA_EMAIL || "qa@example.com";
export const QA_PASSWORD = process.env.QA_PASSWORD || "Password123!";
