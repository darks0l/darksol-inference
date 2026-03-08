import { LlamaChatSession } from "node-llama-cpp";

function resolveContextSequence(context) {
  if (!context || typeof context.getSequence !== "function") {
    throw new Error("Inference context is not initialized. Load a local model first.");
  }
  return context.getSequence();
}

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array.");
  }

  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role || "user",
      content: message.content
    }));
}

async function runPrompt({ session, prompt, stream, onTextChunk, maxTokens, temperature }) {
  if (stream) {
    const chunks = [];
    await session.prompt(prompt, {
      maxTokens,
      temperature,
      onTextChunk: (chunk) => {
        chunks.push(chunk);
        if (onTextChunk) {
          onTextChunk(chunk);
        }
      }
    });
    return chunks.join("");
  }

  return session.prompt(prompt, { maxTokens, temperature });
}

export async function chatCompletion({ context, messages, stream = false, onTextChunk, maxTokens, temperature }) {
  const contextSequence = resolveContextSequence(context);
  const session = new LlamaChatSession({ contextSequence });
  const prompt = formatMessages(normalizeMessages(messages));

  return runPrompt({ session, prompt, stream, onTextChunk, maxTokens, temperature });
}

export async function textCompletion({ context, prompt, stream = false, onTextChunk, maxTokens, temperature }) {
  const contextSequence = resolveContextSequence(context);
  const session = new LlamaChatSession({ contextSequence });
  const normalizedPrompt = typeof prompt === "string" ? prompt : String(prompt || "");

  return runPrompt({
    session,
    prompt: normalizedPrompt,
    stream,
    onTextChunk,
    maxTokens,
    temperature
  });
}

function formatMessages(messages = []) {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n")
    .concat("\nASSISTANT: ");
}
