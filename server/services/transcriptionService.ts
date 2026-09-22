/**
 * Transcription Service — ClipForge AI
 * Production Audio extraction (FFmpeg) and Speech-to-Text transcription.
 * Strictly adheres to:
 * - Production Mode requires real audio extraction from actual source video.
 * - If transcription fails, marks project FAILED and throws error.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';

export interface TranscriptSegment {
  startTime: number; // in seconds
  endTime: number;   // in seconds
  text: string;
  speaker: string;
  wordTimings?: Array<{
    word: string;
    start: number;
    end: number;
    highlight?: boolean;
  }>;
}

export interface TranscriptionOptions {
  language: 'English' | 'Hindi' | 'Hinglish' | 'Auto Detect' | string;
  detectSpeakers?: boolean;
  modelTier?: 'standard' | 'enhanced';
}

export class TranscriptionService {
  /**
   * Extracts audio track from video file and converts to 16kHz mono MP3 using FFmpeg
   */
  public static async extractAudio(
    videoPath: string,
    outputAudioPath?: string
  ): Promise<string> {
    if (!videoPath || !fs.existsSync(videoPath)) {
      throw new Error(`Cannot extract audio: source video does not exist at ${videoPath}`);
    }

    const targetAudio =
      outputAudioPath ||
      path.join(
        path.dirname(videoPath),
        `${path.basename(videoPath, path.extname(videoPath))}_audio.mp3`
      );

    if (fs.existsSync(targetAudio) && fs.statSync(targetAudio).size > 1000) {
      return targetAudio;
    }

    return new Promise((resolve, reject) => {
      const ffmpegBinary = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';
      const args = [
        '-y',
        '-i',
        videoPath,
        '-vn',
        '-acodec',
        'libmp3lame',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-b:a',
        '64k',
        targetAudio,
      ];

      const ffmpeg = spawn(ffmpegBinary, args);

      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetAudio)) {
          resolve(targetAudio);
        } else {
          reject(new Error(`FFmpeg audio extraction failed with exit code ${code}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Transcribes actual audio track or generates timestamped segments.
   * Requires actual speech transcription.
   */
  public static async generateTimestampedTranscript(
    contentContext: {
      audioPath?: string;
      videoPath?: string;
      videoTitle: string;
      durationSeconds: number;
    },
    options: TranscriptionOptions
  ): Promise<TranscriptSegment[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    const hasValidKey = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');

    if (!hasValidKey) {
      throw new Error('AI analysis is unavailable. Please configure GEMINI_API_KEY.');
    }

    let audioPath = contentContext.audioPath;

    // If videoPath provided and audioPath missing, extract audio first
    if (!audioPath && contentContext.videoPath && fs.existsSync(contentContext.videoPath)) {
      audioPath = await this.extractAudio(contentContext.videoPath);
    }

    if (!audioPath || !fs.existsSync(audioPath)) {
      throw new Error('Audio extraction failed: no audio file was generated from the source video.');
    }

    // REAL PRODUCTION SPEECH-TO-TEXT WITH GEMINI FROM ACTUAL AUDIO
    const stats = fs.statSync(audioPath);
    if (stats.size === 0) {
      throw new Error('Audio track is empty (0 bytes). Transcription cannot proceed.');
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey!,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const audioBuffer = fs.readFileSync(audioPath);
      const audioBase64 = audioBuffer.toString('base64');

      const prompt = `
You are an expert audio transcriptionist and subtitle timing aligner for ClipForge AI.
Transcribe the speech in this audio track with exact timestamps and speaker identification.
Language: ${options.language}
Video Title Context: "${contentContext.videoTitle}"

Return ONLY valid JSON matching this exact schema:
{
  "segments": [
    {
      "startTime": 0.0,
      "endTime": 4.5,
      "text": "Transcribed speech sentence",
      "speaker": "Host"
    }
  ]
}
`;

      let response;
      const primaryModel = 'gemini-3.6-flash';
      let lastErr: any = null;

      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: primaryModel,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: 'audio/mp3',
                      data: audioBase64,
                    },
                  },
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            config: {
              responseMimeType: 'application/json',
            },
          });
          if (response && response.text) break;
        } catch (err: any) {
          lastErr = err;
          const isOverloaded =
            err?.status === 503 ||
            err?.code === 503 ||
            err?.message?.includes('503') ||
            err?.message?.includes('high demand') ||
            err?.status === 429;

          if (isOverloaded && attempt < 2) {
            console.log(`[TranscriptionService] Model ${primaryModel} is experiencing high demand. Retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 800));
            continue;
          }
          console.warn(`[TranscriptionService] Model ${primaryModel} transcription attempt failed:`, err.message);
        }
      }

      if (!response) {
        const transErr = new Error(`Audio transcription failed: ${lastErr?.message || 'No response returned from Gemini audio transcription model.'}`);
        (transErr as any).code = 'TRANSCRIPTION_FAILED';
        throw transErr;
      }

      if (response.text) {
        const parsed = JSON.parse(response.text);
        if (Array.isArray(parsed.segments) && parsed.segments.length > 0) {
          return parsed.segments.map((seg: any) => ({
            startTime: parseFloat(seg.startTime) || 0,
            endTime: parseFloat(seg.endTime) || (seg.startTime + 4.5),
            text: seg.text,
            speaker: seg.speaker || 'Host',
            wordTimings: this.computeWordTimings(seg.text, seg.startTime, seg.endTime),
          }));
        }
      }
    } catch (err: any) {
      console.error('[TranscriptionService] Direct audio transcription error:', err.message);
      const finalErr = new Error(`Audio transcription failed: ${err?.message || 'Could not transcribe speech from audio track'}`);
      (finalErr as any).code = err?.code || 'TRANSCRIPTION_FAILED';
      throw finalErr;
    }

    const emptyErr = new Error('Audio transcription could not be completed: no speech segments were identified in the source audio.');
    (emptyErr as any).code = 'TRANSCRIPTION_FAILED';
    throw emptyErr;
  }

  /**
   * Computes word-level start and end timestamps for animated subtitles
   */
  public static computeWordTimings(
    text: string,
    startTime: number,
    endTime: number
  ): Array<{ word: string; start: number; end: number; highlight: boolean }> {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const duration = Math.max(0.5, endTime - startTime);
    const timePerWord = duration / words.length;

    return words.map((word, idx) => {
      const start = parseFloat((startTime + idx * timePerWord).toFixed(2));
      const end = parseFloat((start + timePerWord * 0.95).toFixed(2));
      const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');

      const isPowerWord = [
        'never',
        'always',
        'secret',
        'mistake',
        'power',
        'money',
        'viral',
        'truth',
        'stop',
        'first',
        'biggest',
        'million',
        'billion',
      ].includes(clean) || /\d/.test(word);

      return {
        word,
        start,
        end,
        highlight: isPowerWord,
      };
    });
  }
}
