import { revalidateTag } from "next/cache";
import { z } from "zod";

import { safeEqual } from "@/lib/env";

const bodySchema = z.object({
  tags: z.array(z.string().min(1).max(256)).min(1).max(50),
});

/**
 * POST /api/revalidate
 * Header: x-revalidate-secret: <REVALIDATE_SECRET>
 * Body:   { "tags": ["sheet-towns"] }
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const provided = request.headers.get("x-revalidate-secret");
  if (!secret || !provided || !safeEqual(provided, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json(
      { error: "Expected body { tags: string[] }", issues: body.error.issues },
      { status: 400 },
    );
  }

  const tags = [...new Set(body.data.tags)];
  for (const tag of tags) revalidateTag(tag, "max");

  return Response.json({ revalidated: tags });
}
