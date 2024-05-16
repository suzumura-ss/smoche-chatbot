import { Groq } from "npm:groq-sdk";

const kv = await Deno.openKv();
const {
  // https://console.groq.com/docs/api-keys
  GROQ_API_KEY,
} = Deno.env.toObject();
const model = "llama3-70b-8192";
const groq = new Groq({
  apiKey: GROQ_API_KEY,
  timeout: 10_000,
});
const system = `\
あなたは日本人です。
日本語で答えます。
`;

async function chat(messages: Messages): Promise<string> {
  const res = await groq.chat.completions.create({
    model,
    messages: [{ role: "system", content: system }, ...messages],
  });

  return res.choices[0].message.content;
}

function problemJson(status, errorType, title) {
  const typeTag = errorType ? `tag:smoche-chatbot.deno.dev/${errorType}` : undefined;
  return new Response(JSON.stringify({ type: typeTag, title }), {
    status,
    headers: {
      "content-type": "application/problem+json",
    }
  });
}


Deno.serve(async (req: Request) => {
  const kvKey = ["smoche-chatbot", "chat-history"];
  const kvEntry = await kv.get<Messages>(kvKey);
  const messages = kvEntry.value ?? [];
  const content = await req.text();

  switch (content) {
    case "/bye":
      await kv.delete(kvKey);
      return new Response(null, { status: 204 });
    case "":
      return problemJson(400, "empty_text", "Text required");
  }
  messages.push({ role: "user", content });

  try {
    const res = `${await chat(messages)}\n`;
    await kv.set(kvKey, messages);
    return new Response(res);
  } catch (e) {
    const message = e.error?.error?.message;
    const errorType = e.error?.error?.type;
    return problemJson(500, errorType, message);
  }
});
