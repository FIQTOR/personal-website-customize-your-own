import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import {
  BRAND_NAME,
  OWNER_NAME,
  JOB_TITLE,
  HEADLINE,
  COMPANY,
  SOCIAL_LINKS,
} from '../../src/config/Identity';

export interface Env {
  GEMINI_API_KEY?: string;
  AI_MODEL_PRIMARY?: string;
  AI_MODEL_FALLBACK?: string;
  GITHUB_USERNAME?: string;
  GITHUB_TOKEN?: string;
  WAKATIME_APP_SECRET?: string;
  COINGECKO_API_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>().basePath('/api');

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// --- AI Chat ---
const tokenize = (text: string) => text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fa5]{1,4}/g) || [];

const NAV_VERBS = new Set([
  'show', 'see', 'view', 'open', 'go', 'goto', 'visit', 'browse', 'take',
  'navigate', 'jump', 'bring', 'redirect',
  'lihat', 'tampilkan', 'buka', 'pergi', 'kunjungi', 'arahkan', 'tuju',
  '打开', '查看', '浏览', '转到', '前往', '跳转', '访问', '显示', '去',
]);

const NAV_PHRASES = [
  /\b(?:go|take me|bring me|jump|navigate)\s+to\b/,
  /\b(?:show|take|bring)\s+me\b/,
  /\b(?:bawa|antar)\s+saya\s+ke\b/,
  /\bpergi\s+ke\b/,
  /\bke\s+halaman\b/,
  /\bliat(?:h)?\s+(?:halaman|proyek|projek)\b/,
  /(?:带我去|去|前往|查看|打开|跳转到)(?:页面|项目|证书|关于|主页|联系)/,
];

const REDIRECT_MAP: Record<string, string[]> = {
  '/': ['home', 'homepage', 'beranda', 'landing', '首页', '主页'],
  '/talk': ['contact', 'kontak', 'hubungi', 'talk', '联系', '沟通', '合作'],
  '/#about': ['about', 'tentang', 'profil', '关于', '个人介绍'],
  '/#skills': ['skill', 'skills', 'kemampuan', 'keahlian', '技能', '技术栈'],
  '/linktree': ['linktree', 'links', 'tautan', '链接树', '外链'],
  '/career': ['career', 'karir', 'pengalaman', 'experience', '经历', '履历', '职业历程'],
  '/roadmap': ['roadmap', 'belajar', 'learn', '路线图'],
  '/projects': ['project', 'projects', 'projek', 'portfolio', 'portofolio', 'proyek', '项目', '作品集', '案例'],
  '/certification': ['certificates', 'certificate', 'certifications', 'sertifikat', 'certification', '证书', '资质', '认证'],
};

const SOCIAL_MAP: Record<string, string[]> = {
  [SOCIAL_LINKS.tiktok]: ['tiktok'],
  [SOCIAL_LINKS.instagram]: ['instagram', 'insta'],
  [SOCIAL_LINKS.youtube]: ['youtube'],
  [SOCIAL_LINKS.linkedin]: ['linkedin'],
  [SOCIAL_LINKS.github]: ['github'],
};

const isNavigationIntent = (text: string, tokens: string[]) => {
  if (tokens.some((t) => NAV_VERBS.has(t))) return true;
  return NAV_PHRASES.some((re) => re.test(text));
};

const SYSTEM_PROMPT = `
System instruction:

You are an AI assistant on ${BRAND_NAME}'s personal website.

About ${BRAND_NAME}:
- ${JOB_TITLE}
- ${HEADLINE}
- Founder of ${COMPANY.name} (${COMPANY.url})

STRICT SCOPE GUARDRAIL (MANDATORY):
- You MUST ONLY answer questions directly related to ${BRAND_NAME} (${OWNER_NAME}), their skills, portfolio, experience, projects, achievements, career, education, or their company ${COMPANY.name}.
- NEVER answer general knowledge questions, math problems, recipes, coding tutorials/troubleshooting for unrelated projects, or any topic unrelated to ${BRAND_NAME}.
- If a question is outside this scope, politely decline and redirect to ${BRAND_NAME}'s profile, portfolio, projects and skills.

Your job:
- Answer questions about ${BRAND_NAME}'s skills, background, and work.
- Help visitors understand their technical projects and expertise.
- Be concise, professional, and tech-savvy.
- LANGUAGE ADAPTATION: You MUST always detect and respond in the EXACT SAME LANGUAGE as the user's prompt or preferred language (e.g. if the user writes in Chinese / Mandarin, reply in fluent, natural Simplified Chinese; if in Indonesian, reply in Bahasa Indonesia; if in English, reply in English).
`;

app.post('/v1/ai/generate', async (c) => {
  const env = c.env;
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ status: 'failed', text: 'Invalid JSON request' }, 400);
  }

  let { input, history = [], file, lang } = body;
  input = typeof input === 'string' ? input.trim().substring(0, 1200) : '';

  if (!input && !file) {
    return c.json({ status: 'failed', text: 'Input or file is required.' }, 400);
  }

  const tokens = input ? tokenize(input) : [];

  // Check navigation intent
  if (input && isNavigationIntent(input.toLowerCase(), tokens)) {
    for (const [path, keywords] of Object.entries(REDIRECT_MAP)) {
      if (tokens.some((t) => keywords.includes(t))) {
        return new Response(`data: ${JSON.stringify({ type: 'redirectLocal', url: path })}\n\ndata: [DONE]\n\n`, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
          },
        });
      }
    }

    for (const [url, keywords] of Object.entries(SOCIAL_MAP)) {
      if (tokens.some((t) => keywords.includes(t))) {
        return new Response(
          `data: ${JSON.stringify({ type: 'redirect', platform: url, text: `Opening ${url}...` })}\n\ndata: [DONE]\n\n`,
          {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
            },
          },
        );
      }
    }
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      `data: ${JSON.stringify({ status: 'failed', text: 'AI key not configured on server.' })}\n\ndata: [DONE]\n\n`,
      {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      },
    );
  }

  const model = env.AI_MODEL_PRIMARY || 'gemini-2.5-flash-lite';

  // Construct Gemini REST contents
  const contents: any[] = [
    {
      role: 'user',
      parts: [{ text: SYSTEM_PROMPT }],
    },
    {
      role: 'model',
      parts: [{ text: `Understood. I am the AI assistant for ${BRAND_NAME}'s personal website.` }],
    },
  ];

  if (lang) {
    contents.push(
      {
        role: 'user',
        parts: [
          {
            text: `[System note: The visitor's current website language is '${lang}'. Respond in ${
              lang === 'zh' ? 'Simplified Chinese (简体中文)' : lang === 'id' ? 'Bahasa Indonesia' : 'English'
            }.]`,
          },
        ],
      },
      {
        role: 'model',
        parts: [{ text: 'Understood, I will match this language preference.' }],
      },
    );
  }

  if (Array.isArray(history)) {
    for (const h of history.slice(-10)) {
      if (h && h.role && h.parts) {
        contents.push({
          role: h.role === 'model' ? 'model' : 'user',
          parts: h.parts.map((p: any) => (typeof p === 'string' ? { text: p } : p)),
        });
      }
    }
  }

  const userParts: any[] = [];
  if (file && file.data && file.mimeType) {
    userParts.push({
      inlineData: {
        data: String(file.data),
        mimeType: String(file.mimeType),
      },
    });
  }
  if (input) {
    userParts.push({ text: input });
  }

  contents.push({ role: 'user', parts: userParts });

  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  try {
    const upstreamRes = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      return new Response(
        `data: ${JSON.stringify({ status: 'failed', text: `AI service unavailable: ${upstreamRes.status}` })}\n\ndata: [DONE]\n\n`,
        { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } },
      );
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Stream transformation from Google SSE to client SSE
    (async () => {
      const reader = upstreamRes.body!.getReader();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                }
              } catch {}
            }
          }
        }
        await writer.write(encoder.encode(`data: [DONE]\n\n`));
      } catch (err: any) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ status: 'failed', text: err?.message || 'Stream error' })}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    return new Response(
      `data: ${JSON.stringify({ status: 'failed', text: error.message || 'Internal error' })}\n\ndata: [DONE]\n\n`,
      { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } },
    );
  }
});

// --- GitHub Contributions ---
app.get('/v1/github/contributions', async (c) => {
  const env = c.env;
  const username = env.GITHUB_USERNAME || 'FIQTOR';
  const token = env.GITHUB_TOKEN;

  if (!token) {
    return c.json({ status: 'error', message: 'GITHUB_TOKEN not configured' }, 500);
  }

  const query = `query {
    user(login: "${username}") {
      contributionsCollection {
        contributionCalendar {
          colors
          totalContributions
          months { firstDay name totalWeeks }
          weeks {
            contributionDays { color contributionCount date }
            firstDay
          }
        }
      }
    }
  }`;

  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'fiqtor-portfolio-api',
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    const data: any = await res.json();
    if (data.errors) throw new Error(data.errors[0].message);

    return c.json(data.data, 200, {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

// --- WakaTime Stats ---
app.get('/v1/wakatime', async (c) => {
  const env = c.env;
  const apiKey = env.WAKATIME_APP_SECRET;

  if (!apiKey) {
    return c.json({ status: 500, message: 'WakaTime key not configured' }, 500);
  }

  try {
    const res = await fetch('https://wakatime.com/api/v1/users/current/all_time_since_today', {
      headers: { Authorization: `Basic ${apiKey}` },
    });

    if (!res.ok) throw new Error(`WakaTime API returned ${res.status}`);
    const json: any = await res.json();

    return c.json(
      {
        status: 200,
        message: 'Success',
        source: 'live',
        data: json.data,
      },
      200,
      {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    );
  } catch (err: any) {
    return c.json({ status: 503, message: 'WakaTime unreachable', error: err.message }, 503);
  }
});

// --- Crypto Prices ---
import cryptoConfig from './config/crypto';

const toRatio = (pct: unknown) => (typeof pct === 'number' ? 1 + pct / 100 : 1);

app.get('/v1/crypto', async (c) => {
  const env = c.env;
  const apiKey = env.COINGECKO_API_KEY;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&order=market_cap_desc&sparkline=false&price_change_percentage=24h,30d',
      { headers },
    );

    if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
    const markets: any = await res.json();

    if (!Array.isArray(markets)) throw new Error('Malformed data');

    const byId = new Map(markets.map((m: any) => [m.id, m]));
    const btc = byId.get('bitcoin');
    const eth = byId.get('ethereum');
    const sol = byId.get('solana');

    if (!btc?.current_price || !eth?.current_price || !sol?.current_price) {
      throw new Error('Incomplete coin prices');
    }

    const payload = {
      btc: {
        code: 'BTC',
        rate: Number(btc.current_price),
        delta: {
          month: toRatio(btc.price_change_percentage_30d_in_currency ?? btc.price_change_percentage_30d),
          day: toRatio(btc.price_change_percentage_24h_in_currency ?? btc.price_change_percentage_24h),
        },
      },
      eth: {
        code: 'ETH',
        rate: Number(eth.current_price),
        delta: {
          month: toRatio(eth.price_change_percentage_30d_in_currency ?? eth.price_change_percentage_30d),
          day: toRatio(eth.price_change_percentage_24h_in_currency ?? eth.price_change_percentage_24h),
        },
      },
      sol: {
        code: 'SOL',
        rate: Number(sol.current_price),
        delta: {
          month: toRatio(sol.price_change_percentage_30d_in_currency ?? sol.price_change_percentage_30d),
          day: toRatio(sol.price_change_percentage_24h_in_currency ?? sol.price_change_percentage_24h),
        },
      },
    };

    return c.json(
      {
        status: 'success',
        source: 'live',
        data: payload,
      },
      200,
      {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    );
  } catch {
    return c.json(
      {
        status: 'success',
        source: 'static',
        data: cryptoConfig,
      },
      200,
    );
  }
});

// --- Social Stats ---
import socialConfig from './config/social';

app.get('/v1/social/stats', (c) => {
  return c.json(
    {
      success: true,
      source: 'default',
      data: {
        tiktok: socialConfig.tiktok,
        instagram: socialConfig.instagram,
        lastUpdated: new Date().toISOString(),
      },
    },
    200,
    {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  );
});

export const onRequest = handle(app);
export default app;
