export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = new Set(["https://pixelfirestudio.in", "https://www.pixelfirestudio.in"]);
    const cors = {
      "Access-Control-Allow-Origin": allowed.has(origin) ? origin : "https://pixelfirestudio.in",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "PixelFire AI" }, { headers: cors });
    if (request.method !== "POST" || !["/generate", "/edit"].includes(url.pathname))
      return Response.json({ error: "Not found" }, { status: 404, headers: cors });
    if (!allowed.has(origin)) return Response.json({ error: "Origin not allowed" }, { status: 403, headers: cors });
    try {
      const body = await request.json();
      const prompt = String(body.prompt || "").trim();
      if (!prompt || prompt.length > 1800) return Response.json({ error: "Prompt is required (maximum 1,800 characters)." }, { status: 400, headers: cors });
      let result;
      if (url.pathname === "/generate") {
        result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
          prompt,
          steps: 4
        });
      } else {
        const image = String(body.image || "");
        if (!image || image.length > 7_000_000) return Response.json({ error: "Please upload a valid image under 5 MB." }, { status: 400, headers: cors });
        result = await env.AI.run("@cf/black-forest-labs/flux-2-klein-4b", {
          prompt,
          image
        });
      }
      if (!result || !result.image) throw new Error("The AI model did not return an image. Please try again.");
      return Response.json({ image: result.image }, { headers: { ...cors, "Cache-Control": "no-store" } });
    } catch (error) {
      return Response.json({ error: error?.message || "AI request failed. Please try again later." }, { status: 502, headers: cors });
    }
  }
};