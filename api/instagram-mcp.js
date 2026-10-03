import { getAccountInfo, getMediaList, getMediaInsights, getAccountInsights, getTopPosts } from '../lib/instagram.js';

const TOOLS = {
  get_account_info:     (_p) => getAccountInfo(),
  get_media_list:       (_p) => getMediaList(),
  get_media_insights:   (p)  => getMediaInsights(p),
  get_account_insights: (p)  => getAccountInsights(p),
  get_top_posts:        (_p) => getTopPosts()
};

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const { tool, params = {} } = req.body ?? {};

  if (!tool)
    return res.status(400).json({ ok: false, error: 'Missing "tool" in request body' });

  const fn = TOOLS[tool];
  if (!fn)
    return res.status(404).json({ ok: false, error: `Unknown tool: "${tool}"` });

  try {
    const data = await fn(params);
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error(`[instagram-mcp] ${tool}:`, err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
