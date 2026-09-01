/**
 * Cloudflare Pages Function: /auction/[id]
 * Proxies single auction inspection and bid history from CraftersMC API
 */
export async function onRequest(context) {
  const { params, env } = context;
  const auctionId = params.id;

  if (!auctionId) {
    return new Response(JSON.stringify({ success: false, error: 'Auction ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const apiKey = env.CMC_API_KEY || env.CMCG_API_KEY || 'e89b4eb6-1776-4fb5-9a25-812c2ce1f8d8';

  try {
    const upstreamUrl = `https://api.craftersmc.net/v1/skyblock/auction/${auctionId}`;
    const res = await fetch(upstreamUrl, {
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json'
      }
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=15',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
