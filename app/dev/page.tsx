import { redirect } from "next/navigation";

/** Phase 0 renamed the developer area to /developer; old links keep working. */
export default function DevRedirect() {
  redirect("/developer");
}
