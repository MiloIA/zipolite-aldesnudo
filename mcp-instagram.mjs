#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_URL = 'https://zipolitealdesnudo.com/api/pagos';

const TOOLS = [
  { name: 'get_account_info', description: 'Obtiene información general de la cuenta de Instagram: nombre, biografía, seguidores, publicaciones, sitio web.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_media_list', description: 'Lista las últimas 20 publicaciones de Instagram con likes, comentarios y permalink.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_top_posts', description: 'Obtiene las publicaciones con mayor engagement (likes + comentarios) de los últimos 50 posts.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_account_insights', description: 'Obtiene métricas de la cuenta: impresiones, alcance, vistas de perfil, seguidores por día.', inputSchema: { type: 'object', properties: { since: { type: 'string', description: 'Fecha inicio UNIX timestamp' }, until: { type: 'string', description: 'Fecha fin UNIX timestamp' }, period: { type: 'string', description: 'day, week o month' } } } },
  { name: 'get_media_insights', description: 'Obtiene métricas de una publicación específica: impresiones, alcance, likes, comentarios, shares, guardados.', inputSchema: { type: 'object', properties: { media_id: { type: 'string', description: 'ID de la publicación' } }, required: ['media_id'] } },
  { name: 'get_competitor_profile', description: 'Obtiene perfil público de una cuenta de Instagram competidora.', inputSchema: { type: 'object', properties: { username: { type: 'string' } }, required: ['username'] } },
  { name: 'get_competitor_posts', description: 'Obtiene publicaciones recientes de una cuenta competidora con engagement.', inputSchema: { type: 'object', properties: { username: { type: 'string' }, limit: { type: 'number' } }, required: ['username'] } },
  { name: 'compare_with_competitors', description: 'Compara tu cuenta con múltiples competidores en paralelo.', inputSchema: { type: 'object', properties: { usernames: { type: 'array', items: { type: 'string' } } }, required: ['usernames'] } },
  { name: 'get_post_comments', description: 'Obtiene todos los comentarios de una publicación para identificar leads.', inputSchema: { type: 'object', properties: { media_id: { type: 'string' }, limit: { type: 'number' } }, required: ['media_id'] } },
  { name: 'get_mentions', description: 'Obtiene posts donde mencionan o etiquetan a zipolite_.', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'search_hashtag_posts', description: 'Busca publicaciones recientes con un hashtag específico.', inputSchema: { type: 'object', properties: { hashtag: { type: 'string' }, limit: { type: 'number' } }, required: ['hashtag'] } },
  { name: 'identify_leads', description: 'Analiza comentarios de un post e identifica usuarios con intención de compra.', inputSchema: { type: 'object', properties: { media_id: { type: 'string' } }, required: ['media_id'] } },
  { name: 'publish_photo', description: 'Publica una foto en Instagram con caption.', inputSchema: { type: 'object', properties: { image_url: { type: 'string' }, caption: { type: 'string' } }, required: ['image_url'] } },
  { name: 'reply_to_comment', description: 'Responde a un comentario específico en Instagram.', inputSchema: { type: 'object', properties: { comment_id: { type: 'string' }, message: { type: 'string' } }, required: ['comment_id', 'message'] } }
];

async function callTool(name, params) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'instagram', tool: name, params })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error en API');
  return json.data;
}

const server = new Server({ name: 'zipolite-instagram', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const data = await callTool(name, args || {});
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
