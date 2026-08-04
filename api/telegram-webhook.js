export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message } = req.body;
  if (!message?.text) return res.status(200).end();

  const chatId = message.chat.id;
  const text = message.text;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const systemPrompt = `Eres Mateo, asesor de viajes LGBT+ de Zipolite al Desnudo, agencia mexicana especializada en viajes a Zipolite, Oaxaca. Eres cálido, amigable y conoces todos los paquetes a la perfección.

PAQUETES ACTUALES:
1. Año nuevo al desnudo - $4,750/persona
   - Fechas: 29 Dic 2026 al 3 Ene 2027
   - Incluye: Transporte terrestre CDMX↔Zipolite, 4 noches camping, tienda y colchón inflable en préstamo, área privada con seguridad/alberca/duchas/electricidad, a 2 calles de la playa
   - Solo 48 lugares disponibles

2. Lunas de Octubre - $8,854/persona
   - Fechas: 22 al 27 de Octubre 2026
   - Incluye: Vuelo redondo CDMX, 5 noches Hotel Paraíso línea de playa, habitación doble, traslados aeropuerto-hotel
   - Salida: Jueves 22 Oct 12:00pm, Regreso: Martes 27 Oct 10:32pm

PAGOS: Se puede pagar con transferencia/depósito o financiamiento a 3, 6, 9, 12, 18 o 24 meses con tarjeta.
RESERVAS: En zipolitealdesnudo.com
WHATSAPP: 958 219 9953

REGLAS:
- Responde siempre en español
- Sé breve y conversacional, máximo 3 párrafos
- Si el usuario quiere reservar, manda el link: https://zipolitealdesnudo.com
- Si pide hablar con un asesor o tienes dudas que no puedes resolver, di: "Voy a conectarte con un asesor ahora mismo 🙌" y termina con ESCALAR_ASESOR
- Nunca inventes precios ni fechas que no estén en este prompt`;

  if (!process.env.ANTHROPIC_API_KEY) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '¡Hola! Soy Mateo 🌊 Tu asesor de viajes LGBT+ a Zipolite.  Visita zipolitealdesnudo.com para ver nuestros paquetes.'
      })
    });
    return res.status(200).end();
  }

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }]
      })
    });

    const aiData = await aiRes.json();
    let reply = aiData.content?.[0]?.text || 'Lo siento, no pude procesar tu mensaje. Escríbenos al 958 219 9953';

    const escalar = reply.includes('ESCALAR_ASESOR');
    reply = reply.replace('ESCALAR_ASESOR', '').trim();

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: reply, parse_mode: 'HTML' })
    });

    if (escalar) {
      const alertaText = `🚨 Usuario pide asesor\n\nChat ID: ${chatId}\nNombre: ${message.from.first_name || ''} ${message.from.last_name || ''}\nUsername: @${message.from.username || 'sin username'}\nMensaje: ${text}`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: alertaText })
      });
    }

    res.status(200).end();
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(200).end();
  }
}
