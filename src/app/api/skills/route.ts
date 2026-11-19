import { NextResponse } from "next/server";
import { listSkills } from "@/lib/skills";

/**
 * GET /api/skills
 * Returns all skills loaded dynamically from the filesystem.
 */
export async function GET() {
  const skills = listSkills();
  return NextResponse.json({ skills });
}
