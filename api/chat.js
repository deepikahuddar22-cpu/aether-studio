export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server API key not configured' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);

  try {
    const bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    clearTimeout(timeout);
    const message =
      error.name === 'AbortError'
        ? 'Upstream AI took too long to respond'
        : error.message || 'Internal proxy error';
    return res.status(504).json({ error: message });
  }
}
