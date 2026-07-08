const IDEAS_FILE_PATH = "ideas.md";

function base64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Decode(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const TAGS = ["electronics", "ceramics", "art", "other"];
const BLOCKER_TYPES = ["time", "materials", "technical", "knowledge", "funding", "unknown"];

async function askClaudeForMetadata(idea, apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 60,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: `Given this idea, respond with ONLY a JSON object (no markdown, no other text) of the form {"title": "...", "tag": "...", "blockers": [...]}.
- "title": a short (max 8 word) title for the idea, no punctuation or quotes.
- "tag": exactly one of ${JSON.stringify(TAGS)}, whichever best categorizes the idea. Use "other" if none fit well.
- "blockers": an array of zero or more of ${JSON.stringify(BLOCKER_TYPES)} describing what's currently blocking progress on this idea (e.g. lack of time, materials, technical know-how, funding). Use "unknown" if something is blocking it but the reason is unclear. Return an empty array [] if the note doesn't mention being blocked on anything.

Idea:
${idea}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const block = data.content && data.content[0];
  if (!block || typeof block.text !== "string") {
    throw new Error(`Unexpected Anthropic response: ${JSON.stringify(data)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(block.text.trim());
  } catch {
    throw new Error(`Anthropic did not return valid JSON: ${block.text}`);
  }

  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const tag = TAGS.includes(parsed.tag) ? parsed.tag : "other";
  const blockers = Array.isArray(parsed.blockers)
    ? parsed.blockers.filter((b) => BLOCKER_TYPES.includes(b))
    : [];
  if (!title) {
    throw new Error(`Anthropic response missing title: ${block.text}`);
  }

  return { title, tag, blockers };
}

async function appendIdeaToGitHub(env, title, tag, blockers, idea) {
  const apiBase = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${IDEAS_FILE_PATH}`;
  const githubHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "user-agent": "idea-garden-worker",
    accept: "application/vnd.github+json",
  };

  const getResponse = await fetch(apiBase, { headers: githubHeaders });

  let existingContent = "";
  let sha;
  if (getResponse.status === 200) {
    const file = await getResponse.json();
    sha = file.sha;
    existingContent = base64Decode(file.content.replace(/\n/g, ""));
  } else if (getResponse.status !== 404) {
    throw new Error(`GitHub GET error: ${getResponse.status} ${await getResponse.text()}`);
  }

  const timestamp = new Date().toISOString();
  const blockerLabel = blockers.length ? ` · \`blocked: ${blockers.join(", ")}\`` : "";
  const entry = `\n## ${title}\n_${timestamp}_ · \`${tag}\`${blockerLabel}\n\n${idea}\n`;
  const newContent = existingContent + entry;

  const putResponse = await fetch(apiBase, {
    method: "PUT",
    headers: githubHeaders,
    body: JSON.stringify({
      message: `Add idea: ${title}`,
      content: base64Encode(newContent),
      sha,
    }),
  });

  if (!putResponse.ok) {
    throw new Error(`GitHub PUT error: ${putResponse.status} ${await putResponse.text()}`);
  }

  return putResponse.json();
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (request.headers.get("x-shared-secret") !== env.SHARED_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let idea;
    try {
      const body = await request.json();
      idea = body.idea;
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    if (!idea || typeof idea !== "string" || !idea.trim()) {
      return new Response("Missing 'idea' field", { status: 400 });
    }

    try {
      const { title, tag, blockers } = await askClaudeForMetadata(idea, env.ANTHROPIC_API_KEY);
      const commit = await appendIdeaToGitHub(env, title, tag, blockers, idea.trim());
      return new Response(
        JSON.stringify({ ok: true, title, tag, blockers, commit: commit.commit.sha }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
};
