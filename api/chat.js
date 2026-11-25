export const config = {
  runtime: 'edge',
};

const MODELS = [
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
];

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is missing on Vercel' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const isStream = body.stream === true;
    delete body.stream;
    const payloadStr = JSON.stringify(body);

    let lastErrorText = '';
    let lastStatus = 500;

    for (const model of MODELS) {
      const endpoint = isStream
        ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 14000);

      const geminiRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (geminiRes.ok) {
        if (isStream) {
          return new Response(geminiRes.body, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              'Connection': 'keep-alive',
            },
          });
        }
        const data = await geminiRes.text();
        return new Response(data, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      lastStatus = geminiRes.status;
      lastErrorText = await geminiRes.text();

      // If preview model is overloaded (503) or rate-limited (429), immediately try gemini-2.5-flash
      if (geminiRes.status !== 503 && geminiRes.status !== 429) {
        break;
      }
    }

    return new Response(lastErrorText, {
      status: lastStatus,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.name === 'AbortError' ? 'Request timed out' : error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
