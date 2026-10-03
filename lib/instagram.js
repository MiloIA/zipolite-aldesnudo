const BASE_URL = 'https://graph.instagram.com/v21.0';

function token() {
  const t = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!t) throw new Error('INSTAGRAM_ACCESS_TOKEN not set');
  return t;
}

function userId() {
  const u = process.env.INSTAGRAM_USER_ID;
  if (!u) throw new Error('INSTAGRAM_USER_ID not set');
  return u;
}

async function igFetch(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('access_token', token());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return json;
}

export async function getAccountInfo() {
  return igFetch(`/${userId()}`, {
    fields: 'id,name,biography,followers_count,media_count,profile_picture_url,website'
  });
}

export async function getMediaList() {
  return igFetch(`/${userId()}/media`, {
    fields: 'id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,permalink',
    limit: 20
  });
}

export async function getMediaInsights({ media_id } = {}) {
  if (!media_id) throw new Error('media_id is required');
  return igFetch(`/${media_id}/insights`, {
    metric: 'impressions,reach,likes,comments,shares,saved'
  });
}

export async function getAccountInsights({ since, until, period = 'day' } = {}) {
  return igFetch(`/${userId()}/insights`, {
    metric: 'impressions,reach,follower_count,profile_views',
    period,
    since,
    until
  });
}

export async function getTopPosts() {
  const raw = await igFetch(`/${userId()}/media`, {
    fields: 'id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,permalink',
    limit: 50
  });
  const posts = (raw.data ?? [])
    .map(p => ({ ...p, engagement: (p.like_count ?? 0) + (p.comments_count ?? 0) }))
    .sort((a, b) => b.engagement - a.engagement);
  return { data: posts, paging: raw.paging };
}
