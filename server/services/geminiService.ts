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
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
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

// Model aliases according to @google/genai standards - using gemini-3.8-flash
const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-flash-latest';

/**
 * Execute content generation using gemini-3.8-flash with fallback to gemini-flash-latest and retry for transient 503/429.
 */
async function generateContentWithGemini(ai: GoogleGenAI, prompt: string, temperature = 0.7): Promise<string | null> {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastErr: any = null;

  for (const modelToUse of models) {
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelToUse,
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
        lastErr = err;
        const isOverloaded =
          err?.status === 503 ||
          err?.code === 503 ||
          err?.message?.includes('503') ||
          err?.message?.includes('high demand') ||
          err?.status === 429;

        if (isOverloaded && attempt < 1) {
          console.log(`[GeminiService] Model ${modelToUse} is experiencing high demand (503/429). Retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 800));
          continue;
        }

        console.warn(`[GeminiService] Attempt failed with model ${modelToUse}:`, err?.message || err);
        break; // Try fallback model
      }
    }
  }

  const geminiErr = new Error(`Gemini analysis failed: ${lastErr?.message || 'No response returned from model.'}`);
  (geminiErr as any).code = 'GEMINI_ANALYSIS_FAILED';
  throw geminiErr;
}

export async function analyzeVideoWithGemini(params: {
  youtubeUrl: string;
  videoTitle?: string;
  transcript: string;
  sourceDuration?: number;
  requestedClipsCount: number; // 10, 12, or 15 (default 15)
  durationSeconds: number;     // 13, 14, or 15
  language: string;
  captionStyle: string;
}): Promise<VideoAnalysisResult> {
  const clipsCount = Math.min(15, Math.max(10, params.requestedClipsCount || 15));
  const duration = Math.min(15, Math.max(13, params.durationSeconds || 14));

  const ai = getAiClient();
  if (!ai) {
    const err = new Error('AI analysis is unavailable. Please configure GEMINI_API_KEY.');
    (err as any).code = 'GEMINI_ANALYSIS_FAILED';
    throw err;
  }

  if (!params.transcript || !params.transcript.trim()) {
    const err = new Error('AI analysis requires an actual transcript generated from the source video.');
    (err as any).code = 'GEMINI_ANALYSIS_FAILED';
    throw err;
  }

  const prompt = `
You are the master viral clip editor and algorithmic content strategist for ClipForge AI.
Analyze the following video content and extract exactly ${clipsCount} distinct, high-retention short vertical clip candidates.

Video Source: ${params.youtubeUrl || 'Direct Video Upload'}
Video Title Context: "${params.videoTitle || 'Source Video'}"
Verified Source Transcript:
"""
${params.transcript.trim()}
"""

Target Clip Duration: Exactly between 13.0 and 15.0 seconds (target ${duration.toFixed(1)}s).
Language: ${params.language}
Caption Style: ${params.captionStyle}

CRITICAL RULES FOR CLIP SELECTION:
1. Every clip MUST be a complete, self-contained thought. DO NOT cut off mid-sentence.
2. The Hook MUST seize attention within the first 1.5 seconds.
3. Calculate an "AI Viral Potential Score" between 70 and 98 based on opening hook strength and retention velocity.
4. Ensure non-overlapping timestamps across the clips.
5. Provide speaker center X percentage (typically 48 to 52 for centered host).

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
      "title": "High-impact title",
      "hook": "Opening sentence that stops scrolling",
      "reason": "Why this moment retains viewers",
      "score": 94,
      "suggestedCaption": "Caption optimized for Instagram & YouTube Shorts",
      "hashtags": ["#shorts", "#reels", "#mindset", "#viral"],
      "callToAction": "Save this for later and follow for more.",
      "speakerCenterXPercent": 50
    }
  ]
}
`;

  try {
    const text = await generateContentWithGemini(ai, prompt, 0.7);
    if (text) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.candidates) && parsed.candidates.length > 0) {
        const candidates: ClipCandidate[] = [];
        
        for (const c of parsed.candidates) {
          const start = parseFloat(c.start);
          const end = parseFloat(c.end);
          if (isNaN(start) || isNaN(end)) continue;
          if (start < 0 || end <= start) continue;
          if (params.sourceDuration && params.sourceDuration > 0 && end > params.sourceDuration + 1.0) continue;
          
          const dur = parseFloat((end - start).toFixed(1));
          if (dur < 13 || dur > 15) continue;
          
          if (!c.title || typeof c.title !== 'string' || !c.title.trim()) continue;
          if (!c.hook || typeof c.hook !== 'string' || !c.hook.trim()) continue;
          if (!c.reason || typeof c.reason !== 'string' || !c.reason.trim()) continue;

          candidates.push({
            clipNumber: candidates.length + 1,
            start: parseFloat(start.toFixed(2)),
            end: parseFloat(end.toFixed(2)),
            duration: dur,
            title: c.title.trim(),
            hook: c.hook.trim(),
            reason: c.reason.trim(),
            score: Math.min(98, Math.max(70, parseInt(c.score, 10) || 85)),
            suggestedCaption: (c.suggestedCaption || c.title).trim(),
            hashtags: Array.isArray(c.hashtags) && c.hashtags.length > 0 ? c.hashtags : ['#shorts', '#reels', '#viral'],
            callToAction: (c.callToAction || 'Follow for more.').trim(),
            speakerCenterXPercent: typeof c.speakerCenterXPercent === 'number' ? c.speakerCenterXPercent : 50,
          });
        }

        if (candidates.length === 0) {
          const emptyErr = new Error('Gemini analysis failed: model response did not produce valid clips satisfying duration (13-15s) and bounds.');
          (emptyErr as any).code = 'GEMINI_ANALYSIS_FAILED';
          throw emptyErr;
        }

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
    const err = new Error('Gemini analysis failed: model response did not contain valid clip candidates.');
    (err as any).code = 'GEMINI_ANALYSIS_FAILED';
    throw err;
  } catch (error: any) {
    console.error('[GeminiService] Error during Gemini analysis:', error);
    const finalErr = new Error(error?.message || 'Gemini analysis failed.');
    (finalErr as any).code = error?.code || 'GEMINI_ANALYSIS_FAILED';
    throw finalErr;
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
    const text = await generateContentWithGemini(ai, prompt, 0.8);
    if (text) {
      return JSON.parse(text);
    }
    return null;
  } catch (error) {
    console.warn('[GeminiService] Caption regeneration error:', error);
    return null;
  }
}
