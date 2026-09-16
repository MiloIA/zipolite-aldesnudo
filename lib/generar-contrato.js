export async function generarContrato(reservacion_id) {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://zipolitealdesnudo.com';

    const res = await fetch(`${baseUrl}/api/generate-contract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ADMIN_PASSWORD}`,
      },
      body: JSON.stringify({ reservacion_id }),
    });

    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Error generando contrato' };
    return { ok: true, contrato_url: data.url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
