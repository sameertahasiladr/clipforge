/**
 * Gemini AI Analysis Service — ClipForge AI
 * Multimodal semantic analysis, viral hook extraction, and clip candidate ranking.
 * Uses Google Gen AI SDK (@google/genai) with automated model fallback and 503 resilience.
 */

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

export interface ClipCandidate {
  clipNumber: number;
  start: number;
  end: number;
  duration: number;
  title: string;
  hook: string;
  reason: string;
  score: number; // AI Viral Potential Score (70-98)
  suggestedCaption: string;
  hashtags: string[];
  callToAction: string;
  speakerCenterXPercent?: number;
}

export interface VideoAnalysisResult {
  videoTitle: string;
  channelName: string;
  summary: string;
  candidates: ClipCandidate[];
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
    speakerCenterXPercent?: number;
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
  requestedClipsCount: number; // 10, 12, or 15 (default 15)
  durationSeconds: number;     // 13, 14, or 15
  language: string;
  captionStyle: string;
}): Promise<VideoAnalysisResult | null> {
  const clipsCount = Math.min(15, Math.max(10, params.requestedClipsCount || 15));
  const duration = Math.min(15, Math.max(13, params.durationSeconds || 14));

  const ai = getAiClient();
  if (!ai) {
    return null;
  }

  const prompt = `
You are the master viral clip editor and algorithmic content strategist for ClipForge AI.
Analyze the following YouTube video and extract exactly ${clipsCount} distinct, high-retention short vertical clip candidates.

Video URL: ${params.youtubeUrl}
Video Title / Topic: "${params.videoTitle || 'Creator Video'}"
Transcript / Context:
"${params.transcriptSample || 'Discussion exploring mindset, business models, AI acceleration, habit compounding, and personal discipline.'}"

Target Clip Duration: Exactly between 13.0 and 15.0 seconds (target ${duration.toFixed(1)}s).
Language: ${params.language}
Caption Style: ${params.captionStyle}

CRITICAL RULES FOR CLIP SELECTION:
1. Every clip MUST be a complete, self-contained thought. DO NOT start in the middle of a sentence or cut off abruptly before the point is concluded.
2. The Hook MUST seize attention within the first 1.5 seconds (curiosity gap, controversial statement, revelation, or high stakes).
3. Evaluate emotional intensity, important insights, story beats, humor, and surprise.
4. Calculate an "AI Viral Potential Score" from 72 to 98 based on opening strength, retention velocity, and shareability. (Note: this is an internal recommendation score, not a guarantee).
5. Avoid overlapping timestamps unless strictly required. Ensure all ${clipsCount} clips have non-overlapping start/end times.
6. Provide smart speaker center X percentage (typically 48 to 52 for centered host).

Return ONLY valid JSON matching this schema:
{
  "videoTitle": "${params.videoTitle || 'YouTube Video'}",
  "channelName": "Content Creator",
  "summary": "AI summary of key moments",
  "candidates": [
    {
      "clipNumber": 1,
      "start": 12.0,
      "end": 26.0,
      "duration": 14.0,
      "title": "High-impact punchy title",
      "hook": "Opening sentence that stops scrolling",
      "reason": "Why this moment retains viewers",
      "score": 94,
      "suggestedCaption": "Caption optimized for Instagram & YouTube Shorts with CTA",
      "hashtags": ["#shorts", "#reels", "#mindset", "#viral"],
      "callToAction": "Save this for later and follow for more.",
      "speakerCenterXPercent": 50
    }
  ]
}
`;

  try {
    const text = await generateContentWithFallback(ai, prompt, 0.7);
    if (text) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.candidates) && parsed.candidates.length > 0) {
        const candidates: ClipCandidate[] = parsed.candidates.map((c: any, index: number) => ({
          clipNumber: index + 1,
          start: parseFloat(c.start) || (index * 45),
          end: parseFloat(c.end) || (index * 45 + duration),
          duration: parseFloat((c.end - c.start).toFixed(1)) || duration,
          title: c.title || `Clip #${index + 1}`,
          hook: c.hook || 'Watch this critical breakthrough moment...',
          reason: c.reason || 'High emotional resonance and strong opening sentence.',
          score: Math.min(98, Math.max(70, parseInt(c.score, 10) || 85)),
          suggestedCaption: c.suggestedCaption || 'One breakthrough insight can change your entire trajectory.',
          hashtags: Array.isArray(c.hashtags) ? c.hashtags : ['#shorts', '#reels', '#viral'],
          callToAction: c.callToAction || 'Share your thoughts in the comments.',
          speakerCenterXPercent: c.speakerCenterXPercent || 50,
        }));

        const clips = candidates.map((c) => ({
          clipNumber: c.clipNumber,
          title: c.title,
          hook: c.hook,
          description: c.reason,
          suggestedCaption: c.suggestedCaption,
          hashtags: c.hashtags,
          callToAction: c.callToAction,
          aiViralScore: c.score,
          startTimeSeconds: c.start,
          endTimeSeconds: c.end,
          durationSeconds: c.duration,
          rationale: c.reason,
          speakerCenterXPercent: c.speakerCenterXPercent || 50,
        }));

        return {
          videoTitle: parsed.videoTitle || params.videoTitle || 'Analyzed YouTube Video',
          channelName: parsed.channelName || 'YouTube Creator',
          summary: parsed.summary || 'Extracted high-retention vertical clips.',
          candidates,
          clips,
        };
      }
    }
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
Current Title: "${params.clipTitle}"
Current Hook: "${params.hook}"
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
