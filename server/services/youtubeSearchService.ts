import { spawn } from 'child_process';
import { YouTubeService } from './youtubeService.ts';
import { CookieService } from './cookieService.ts';

export interface YouTubeSearchResult {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId?: string;
  channelUrl?: string;
  thumbnailUrl: string;
  durationSeconds: number;
  durationFormatted: string;
  publishedAt?: string;
  viewCount?: number;
  url: string;
  source: 'youtube_data_api' | 'youtube_direct_index';
}

function parseIsoDuration(duration: string): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatSeconds(sec: number): string {
  if (!sec || isNaN(sec) || sec < 0) return '0:00';
  const totalSec = Math.floor(sec);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const h = Math.floor(m / 60);
  if (h > 0) {
    const remM = m % 60;
    return `${h}:${remM < 10 ? '0' : ''}${remM}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export class YouTubeSearchService {
  /**
   * Searches for videos by keyword or channel URL/handle using YouTube Data API v3
   * with seamless fallback to fast direct playlist/search indexing.
   */
  public static async searchVideos(
    query: string,
    maxResults: number = 12
  ): Promise<{ results: YouTubeSearchResult[]; apiUsed: string; query: string }> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return { results: [], apiUsed: 'none', query: '' };
    }

    const apiKey = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY;

    // 1. Attempt official YouTube Data API v3 if API key is configured
    if (apiKey) {
      try {
        const apiResults = await this.searchViaYouTubeDataApi(cleanQuery, maxResults, apiKey);
        if (apiResults && apiResults.length > 0) {
          return {
            results: apiResults,
            apiUsed: 'youtube_data_api_v3',
            query: cleanQuery,
          };
        }
      } catch (err: any) {
        console.warn(
          '[YouTubeSearchService] YouTube Data API v3 error, switching to direct search indexing:',
          err?.message || err
        );
      }
    }

    // 2. Direct public web search index (Fast, robust, zero dependencies)
    try {
      const publicResults = await this.searchViaPublicScrape(cleanQuery, maxResults);
      if (publicResults && publicResults.length > 0) {
        return {
          results: publicResults,
          apiUsed: 'youtube_web_search',
          query: cleanQuery,
        };
      }
    } catch (publicErr) {
      console.warn('[YouTubeSearchService] Notice during public search fallback:', publicErr);
    }

    // 3. Direct fast yt-dlp indexing fallback
    const directResults = await this.searchViaDirectIndexing(cleanQuery, maxResults);
    return {
      results: directResults,
      apiUsed: 'youtube_direct_index',
      query: cleanQuery,
    };
  }

  /**
   * Executes search via official Google YouTube Data API v3
   */
  private static async searchViaYouTubeDataApi(
    query: string,
    maxResults: number,
    apiKey: string
  ): Promise<YouTubeSearchResult[]> {
    const isChannelUrl =
      query.includes('youtube.com/@') ||
      query.includes('youtube.com/channel/') ||
      query.includes('youtube.com/c/') ||
      query.startsWith('@');

    let channelId: string | null = null;

    if (isChannelUrl) {
      channelId = await this.resolveChannelId(query, apiKey);
    }

    let searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${Math.min(
      25,
      maxResults
    )}&type=video&key=${apiKey}`;

    if (channelId) {
      searchUrl += `&channelId=${encodeURIComponent(channelId)}&order=date`;
    } else {
      searchUrl += `&q=${encodeURIComponent(query)}`;
    }

    const searchRes = await fetch(searchUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });

    if (!searchRes.ok) {
      const errBody = await searchRes.text();
      const isHtml = errBody.includes('<!DOCTYPE') || errBody.includes('<html');
      throw new Error(isHtml ? 'YouTube Data API returned an error page' : `YouTube Data API returned ${searchRes.status}: ${errBody.slice(0, 150)}`);
    }

    const searchContentType = searchRes.headers.get('content-type') || '';
    if (!searchContentType.includes('application/json')) {
      return [];
    }

    const searchData: any = await searchRes.json();
    const items = searchData.items || [];
    if (items.length === 0) return [];

    const videoIds = items
      .map((item: any) => item.id?.videoId)
      .filter((id: any): id is string => typeof id === 'string' && id.length > 0);

    if (videoIds.length === 0) return [];

    // Fetch video details for durations and view counts
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(
      ','
    )}&key=${apiKey}`;

    const detailsRes = await fetch(detailsUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });

    const detailsMap = new Map<string, any>();
    const detailsContentType = detailsRes.headers.get('content-type') || '';
    if (detailsRes.ok && detailsContentType.includes('application/json')) {
      const detailsData: any = await detailsRes.json();
      for (const v of detailsData.items || []) {
        detailsMap.set(v.id, v);
      }
    }

    return items.map((item: any) => {
      const videoId = item.id.videoId;
      const details = detailsMap.get(videoId);
      const snippet = details?.snippet || item.snippet;
      const contentDetails = details?.contentDetails;
      const statistics = details?.statistics;

      const durationSec = contentDetails?.duration
        ? parseIsoDuration(contentDetails.duration)
        : 0;

      const thumb =
        snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.medium?.url ||
        snippet.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      return {
        id: videoId,
        title: snippet.title || 'Untitled Video',
        description: snippet.description || '',
        channelTitle: snippet.channelTitle || 'YouTube Creator',
        channelId: snippet.channelId,
        channelUrl: snippet.channelId
          ? `https://www.youtube.com/channel/${snippet.channelId}`
          : undefined,
        thumbnailUrl: thumb,
        durationSeconds: durationSec,
        durationFormatted: formatSeconds(durationSec),
        publishedAt: snippet.publishedAt,
        viewCount: statistics?.viewCount ? parseInt(statistics.viewCount, 10) : undefined,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        source: 'youtube_data_api',
      };
    });
  }

  /**
   * Resolves a channel URL or handle into a canonical channel ID
   */
  private static async resolveChannelId(input: string, apiKey: string): Promise<string | null> {
    try {
      // Check for direct UC channel ID
      const directMatch = input.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
      if (directMatch) return directMatch[1];

      // Check for handle e.g. @hubermanlab
      let handle = '';
      const handleMatch = input.match(/@([a-zA-Z0-9_.-]+)/);
      if (handleMatch) {
        handle = handleMatch[1];
      } else if (input.startsWith('@')) {
        handle = input.slice(1);
      }

      if (handle) {
        const handleRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(
            handle
          )}&key=${apiKey}`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (handleRes.ok) {
          const data: any = await handleRes.json();
          if (data.items && data.items.length > 0) {
            return data.items[0].id;
          }
        }
      }
    } catch {}
    return null;
  }

  /**
   * High-speed direct metadata indexing via yt-dlp flat-playlist mode
   */
  private static async searchViaDirectIndexing(
    query: string,
    maxResults: number
  ): Promise<YouTubeSearchResult[]> {
    const ytdlp = await YouTubeService.ensureYtDlp();
    if (!ytdlp) return [];

    let targetSpec = '';
    const isChannel =
      query.includes('youtube.com/@') ||
      query.includes('youtube.com/channel/') ||
      query.includes('youtube.com/c/') ||
      query.startsWith('@');

    if (isChannel) {
      let channelUrl = query.trim();
      if (channelUrl.startsWith('@')) {
        channelUrl = `https://www.youtube.com/${channelUrl}`;
      }
      if (!channelUrl.endsWith('/videos')) {
        channelUrl = channelUrl.replace(/\/$/, '') + '/videos';
      }
      targetSpec = channelUrl;
    } else {
      targetSpec = `ytsearch${Math.min(20, maxResults)}:${query}`;
    }

    const cookieArgs = CookieService.getYtDlpCookieArgs();
    const args = [
      '--socket-timeout',
      '8',
      '--flat-playlist',
      ...cookieArgs,
      ...(isChannel ? ['--playlist-end', String(Math.min(20, maxResults))] : []),
      '-j',
      targetSpec,
    ];

    return new Promise<YouTubeSearchResult[]>((resolve) => {
      const proc = spawn(ytdlp, args, {
        env: {
          ...process.env,
          PYTHONWARNINGS: 'ignore',
        },
      });

      let stdout = '';
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        resolve(this.parseYtDlpJsonLines(stdout));
      }, 10000);

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', () => {});

      proc.on('close', () => {
        clearTimeout(timeout);
        resolve(this.parseYtDlpJsonLines(stdout));
      });

      proc.on('error', () => {
        clearTimeout(timeout);
        resolve([]);
      });
    });
  }

  /**
   * Parses JSON-line stream from yt-dlp flat-playlist output
   */
  private static parseYtDlpJsonLines(raw: string): YouTubeSearchResult[] {
    const results: YouTubeSearchResult[] = [];
    const lines = raw.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;

      try {
        const item = JSON.parse(trimmed);
        const videoId = item.id || item.url?.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
        if (!videoId) continue;

        let thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        if (Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
          thumb = item.thumbnails[item.thumbnails.length - 1].url || thumb;
        }

        const durationSec = typeof item.duration === 'number' ? item.duration : 0;
        const durFormatted = item.duration_string || formatSeconds(durationSec);

        results.push({
          id: videoId,
          title: item.title || 'Untitled Video',
          description: item.description || '',
          channelTitle: item.channel || item.uploader || 'YouTube Creator',
          channelId: item.channel_id,
          channelUrl: item.channel_url || item.uploader_url,
          thumbnailUrl: thumb,
          durationSeconds: durationSec,
          durationFormatted: durFormatted,
          viewCount: typeof item.view_count === 'number' ? item.view_count : undefined,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          source: 'youtube_direct_index',
        });
      } catch {}
    }

    return results;
  }

  /**
   * Fast, reliable web search index via public YouTube results.
   * Extracts top video results without requiring any API keys or local binaries.
   */
  private static async searchViaPublicScrape(
    query: string,
    maxResults: number = 15
  ): Promise<YouTubeSearchResult[]> {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];
    const html = await res.text();
    const match =
      html.match(/var ytInitialData = ({.*?});<\/script>/s) ||
      html.match(/ytInitialData\s*=\s*({.+?});/);

    if (!match) return [];
    let data: any;
    try {
      data = JSON.parse(match[1]);
    } catch {
      return [];
    }

    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];

    const results: YouTubeSearchResult[] = [];

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const it of items) {
        if (results.length >= maxResults) break;
        const vr = it?.videoRenderer;
        if (!vr || !vr.videoId) continue;

        const videoId = vr.videoId;
        const title = vr.title?.runs?.map((r: any) => r.text).join('') || 'YouTube Video';
        const channelTitle =
          vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || 'Creator';
        const durationFormatted = vr.lengthText?.simpleText || '0:00';

        // Parse duration seconds from MM:SS or HH:MM:SS
        const parts = durationFormatted.split(':').map((p: string) => parseInt(p, 10));
        let durationSeconds = 0;
        if (parts.length === 3) {
          durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          durationSeconds = parts[0] * 60 + parts[1];
        }

        const thumb =
          vr.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        const viewStr = vr.viewCountText?.simpleText || '';
        const viewMatch = viewStr.replace(/,/g, '').match(/(\d+)/);
        const viewCount = viewMatch ? parseInt(viewMatch[1], 10) : undefined;

        results.push({
          id: videoId,
          title,
          description: vr.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join('') || '',
          channelTitle,
          thumbnailUrl: thumb,
          durationSeconds,
          durationFormatted,
          viewCount,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          source: 'youtube_direct_index',
        });
      }
    }

    return results;
  }
}
