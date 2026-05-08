export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.VERCEL_ACCESS_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    return res.status(200).json({
      pageviews: 0,
      visitors: 0,
      message: 'Configura VERCEL_ACCESS_TOKEN y VERCEL_PROJECT_ID en variables de entorno'
    });
  }

  try {
    const end = new Date();
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      projectId: process.env.VERCEL_PROJECT_ID,
      from: start.toISOString().split('T')[0],
      to: end.toISOString().split('T')[0],
      interval: '1d',
    });

    const [tsRes, pagesRes, devRes, countryRes] = await Promise.all([
      fetch(`https://vercel.com/api/web-analytics/timeseries?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`https://vercel.com/api/web-analytics/pages?${params}&limit=5`,
        { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`https://vercel.com/api/web-analytics/devices?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`https://vercel.com/api/web-analytics/countries?${params}&limit=5`,
        { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const [tsData, pagesData, devData, countryData] = await Promise.all([
      tsRes.json(), pagesRes.json(), devRes.json(), countryRes.json()
    ]);

    const pageviews = (tsData.data || []).reduce((s, d) => s + (d.pageviews || 0), 0);
    const visitors  = (tsData.data || []).reduce((s, d) => s + (d.visitors  || 0), 0);

    const pages = (pagesData.data || []).map(p => ({
      path: p.path || p.page || p.url || '/',
      views: p.pageviews || p.views || 0,
    }));

    const totalDev = (devData.data || []).reduce((s, d) => s + (d.visitors || 0), 0) || 1;
    const devices = (devData.data || []).map(d => ({
      type: d.device || d.type || 'unknown',
      pct: Math.round(((d.visitors || 0) / totalDev) * 100),
    }));

    const FLAGS = { MX:'🇲🇽', US:'🇺🇸', CO:'🇨🇴', AR:'🇦🇷', ES:'🇪🇸', BR:'🇧🇷', CL:'🇨🇱', CA:'🇨🇦' };
    const countries = (countryData.data || []).map(c => ({
      name: c.country || c.name || 'Desconocido',
      flag: FLAGS[c.country] || '🌐',
      visitors: c.visitors || 0,
    }));

    return res.status(200).json({ pageviews, visitors, pages, devices, countries });
  } catch (e) {
    return res.status(200).json({
      pageviews: 0,
      visitors: 0,
      message: 'Error conectando con Vercel Analytics: ' + e.message
    });
  }
}
