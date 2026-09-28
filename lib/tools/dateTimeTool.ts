import { ToolExecutionRecord } from '@/types/rag';

export interface DateTimeToolResult {
  currentDate: string;
  currentTime: string;
  dayOfWeek: string;
  isoTimestamp: string;
  timezone: string;
  utcString: string;
  isWeekend: boolean;
  epochMs: number;
}

/**
 * Executes the real-time Date & Time tool.
 * Solves the LLM training cutoff issue by querying the host system's live clock.
 */
export function executeDateTimeTool(customTimezone?: string): DateTimeToolResult {
  const now = new Date();
  
  const optionsDate: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: customTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  const optionsTime: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: customTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  const dayOfWeek = now.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: customTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const currentDate = now.toLocaleDateString('en-US', optionsDate);
  const currentTime = now.toLocaleTimeString('en-US', optionsTime);
  const timezone = customTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const dayIndex = now.getDay();
  const isWeekend = dayIndex === 0 || dayIndex === 6;

  return {
    currentDate,
    currentTime,
    dayOfWeek,
    isoTimestamp: now.toISOString(),
    timezone,
    utcString: now.toUTCString(),
    isWeekend,
    epochMs: now.getTime(),
  };
}

/**
 * Intelligent detector to determine if a user query requires real-time temporal info.
 * Works across cloud models and local Ollama without needing vendor-specific function schemas.
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
    "time and date"
  ];

  return temporalKeywords.some((keyword) => normalized.includes(keyword));
}

/**
 * Tool Definition Schema for standard LLM Function Calling (OpenAI / Gemini compatible)
 */
export const dateTimeToolDefinition = {
  name: 'get_current_date_time',
  description: 'Retrieves the verified real-time current date, time, day of the week, and timezone from the system clock. Essential for answering questions about today, now, current year, or relative dates because training data has a fixed cutoff.',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Optional IANA timezone name (e.g., "Asia/Kolkata", "America/New_York", "UTC"). Defaults to host system timezone.',
      },
    },
    required: [],
  },
};
