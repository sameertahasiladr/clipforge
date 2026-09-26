/**
 * Resilient JSON Parser for LLM Responses — ClipForge AI
 *
 * LLMs (including Gemini) frequently return JSON with:
 * 1. Markdown code blocks (```json ... ```)
 * 2. Trailing text or notes after the JSON (causing "Unexpected non-whitespace character after JSON")
 * 3. Leading introductory remarks before the JSON
 * 4. Trailing commas in arrays or objects
 * 5. Escaped characters or control characters
 *
 * This parser isolates the root JSON structure using bracket balancing,
 * strips extraneous content, sanitizes common LLM JSON syntax issues,
 * and guarantees a clean parse.
 */

export function parseGeminiJsonResponse<T = any>(rawText: string): T {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty or invalid response from Gemini model');
  }

  const text = rawText.trim();

  // 1. Direct parse attempt if rawText is already pristine JSON
  try {
    return JSON.parse(text) as T;
  } catch {
    // Continue to advanced extractors
  }

  // 2. Strip markdown fences if present (e.g., ```json { ... } ``` or ``` { ... } ```)
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const insideBlock = codeBlockMatch[1].trim();
    try {
      return JSON.parse(insideBlock) as T;
    } catch {
      try {
        const sanitized = sanitizeJsonString(insideBlock);
        return JSON.parse(sanitized) as T;
      } catch {
        // Fall through to bracket extraction on insideBlock or text
      }
    }
  }

  // 3. Precise bracket-balancing extraction to find the exact root object or array
  // This solves "SyntaxError: Unexpected non-whitespace character after JSON at position X"
  // by locating the first { or [ and its matching closing } or ], ignoring any trailing or leading text.
  const extracted = extractBalancedJson(text);
  if (extracted) {
    try {
      return JSON.parse(extracted) as T;
    } catch {
      try {
        const sanitized = sanitizeJsonString(extracted);
        return JSON.parse(sanitized) as T;
      } catch {
        // Fall through to greedy regex
      }
    }
  }

  // 4. Greedy regex match as secondary fallback
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch && objectMatch[0]) {
    try {
      return JSON.parse(objectMatch[0]) as T;
    } catch {
      try {
        return JSON.parse(sanitizeJsonString(objectMatch[0])) as T;
      } catch {}
    }
  }

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch && arrayMatch[0]) {
    try {
      return JSON.parse(arrayMatch[0]) as T;
    } catch {
      try {
        return JSON.parse(sanitizeJsonString(arrayMatch[0])) as T;
      } catch {}
    }
  }

  // 5. If everything failed, throw descriptive error with snippet
  const snippet = text.length > 250 ? `${text.substring(0, 250)}...` : text;
  throw new Error(`Could not parse JSON from model output: ${snippet}`);
}

/**
 * Finds the first root '{' or '[' and extracts the exact substring up to its matching '}' or ']'.
 * Correctly accounts for nested structures, string literals, and escaped quotation marks.
 */
function extractBalancedJson(text: string): string | null {
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  let startChar: '{' | '[' | null = null;
  let startIndex = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startChar = '{';
    startIndex = firstBrace;
  } else if (firstBracket !== -1) {
    startChar = '[';
    startIndex = firstBracket;
  }

  if (!startChar || startIndex === -1) {
    return null;
  }

  const endChar = startChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === startChar) {
        depth++;
      } else if (char === endChar) {
        depth--;
        if (depth === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * Cleans typical LLM syntax quirks:
 * - Trailing commas before closing braces/brackets (e.g. `[1, 2,]` or `{"a": 1,}`)
 * - Invalid control characters
 */
function sanitizeJsonString(str: string): string {
  return str
    // Remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1')
    // Remove unescaped ASCII control characters that invalidate JSON strings
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
