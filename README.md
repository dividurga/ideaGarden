# ideaGarden

A Cloudflare Worker that receives an idea (e.g. shared from your phone via an iOS Shortcut), asks Claude to give it a title, categorize it, and flag any blockers, then commits it as a new entry in `ideas.md` in this repo. A garden of flowers is programatically generated using digital art I made on Procreate. 

## How it works

1. You send a POST request to the Worker with `{"idea": "some text"}` and a shared-secret header.

2. The Worker calls the Anthropic API to generate:

   * a short title
   * a `tag` (`electronics`, `ceramics`, `art`, or `other`)
   * a `blockers` array, such as `["time", "materials"]`, when the note mentions something preventing the idea from moving forward

3. The Worker commits the new entry to `ideas.md` in this repository through the GitHub API.

4. Each idea is then visualized as a procedurally assembled flower. I illustrated every petal, leaf, stem, and decorative element myself in Procreate, then exported them as a library of reusable assets. The program randomly combines these handmade elements, along with different colors and flower structures, to generate a large variety of distinct flowers. Carefully defined pivot points allow the pieces to connect naturally and support subtle animations, giving the idea garden a dynamic, organic feel while preserving the character of the original artwork.


## Setup

### 1. Install Wrangler

```
npm install -g wrangler
```

### 2. Log in to Cloudflare

```
wrangler login
```

Opens a browser to authorize with your Cloudflare account. The free tier is enough (no credit card needed).

### 3. Configure `wrangler.toml`

Edit `GITHUB_OWNER` and `GITHUB_REPO` in [wrangler.toml](wrangler.toml) to match your GitHub username and the repo you want ideas committed to.

### 4. Create a GitHub personal access token

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token:

- **Repository access**: only the repo you configured above
- **Repository permissions**: **Contents → Read and write** (this is the only permission needed — leave everything else as default/no access)

Copy the token value once generated (GitHub only shows it once).

### 5. Set your secrets

These are encrypted by Cloudflare and never touch this repo:

```
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GITHUB_TOKEN
wrangler secret put SHARED_SECRET
```

Each command prompts you to paste the value on the next line — don't pass it as a command-line argument, since that leaks it into your shell history.

- **ANTHROPIC_API_KEY**: from [console.anthropic.com](https://console.anthropic.com) → API Keys.
- **GITHUB_TOKEN**: the token from step 4.
- **SHARED_SECRET**: make up any random password string. This is what stops a stranger who finds your Worker's URL from spamming fake ideas into your repo.

### 6. Deploy

```
wrangler deploy
```

This gives you a live URL like `https://idea-garden-worker.<your-subdomain>.workers.dev`.

### 7. Test it

```
curl -i -X POST https://idea-garden-worker.<your-subdomain>.workers.dev \
  -H "content-type: application/json" \
  -H "x-shared-secret: <your shared secret>" \
  -d '{"idea": "test idea from terminal"}'
```

A successful response looks like:

```json
{"ok":true,"title":"...","tag":"...","blockers":[],"commit":"<sha>"}
```

## iOS Shortcut setup

This lets you share text (e.g. from Notes, or dictated on the spot) straight into the Worker.

1. Open the **Shortcuts** app → create a new shortcut.
2. Add **Receive [Apps and other types]** from **Share Sheet**, with "If there's no input: Continue".
3. Add an **If** action: `Shortcut Input` **has any value**.
4. Inside the `If`, add **Get text from** `Shortcut Input` — this converts whatever you shared (a Note, selected text, etc.) into plain text.
5. Add **Get Contents of URL**:
   - **URL**: your Worker URL from step 6 above
   - **Method**: `POST`
   - **Headers**: add `x-shared-secret` → your shared secret from setup step 5
   - **Request Body**: `JSON`, with one field `idea` set to the output of the **Get text from** step (not the raw `Shortcut Input`)
6. (Optional) Add **Show Result** after "Get Contents of URL" so you can see the Worker's response when testing.
7. Rename the shortcut (e.g. "Idea Garden") and enable it in the Share Sheet under Shortcut Details.

Now you can share any text or note on your phone straight to this Worker, and it'll show up as a new entry in `ideas.md`.

## Files

- [idea-garden-worker.js](idea-garden-worker.js) — the Worker source.
- [wrangler.toml](wrangler.toml) — Worker config (non-secret env vars only).
- [index.html](index.html) — main idea garden page, served via GitHub Pages.
