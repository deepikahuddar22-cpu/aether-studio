export const config = {
  runtime: 'edge',
};

const MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
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
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      try {
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
      } catch (err) {
        clearTimeout(timeoutId);
        lastStatus = 504;
        lastErrorText = JSON.stringify({ error: err.message || 'Model timeout' });
      }
    }

    return new Response(lastErrorText, {
      status: lastStatus,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
