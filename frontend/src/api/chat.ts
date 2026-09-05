export interface ChatModelInfo {
  id: string;
  name: string;
  provider: string;
  default?: boolean;
  description?: string;
}

export interface StreamChatOptions {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  mode: 'chat' | 'agent';
  model: string;
  apiKey?: string;
  groqApiKey?: string;
  selectedFile?: string;
  selectedCode?: string;
  systemPrompt?: string;
  enablePlanning?: boolean;
  signal?: AbortSignal;
}

export interface TodoItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  note?: string;
}

export interface TerminalLog {
  command: string;
  returncode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface ProposedChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  original?: string;
  newContent?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface StreamEvent {
  type: 'planning' | 'content' | 'tool_call' | 'tool_result' | 'diff' | 'diffs' | 'message' | 'error' | 'end' | 'finish';
  content?: string;
  error?: string;
  reply?: string;
  contextUsed?: string[];
  changes?: ProposedChange[];
  summary?: string;
  requestId?: string;
  tool?: string;
  input?: any;
  path?: string;
  diff?: string;
  proposed?: string;
  goal?: string;
  todos?: TodoItem[];
  terminal?: TerminalLog;
  [key: string]: any;
}

const DEFAULT_MODELS: ChatModelInfo[] = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    provider: 'Groq',
    default: true,
    description: 'Fast LPU inference, intelligent reasoning, and tool calling.',
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    provider: 'Groq',
    default: false,
    description: 'Ultra-low latency for quick code explanations and chat.',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    default: false,
    description: 'High-speed reasoning and code analysis.',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    default: false,
    description: 'State of the art reasoning model.',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    default: false,
    description: 'Fast, lightweight general developer model.',
  },
];

export async function getAvailableModels(): Promise<ChatModelInfo[]> {
  try {
    const res = await fetch('/api/chat/models');
    if (!res.ok) return DEFAULT_MODELS;
    const data = await res.json();
    return data.models || DEFAULT_MODELS;
  } catch {
    return DEFAULT_MODELS;
  }
}

export async function streamChatMessage(
  options: StreamChatOptions,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(options),
    signal: options.signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Chat API error (${response.status}): ${errText}`);
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;

      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6).trim();
        if (jsonStr === '[DONE]') {
          onEvent({ type: 'end' });
          continue;
        }

        try {
          const parsed = JSON.parse(jsonStr) as StreamEvent;
          onEvent(parsed);
        } catch {
          // Ignore incomplete JSON chunks
        }
      }
    }
  }

  // Flush remaining buffer if any
  if (buffer.trim().startsWith('data: ')) {
    try {
      const parsed = JSON.parse(buffer.trim().slice(6)) as StreamEvent;
      onEvent(parsed);
    } catch {
      // Ignore
    }
  }
}
