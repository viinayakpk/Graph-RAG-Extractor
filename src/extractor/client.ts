import OpenAI from "openai";

export function buildClient(): OpenAI {
  const apiKey = process.env["DEEPSEEK_API_KEY"];
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

  return new OpenAI({
    apiKey,
    baseURL: process.env["DEEPSEEK_BASE_URL"] ?? "https://api.deepseek.com",
  });
}

export function modelName(): string {
  return process.env["DEEPSEEK_MODEL"] ?? "deepseek-chat";
}
