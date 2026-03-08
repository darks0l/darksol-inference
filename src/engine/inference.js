import { LlamaChatSession } from "node-llama-cpp";

export async function chatCompletion({ context, messages, stream = false, onTextChunk, maxTokens, temperature }) {
  const contextSequence = context.getSequence();
  const session = new LlamaChatSession({ contextSequence });
  const prompt = formatMessages(messages);

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

export async function textCompletion({ context, prompt, stream = false, onTextChunk, maxTokens, temperature }) {
  const contextSequence = context.getSequence();
  const session = new LlamaChatSession({ contextSequence });

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

function formatMessages(messages = []) {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n")
    .concat("\nASSISTANT: ");
}
