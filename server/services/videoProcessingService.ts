/**
 * Video Processing Service — ClipForge AI
 * Dedicated FFmpeg video manipulation, intelligent 9:16 re-framing,
 * active speaker centering, audio extraction, and subtitle generation.
 */

export interface CropParameters {
  sourceWidth: number;
  sourceHeight: number;
  targetAspectRatio: '9:16' | '1:1' | '16:9';
  speakerCenterXPercent: number; // 0 to 100
}

export interface RenderJobSpec {
  clipId: string;
  sourceVideoPath: string;
  startTime: number;
  duration: number;
  cropParams: CropParameters;
  captionConfig: {
    style: 'minimal' | 'bold' | 'dynamic' | 'highlight';
    fontFamily: string;
    position: 'top' | 'middle' | 'bottom';
    watermarkText?: string;
    watermarkEnabled: boolean;
  };
}

export class VideoProcessingService {
  /**
   * Verify content rights confirmation before processing any video
   */
  public static verifyContentRights(hasUserConfirmedRights: boolean): boolean {
    if (!hasUserConfirmedRights) {
      throw new Error(
        'Content rights verification required: Only upload or process content you own or have permission to use.'
      );
    }
    return true;
  }

  /**
   * Generates FFmpeg CLI commands for production execution
   * e.g. ffmpeg -ss 00:03:42 -i input.mp4 -t 14.5 -filter_complex "[0:v]crop=w=ih*(9/16):h=ih:x=(iw-ow)/2:y=0,subtitles=caps.ass[v]" -c:a aac output.mp4
   */
  public static generateFfmpegCommand(spec: RenderJobSpec, outputPath: string): string {
    const { startTime, duration, cropParams, captionConfig } = spec;
    const startStr = new Date(startTime * 1000).toISOString().substring(11, 19);

    let cropFilter = '';
    if (cropParams.targetAspectRatio === '9:16') {
      // Intelligent speaker tracking crop
      cropFilter = `crop=w=ih*(9/16):h=ih:x='min(max(0, iw*(${cropParams.speakerCenterXPercent}/100) - (ow/2)), iw-ow)':y=0`;
    } else if (cropParams.targetAspectRatio === '1:1') {
      cropFilter = `crop=w=ih:h=ih:x=(iw-ow)/2:y=0`;
    } else {
      cropFilter = `scale=1920:1080`;
    }

    const watermarkFilter = captionConfig.watermarkEnabled && captionConfig.watermarkText
      ? `,drawtext=text='${captionConfig.watermarkText}':x=w-tw-30:y=60:fontsize=22:fontcolor=white@0.8:box=1:boxcolor=black@0.4:boxborderw=6`
      : '';

    return `ffmpeg -y -ss ${startStr} -i "${spec.sourceVideoPath}" -t ${duration.toFixed(2)} -filter_complex "[0:v]${cropFilter}${watermarkFilter}[outv]" -map "[outv]" -map 0:a -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k "${outputPath}"`;
  }

  /**
   * Generates realistic word-by-word karaoke timing data for dynamic captions
   */
  public static generateWordTimings(
    fullText: string,
    startOffsetSec: number,
    durationSec: number
  ): Array<{ word: string; start: number; end: number; highlight: boolean }> {
    const words = fullText.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const timePerWord = durationSec / words.length;
    return words.map((word, index) => {
      const start = parseFloat((startOffsetSec + index * timePerWord).toFixed(2));
      const end = parseFloat((start + timePerWord * 0.95).toFixed(2));
      // Keyword highlighting rule: highlight numbers, uppercase words, or words > 6 letters
      const isClean = word.replace(/[^a-zA-Z0-9]/g, '');
      const highlight =
        /\d/.test(word) ||
        isClean.length >= 7 ||
        ['never', 'always', 'mistake', 'secret', 'money', 'power', 'success', 'truth'].includes(
          isClean.toLowerCase()
        );

      return {
        word,
        start,
        end,
        highlight,
      };
    });
  }

  /**
   * Generates mock audio waveform levels for timeline rendering
   */
  public static generateWaveformPeaks(barsCount: number = 60): number[] {
    const peaks: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      // Natural speech rhythm curve
      const base = 0.2 + 0.6 * Math.abs(Math.sin((i / 8) * Math.PI));
      const jitter = (Math.random() * 0.2 - 0.1);
      peaks.push(Math.min(1.0, Math.max(0.1, parseFloat((base + jitter).toFixed(2)))));
    }
    return peaks;
  }
}
