import { NextResponse } from "next/server";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const modelsParam = searchParams.get("models");
  if (!modelsParam) {
    return NextResponse.json({ caps: [] });
  }
  const models = modelsParam.split(",").map((s) => s.trim()).filter(Boolean);

  const caps = models.map((modelStr) => {
    const idx = modelStr.indexOf("/");
    if (idx < 0) return { model: modelStr, capabilities: null };
    const provider = modelStr.slice(0, idx);
    const model = modelStr.slice(idx + 1);
    try {
      return { model: modelStr, capabilities: getCapabilitiesForModel(provider, model) };
    } catch {
      return { model: modelStr, capabilities: null };
    }
  });

  return NextResponse.json({ caps });
}