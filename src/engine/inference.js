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

function createTextChunkStream(executor) {
  const chunks = [];
  let notifyWaiter = null;
  let completed = false;
  let failure = null;

  function push(chunk) {
    chunks.push(chunk);
    if (notifyWaiter) {
      notifyWaiter();
      notifyWaiter = null;
    }
  }

  function finish(error = null) {
    failure = error;
    completed = true;
    if (notifyWaiter) {
      notifyWaiter();
      notifyWaiter = null;
    }
  }

  Promise.resolve()
    .then(() => executor(push))
    .then(
      () => finish(),
      (error) => finish(error)
    );

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (chunks.length > 0) {
          yield chunks.shift();
          continue;
        }

        if (failure) {
          throw failure;
        }

        if (completed) {
          return;
        }

        await new Promise((resolve) => {
          notifyWaiter = resolve;
        });
      }
    }
  };
}

async function runPrompt({ session, prompt, maxTokens, temperature, signal }) {
  return session.prompt(prompt, {
    maxTokens,
    temperature,
    signal,
    stopOnAbortSignal: true
  });
}

function streamPrompt({ session, prompt, maxTokens, temperature, signal }) {
  return createTextChunkStream((onTextChunk) =>
    session.prompt(prompt, {
      maxTokens,
      temperature,
      signal,
      stopOnAbortSignal: true,
      onTextChunk
    })
  );
}

export function chatCompletionStream({ context, messages, maxTokens, temperature, signal }) {
  const contextSequence = resolveContextSequence(context);
  const session = new LlamaChatSession({ contextSequence });
  const prompt = formatMessages(normalizeMessages(messages));

  return streamPrompt({
    session,
    prompt,
    maxTokens,
    temperature,
    signal
  });
}

export function textCompletionStream({ context, prompt, maxTokens, temperature, signal }) {
  const contextSequence = resolveContextSequence(context);
  const session = new LlamaChatSession({ contextSequence });
  const normalizedPrompt = typeof prompt === "string" ? prompt : String(prompt || "");

  return streamPrompt({
    session,
    prompt: normalizedPrompt,
    maxTokens,
    temperature,
    signal
  });
}

export async function chatCompletion({ context, messages, maxTokens, temperature, signal }) {
  const contextSequence = resolveContextSequence(context);
  const session = new LlamaChatSession({ contextSequence });
  const prompt = formatMessages(normalizeMessages(messages));

  return runPrompt({ session, prompt, maxTokens, temperature, signal });
}

export async function textCompletion({ context, prompt, maxTokens, temperature, signal }) {
  const contextSequence = resolveContextSequence(context);
  const session = new LlamaChatSession({ contextSequence });
  const normalizedPrompt = typeof prompt === "string" ? prompt : String(prompt || "");

  return runPrompt({ session, prompt: normalizedPrompt, maxTokens, temperature, signal });
}

function formatMessages(messages = []) {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n")
    .concat("\nASSISTANT: ");
}
