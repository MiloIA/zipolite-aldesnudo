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

async function igFetch(path, params = {}, method = 'GET') {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('access_token', token());

  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString());
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    // Las URLs de paginación incluyen el access_token: nunca devolverlas
    if (json.paging) { delete json.paging.next; delete json.paging.previous; }
    return json;
  } else {
    const res = await fetch(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    return json;
  }
}

export async function getAccountInfo() {
  return igFetch(`/${userId()}`, {
    fields: 'id,name,biography,followers_count,media_count,profile_picture_url,website'
  });
}

export async function getMediaList() {
  const json = await igFetch(`/${userId()}/media`, {
    fields: 'id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,permalink',
    limit: 20
  });
  return { data: json.data };
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
  return { data: posts };
}

// ── COMPETENCIA ──────────────────────────────────────────────

export async function getCompetitorProfile({ username } = {}) {
  if (!username) throw new Error('username is required');
  const data = await igFetch(`/${userId()}`, {
    fields: `business_discovery.username(${username}){id,name,biography,followers_count,media_count,profile_picture_url,website}`
  });
  return data.business_discovery;
}

export async function getCompetitorPosts({ username, limit = 12 } = {}) {
  if (!username) throw new Error('username is required');
  const data = await igFetch(`/${userId()}`, {
    fields: `business_discovery.username(${username}){media.limit(${limit}){id,caption,media_type,timestamp,like_count,comments_count,permalink}}`
  });
  return data.business_discovery?.media;
}

export async function compareWithCompetitors({ usernames = [] } = {}) {
  if (!usernames.length) throw new Error('usernames array is required');
  const results = await Promise.allSettled(
    usernames.map(u => getCompetitorProfile({ username: u }))
  );
  return results.map((r, i) => ({
    username: usernames[i],
    ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message })
  }));
}

// ── LEADS ─────────────────────────────────────────────────────

export async function getPostComments({ media_id, limit = 50 } = {}) {
  if (!media_id) throw new Error('media_id is required');
  return igFetch(`/${media_id}/comments`, {
    fields: 'id,text,username,timestamp,like_count,replies{id,text,username,timestamp}',
    limit
  });
}

export async function getMentions({ limit = 20 } = {}) {
  return igFetch(`/${userId()}/tags`, {
    fields: 'id,caption,media_type,timestamp,like_count,comments_count,permalink,username',
    limit
  });
}

export async function searchHashtagPosts({ hashtag, limit = 20 } = {}) {
  if (!hashtag) throw new Error('hashtag is required');
  const hashtagData = await igFetch('/ig_hashtag_search', {
    user_id: userId(),
    q: hashtag.replace('#', '')
  });
  const hashtagId = hashtagData.data?.[0]?.id;
  if (!hashtagId) throw new Error(`Hashtag #${hashtag} not found`);
  return igFetch(`/${hashtagId}/recent_media`, {
    user_id: userId(),
    fields: 'id,caption,media_type,timestamp,like_count,comments_count,permalink',
    limit
  });
}

export async function identifyLeads({ media_id } = {}) {
  if (!media_id) throw new Error('media_id is required');
  const comments = await getPostComments({ media_id, limit: 100 });
  const buyKeywords = ['precio', 'costo', 'cuánto', 'cuanto', 'cuando', 'cuándo', 'fechas', 'disponible', 'info', 'información', 'interesa', 'me apunto', 'quiero', 'reservar', 'apartar', 'cómo', 'como'];
  const leads = (comments.data || []).filter(c => {
    const text = (c.text || '').toLowerCase();
    return buyKeywords.some(k => text.includes(k));
  });
  return { total_comments: comments.data?.length || 0, leads_found: leads.length, leads };
}

// ── PUBLICACIÓN ───────────────────────────────────────────────

export async function publishPhoto({ image_url, caption = '' } = {}) {
  if (!image_url) throw new Error('image_url is required');
  const container = await igFetch(`/${userId()}/media`, {
    image_url,
    caption
  }, 'POST');
  if (!container.id) throw new Error('Failed to create media container');
  return igFetch(`/${userId()}/media_publish`, {
    creation_id: container.id
  }, 'POST');
}

export async function replyToComment({ comment_id, message } = {}) {
  if (!comment_id || !message) throw new Error('comment_id and message are required');
  return igFetch(`/${comment_id}/replies`, { message }, 'POST');
}
