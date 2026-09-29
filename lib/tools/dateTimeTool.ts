import { ToolExecutionRecord } from '@/types/rag';

export interface RelativeDateInfo {
  detectedOffsetDays: number;
  targetDate: string;
  targetDayOfWeek: string;
  relativeDescription: string;
}

export interface DateTimeToolResult {
  currentDate: string;
  currentTime: string;
  dayOfWeek: string;
  isoTimestamp: string;
  timezone: string;
  utcString: string;
  isWeekend: boolean;
  epochMs: number;
  relativeQueryInfo?: RelativeDateInfo;
}

const wordToNumber: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fourteen: 14,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
};

/**
 * Parses queries like "two days later", "5 days after today", "tomorrow", "day after tomorrow",
 * "3 days from now", "yesterday", "in a week", etc. and computes the exact future/past date.
 */
export function calculateRelativeOffset(query: string, now: Date, timezone?: string): RelativeDateInfo | undefined {
  const q = query.toLowerCase();
  let daysOffset: number | null = null;
  let description = '';

  if (q.includes('day after tomorrow')) {
    daysOffset = 2;
    description = '2 days later (day after tomorrow)';
  } else if (q.includes('day before yesterday')) {
    daysOffset = -2;
    description = '2 days ago (day before yesterday)';
  } else if (q.includes('tomorrow')) {
    daysOffset = 1;
    description = '1 day later (tomorrow)';
  } else if (q.includes('yesterday')) {
    daysOffset = -1;
    description = '1 day ago (yesterday)';
  } else if (q.includes('next week') || q.includes('a week later') || q.includes('in a week') || q.includes('1 week later')) {
    daysOffset = 7;
    description = '7 days later (1 week)';
  } else {
    // Regex for: "(2|two|three) (days|day) (later|after|from now|from today)" or "in (2|two) days"
    const matchForward = q.match(/(?:in\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|twenty|thirty)\s*days?\s*(?:later|after|from now|from today)?/);
    const matchBackward = q.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*days?\s*(?:ago|before|earlier)/);

    if (matchForward) {
      const rawNum = matchForward[1];
      const count = parseInt(rawNum, 10) || wordToNumber[rawNum] || 0;
      if (count > 0) {
        daysOffset = count;
        description = `${count} day${count > 1 ? 's' : ''} later`;
      }
    } else if (matchBackward) {
      const rawNum = matchBackward[1];
      const count = parseInt(rawNum, 10) || wordToNumber[rawNum] || 0;
      if (count > 0) {
        daysOffset = -count;
        description = `${count} day${count > 1 ? 's' : ''} ago`;
      }
    }
  }

  if (daysOffset === null) {
    return undefined;
  }

  const targetDate = new Date(now.getTime());
  targetDate.setDate(targetDate.getDate() + daysOffset);

  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const optionsDate: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  };

  const targetFormatted = targetDate.toLocaleDateString('en-US', optionsDate);
  const targetDayOfWeek = targetDate.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: tz,
  });

  return {
    detectedOffsetDays: daysOffset,
    targetDate: targetFormatted,
    targetDayOfWeek,
    relativeDescription: description,
  };
}

/**
 * Executes the real-time Date & Time tool with optional relative date calculation.
 * Solves the LLM training cutoff issue by querying the host system's live clock.
 */
export function executeDateTimeTool(customTimezone?: string, query?: string): DateTimeToolResult {
  const now = new Date();
  const tz = customTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const optionsDate: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  };

  const optionsTime: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: tz,
  };

  const dayOfWeek = now.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: tz,
  });

  const currentDate = now.toLocaleDateString('en-US', optionsDate);
  const currentTime = now.toLocaleTimeString('en-US', optionsTime);
  const dayIndex = now.getDay();
  const isWeekend = dayIndex === 0 || dayIndex === 6;

  let relativeQueryInfo: RelativeDateInfo | undefined;
  if (query) {
    relativeQueryInfo = calculateRelativeOffset(query, now, tz);
  }

  return {
    currentDate,
    currentTime,
    dayOfWeek,
    isoTimestamp: now.toISOString(),
    timezone: tz,
    utcString: now.toUTCString(),
    isWeekend,
    epochMs: now.getTime(),
    relativeQueryInfo,
  };
}

/**
 * Intelligent detector to determine if a user query requires real-time temporal info,
 * including relative date calculations like "what will be the date two days later".
 */
export function detectDateTimeIntent(query: string): boolean {
  const normalized = query.toLowerCase().trim();
  const temporalKeywords = [
    "today's date",
    "todays date",
    "today date",
    "current date",
    "current time",
    "what date is it",
    "what day is today",
    "what day is it",
    "what is today's date",
    "what is todays date",
    "what is the date",
    "tell todays date",
    "tell today date",
    "tell me the date",
    "tell me today's date",
    "what time is it",
    "what's the time",
    "current year",
    "current month",
    "what month is it",
    "what year is it",
    "time right now",
    "date right now",
    "date and time",
    "time and date",
    // Relative date queries
    "days later",
    "day later",
    "days after",
    "day after",
    "days from now",
    "days from today",
    "days before",
    "days ago",
    "tomorrow",
    "yesterday",
    "day after tomorrow",
    "day before yesterday",
    "next week",
    "in a week",
    "a week later",
    "what will be the date",
    "what date will it be",
    "what will be the day",
    "what day will it be",
    "date after",
    "date in",
    "calculate the date",
    "calculate date"
  ];

  return temporalKeywords.some((keyword) => normalized.includes(keyword));
}

/**
 * Tool Definition Schema for standard LLM Function Calling (OpenAI / Gemini compatible)
 */
export const dateTimeToolDefinition = {
  name: 'get_current_date_time',
  description: 'Retrieves the verified real-time current date, time, day of the week, and timezone from the system clock, and calculates relative target dates (e.g. two days later, next week, tomorrow). Essential for temporal reasoning without training cutoff errors.',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Optional IANA timezone name (e.g., "Asia/Kolkata", "America/New_York", "UTC"). Defaults to host system timezone.',
      },
      relativeQuery: {
        type: 'string',
        description: 'Optional relative query string to compute (e.g. "two days later", "tomorrow", "3 days after today").',
      },
    },
    required: [],
  },
};
