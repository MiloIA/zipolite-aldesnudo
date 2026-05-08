export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.VERCEL_ACCESS_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    return res.status(200).json({
      pageviews: 0, visitors: 0,
      message: 'Configura VERCEL_ACCESS_TOKEN y VERCEL_PROJECT_ID'
    });
  }

  try {
    const end = new Date();
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const from = start.toISOString().split('T')[0];
    const to = end.toISOString().split('T')[0];

    const base = `https://vercel.com/api/web-analytics`;
    const headers = { Authorization: `Bearer ${token}` };
    const q = `projectId=${projectId}&from=${from}&to=${to}&interval=1d&environment=production`;

    const [tsRes, pagesRes, devRes, countryRes] = await Promise.all([
      fetch(`${base}/timeseries?${q}`, { headers }),
      fetch(`${base}/pages?${q}&limit=5`, { headers }),
      fetch(`${base}/devices?${q}`, { headers }),
      fetch(`${base}/countries?${q}&limit=5`, { headers }),
    ]);

    console.log('ts status:', tsRes.status);
    console.log('pages status:', pagesRes.status);
    console.log('devices status:', devRes.status);
    console.log('countries status:', countryRes.status);

    const tsData = await tsRes.json();
    console.log('tsData:', JSON.stringify(tsData).slice(0, 500));

    const pagesData   = tsRes.status === 200 ? await pagesRes.json()   : {};
    const devData     = devRes.status === 200 ? await devRes.json()     : {};
    const countryData = countryRes.status === 200 ? await countryRes.json() : {};

    console.log('pagesData raw:', JSON.stringify(pagesData).slice(0,500));
    console.log('devData raw:', JSON.stringify(devData).slice(0,500));
    console.log('countryData raw:', JSON.stringify(countryData).slice(0,500));

    const tsArray = tsData?.data?.groups?.all
      || tsData?.data?.timeseries
      || (Array.isArray(tsData.data) ? tsData.data : [])
      || [];

    const pageviews = tsArray.reduce((s, d) =>
      s + (d.pageviews || d.total || d.count || 0), 0);
    const visitors = tsArray.reduce((s, d) =>
      s + (d.visitors || d.unique || d.total || 0), 0);

    console.log('tsArray length:', tsArray.length);
    console.log('first item:', JSON.stringify(tsArray[0]));

    const pages = (pagesData.data || []).map(p => ({
      path: p.path || p.page || '/',
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
    console.log('Error:', e.message);
    return res.status(200).json({
      pageviews: 0, visitors: 0,
      message: 'Error: ' + e.message
    });
  }
}
