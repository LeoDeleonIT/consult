import { z } from "zod";
import { writeAudit } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { getOpenDentalPatient } from "@/lib/open-dental";
import { requireSession } from "@/lib/session";

const patNumSchema = z.coerce.number().int().positive();

export async function GET(
  _request: Request,
  context: { params: Promise<{ patNum: string }> },
): Promise<Response> {
  try {
    const session = await requireSession("coordinator");
    const { patNum: rawPatNum } = await context.params;
    const patient = await getOpenDentalPatient(patNumSchema.parse(rawPatNum));
    await writeAudit({
      actorId: session.id,
      eventType: "open_dental.patient_loaded",
      metadata: { source: "open_dental_api" },
    });
    return Response.json({ patient }, {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
