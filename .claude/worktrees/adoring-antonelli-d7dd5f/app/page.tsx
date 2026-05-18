import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  let session = null;
  try {
    session = await auth();
  } catch {
    redirect("/login");
  }
  if (session) redirect("/lancamento");
  redirect("/login");
}
