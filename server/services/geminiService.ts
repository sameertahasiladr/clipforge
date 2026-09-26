/**
 * Gemini AI Analysis Service — ClipForge AI
 * Multimodal semantic analysis, viral hook extraction, and clip candidate ranking.
 * Uses Google Gen AI SDK (@google/genai) with automated model fallback and 503 resilience.
 */

import { GoogleGenAI } from '@google/genai';
import { parseGeminiJsonResponse } from './jsonParser.ts';

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

// Model cascade with high-availability fallbacks
const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const SECONDARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-flash-latest';

/**
 * Execute content generation using gemini-3.1-flash-lite with fallback to gemini-3.8-flash / gemini-flash-latest and retry for transient 503/429.
 */
async function generateContentWithGemini(ai: GoogleGenAI, prompt: string, temperature = 0.7): Promise<string | null> {
  const models = [PRIMARY_MODEL, SECONDARY_MODEL, FALLBACK_MODEL];
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
        const errStr = (err?.message || JSON.stringify(err) || '').toLowerCase();
        const isQuotaExceeded =
          err?.status === 429 ||
          err?.code === 429 ||
          errStr.includes('quota') ||
          errStr.includes('resource_exhausted') ||
          errStr.includes('rate-limit');

        if (isQuotaExceeded) {
          console.log(`[GeminiService] Model ${modelToUse} quota limit reached. Switching immediately to next available model in cascade...`);
          break; // Switch to next model immediately without waiting
        }

        const isOverloaded =
          err?.status === 503 ||
          err?.code === 503 ||
          errStr.includes('503') ||
          errStr.includes('high demand') ||
          errStr.includes('unavailable');

        if (isOverloaded && attempt < 1) {
          console.log(`[GeminiService] Model ${modelToUse} is experiencing high demand (503). Retrying in 800ms...`);
          await new Promise((resolve) => setTimeout(resolve, 800));
          continue;
        }

        console.log(`[GeminiService] Model ${modelToUse} notice, checking next fallback model...`);
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
  const clipsCount = Math.min(30, Math.max(1, Number(params.requestedClipsCount) || 5));
  const duration = Math.min(180, Math.max(5, Number(params.durationSeconds) || 30));

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
Analyze the following video content and extract EXACTLY ${clipsCount} distinct, high-retention short vertical clip candidates.

Video Source: ${params.youtubeUrl || 'Direct Video Upload'}
Video Title Context: "${params.videoTitle || 'Source Video'}"
Verified Source Transcript:
"""
${params.transcript.trim()}
"""

Target Clip Duration: Approximately ${duration.toFixed(0)} seconds (between ${Math.max(3, duration - 6).toFixed(0)} and ${(duration + 6).toFixed(0)} seconds).
Language: ${params.language}
Caption Style: ${params.captionStyle}

CRITICAL RULES FOR CLIP SELECTION:
1. You MUST extract and return EXACTLY ${clipsCount} candidate objects in the "candidates" array. Do not return fewer than ${clipsCount} items.
2. Every clip MUST be a complete, self-contained thought. DO NOT cut off mid-sentence.
3. The Hook MUST seize attention within the first 1.5 seconds.
4. Calculate an "AI Viral Potential Score" between 70 and 98 based on opening hook strength and retention velocity.
5. Ensure distinct, non-overlapping timestamps across the clips.
6. Provide speaker center X percentage (typically 48 to 52 for centered host).

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
    if (!text || !text.trim()) {
      const emptyErr = new Error('Gemini returned an empty response during clip analysis.');
      (emptyErr as any).code = 'GEMINI_ANALYSIS_FAILED';
      throw emptyErr;
    }

    let parsed: any = null;
    try {
      parsed = parseGeminiJsonResponse(text);
    } catch (parseErr: any) {
      const err = new Error(`Failed to parse Gemini clip analysis response: ${parseErr.message}`);
      (err as any).code = 'GEMINI_PARSE_FAILED';
      throw err;
    }

    let rawCandidates: any[] = [];
    if (Array.isArray(parsed)) {
      rawCandidates = parsed;
    } else if (Array.isArray(parsed?.candidates)) {
      rawCandidates = parsed.candidates;
    } else if (Array.isArray(parsed?.clips)) {
      rawCandidates = parsed.clips;
    } else if (Array.isArray(parsed?.items)) {
      rawCandidates = parsed.items;
    }

    if (rawCandidates.length === 0) {
      const err = new Error('Gemini returned zero clip candidates in the response.');
      (err as any).code = 'GEMINI_ANALYSIS_FAILED';
      throw err;
    }

    const isShortVideo = Boolean(params.sourceDuration && params.sourceDuration < 13);
    const minDur = isShortVideo ? 1 : Math.max(3, duration - 6);
    const maxDur = isShortVideo ? (params.sourceDuration || 12) : Math.min(180, duration + 6);
    const sourceMax = params.sourceDuration && params.sourceDuration > 0 ? params.sourceDuration : Infinity;

    const candidates: ClipCandidate[] = [];

    for (const c of rawCandidates) {
      if (!c || typeof c !== 'object') continue;
      const start = parseFloat(c.start ?? c.startTime ?? c.startTimeSeconds ?? c.start_time);
      const rawEnd = parseFloat(c.end ?? c.endTime ?? c.endTimeSeconds ?? c.end_time);

      if (isNaN(start) || start < 0) continue;
      if (isNaN(rawEnd) || rawEnd <= start) continue;
      if (start >= sourceMax) continue;

      const clampedEnd = Math.min(rawEnd, sourceMax);
      const dur = parseFloat((clampedEnd - start).toFixed(2));

      // Reject candidates whose duration is outside acceptable bounds
      if (dur < minDur || (dur > maxDur && maxDur > minDur)) {
        continue;
      }

      const title = (c.title || c.clipTitle || c.name || '').toString().trim();
      const hook = (c.hook || c.openingHook || c.hookText || '').toString().trim();
      if (!title && !hook) continue;

      const reason = (c.reason || c.rationale || c.description || 'High retention highlight moment').toString().trim();

      candidates.push({
        clipNumber: candidates.length + 1,
        start: parseFloat(start.toFixed(2)),
        end: parseFloat(clampedEnd.toFixed(2)),
        duration: dur,
        title: title || hook,
        hook: hook || title,
        reason,
        score: Math.min(98, Math.max(70, parseInt(c.score || c.aiViralScore || c.viralScore, 10) || 88)),
        suggestedCaption: (c.suggestedCaption || c.caption || title || hook).toString().trim(),
        hashtags: Array.isArray(c.hashtags) && c.hashtags.length > 0 ? c.hashtags : ['#shorts', '#reels', '#viral'],
        callToAction: (c.callToAction || c.cta || 'Follow for more.').toString().trim(),
        speakerCenterXPercent: typeof c.speakerCenterXPercent === 'number' ? c.speakerCenterXPercent : 50,
      });

      if (candidates.length >= clipsCount) break;
    }

    if (candidates.length === 0) {
      const err = new Error('No valid clip candidates could be extracted from Gemini analysis.');
      (err as any).code = 'GEMINI_ANALYSIS_FAILED';
      throw err;
    }

    // If more than requested count, cap strictly to requested count
    if (candidates.length > clipsCount) {
      candidates.length = clipsCount;
    }

    // Re-index clip numbers 1 through candidates.length
    candidates.forEach((c, idx) => {
      c.clipNumber = idx + 1;
    });

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
        videoTitle: parsed?.videoTitle || params.videoTitle || 'Analyzed Video',
        channelName: parsed?.channelName || 'Content Creator',
        summary: parsed?.summary || 'Extracted high-retention vertical clips.',
        candidates,
        clips,
      };
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
      return parseGeminiJsonResponse(text);
    }
    return null;
  } catch (error) {
    console.warn('[GeminiService] Caption regeneration error:', error);
    return null;
  }
}
