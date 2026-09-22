import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export interface VideoAnalysisResult {
  videoTitle: string;
  channelName: string;
  summary: string;
  clips: Array<{
    clipNumber: number;
    title: string;
    hook: string;
    description: string;
    suggestedCaption: string;
    hashtags: string[];
    callToAction: string;
    aiViralScore: number;
    startTimeSeconds: number;
    endTimeSeconds: number;
    durationSeconds: number;
    rationale: string;
  }>;
}

const CANDIDATE_MODELS = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-2.5-flash-lite'];

/**
 * Execute content generation with fallback across models and handling for 503 high demand.
 */
async function generateContentWithFallback(ai: GoogleGenAI, prompt: string, temperature = 0.7): Promise<string | null> {
  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature,
        },
      });

      if (response.text) {
        return response.text;
      }
    } catch (err: any) {
      const isOverloaded =
        err?.status === 503 ||
        err?.code === 503 ||
        err?.message?.includes('503') ||
        err?.message?.includes('high demand') ||
        err?.status === 429;

      if (isOverloaded) {
        console.log(`[GeminiService] Model ${model} is experiencing high demand (503/429). Attempting fallback...`);
        // Small delay before trying fallback model
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }

      console.warn(`[GeminiService] Error with model ${model}:`, err?.message || err);
    }
  }

  return null;
}

export async function analyzeVideoWithGemini(params: {
  youtubeUrl: string;
  videoTitle?: string;
  transcriptSample?: string;
  requestedClipsCount: number;
  durationSeconds: number;
  language: string;
  captionStyle: string;
}): Promise<VideoAnalysisResult | null> {
  const ai = getAiClient();
  if (!ai) {
    // Graceful fallback to built-in intelligent moment generator
    return null;
  }

  const prompt = `
You are the master viral clip editor and algorithmic content strategist for ClipForge AI.
Analyze the following YouTube video request and extract the ${params.requestedClipsCount} most potent, engaging, high-retention short vertical clips.

Video URL: ${params.youtubeUrl}
Video Title / Context: ${params.videoTitle || 'YouTube Video Discussion'}
Transcript Sample or Context: ${params.transcriptSample || 'Podcast interview discussing mindset, business tactics, future of tech, psychology, and personal breakthrough moments.'}
Target Duration: approximately ${params.durationSeconds} seconds each (must be between 13.0 and 15.0 seconds).
Language: ${params.language}
Caption Style: ${params.captionStyle}

CRITICAL RULES:
1. Every clip must have a single standalone self-contained idea with no awkward cut-offs.
2. The Hook must seize attention within the first 1.5 seconds (curiosity, controversy, revelation, or high stakes).
3. Score each clip with an "AI Viral Potential Score" from 70 to 98 based on opening strength, emotional intensity, information density, curiosity, and shareability. (Do NOT claim guaranteed virality, it is an internal score).
4. Provide structured JSON.

Return ONLY a valid JSON object matching this schema:
{
  "videoTitle": string,
  "channelName": string,
  "summary": string,
  "clips": [
    {
      "clipNumber": number,
      "title": string,
      "hook": string,
      "description": string,
      "suggestedCaption": string,
      "hashtags": ["#tag1", "#tag2", "#tag3"],
      "callToAction": string,
      "aiViralScore": number,
      "startTimeSeconds": number,
      "endTimeSeconds": number,
      "durationSeconds": number,
      "rationale": string
    }
  ]
}
`;

  try {
    const text = await generateContentWithFallback(ai, prompt, 0.7);
    if (text) {
      const parsed = JSON.parse(text) as VideoAnalysisResult;
      return parsed;
    }
    console.log('[GeminiService] Remote models unavailable or busy, smoothly falling back to local analysis engine.');
    return null;
  } catch (error) {
    console.log('[GeminiService] Falling back to local analysis engine.');
    return null;
  }
}

export async function regenerateCaptionWithGemini(params: {
  clipTitle: string;
  hook: string;
  tone: 'hype' | 'professional' | 'question' | 'storyteller';
  platform: 'instagram' | 'youtube' | 'facebook';
}): Promise<{
  title: string;
  hook: string;
  caption: string;
  description: string;
  hashtags: string[];
  callToAction: string;
} | null> {
  const ai = getAiClient();
  if (!ai) return null;

  const prompt = `
You are an expert copywriter for ClipForge AI.
Generate fresh short-form captions and hook for this clip:
Current Title: ${params.clipTitle}
Current Hook: ${params.hook}
Tone: ${params.tone}
Target Platform: ${params.platform}

Return ONLY valid JSON:
{
  "title": string,
  "hook": string,
  "caption": string,
  "description": string,
  "hashtags": string[],
  "callToAction": string
}
`;

  try {
    const text = await generateContentWithFallback(ai, prompt, 0.8);
    if (text) {
      return JSON.parse(text);
    }
    return null;
  } catch (error) {
    console.log('[GeminiService] Caption regeneration fell back to local generation.');
    return null;
  }
}
