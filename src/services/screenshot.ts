import { getGameProfile } from "./games/profiles.js";

export interface ScreenshotResult {
  success: boolean;
  data?: Record<string, any>;   // parsed score data from the vision model
  raw?: string;                  // raw model response
  error?: string;
}

export interface MatchVerification {
  agreed: boolean;
  winnerId?: string;             // platform user ID of the winner
  score?: string;                // human-readable score string
  reason?: string;               // why it failed or disagreed
}

/**
 * Analyze a game screenshot using a vision AI model.
 * Supports OpenAI (GPT-4o) or Anthropic (Claude) — configure via env.
 */
export async function analyzeScreenshot(
  imageUrl: string,
  gameKey: string,
): Promise<ScreenshotResult> {
  const profile = getGameProfile(gameKey);
  if (!profile) return { success: false, error: "Unknown game" };

  const provider = process.env.VISION_PROVIDER;

  // If no vision provider configured, skip OCR entirely
  if (!provider) {
    return { success: false, error: "OCR not configured — using manual verification" };
  }

  try {
    let raw: string;

    if (provider === "openai") {
      if (!process.env.OPENAI_API_KEY) return { success: false, error: "OPENAI_API_KEY not set" };
      raw = await callOpenAI(imageUrl, profile.ocrPrompt);
    } else if (provider === "anthropic") {
      if (!process.env.ANTHROPIC_API_KEY) return { success: false, error: "ANTHROPIC_API_KEY not set" };
      raw = await callAnthropic(imageUrl, profile.ocrPrompt);
    } else {
      return { success: false, error: `Unknown vision provider: ${provider}` };
    }

    // Try to parse JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, raw, error: "No JSON found in model response" };
    }

    const data = JSON.parse(jsonMatch[0]);

    if (data.error) {
      return { success: false, raw, error: data.error };
    }

    return { success: true, data, raw };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function callOpenAI(imageUrl: string, prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ],
      max_tokens: 500,
    }),
  });

  const json = await res.json() as any;
  return json.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(imageUrl: string, prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  // Fetch the image and convert to base64
  const imgRes = await fetch(imageUrl);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mediaType = imgRes.headers.get("content-type") || "image/png";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  const json = await res.json() as any;
  return json.content?.[0]?.text ?? "";
}
