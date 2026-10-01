import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/client";

export async function requireUserProfile() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const profile = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!profile) {
    redirect("/completar-perfil");
  }

  if (!profile.isActive) {
    redirect("/acceso-denegado");
  }

  return profile;
}

export async function requireRoles(allowed: Role[]) {
  const profile = await requireUserProfile();
  if (!allowed.includes(profile.role)) {
    redirect("/acceso-denegado");
  }
  return profile;
}
