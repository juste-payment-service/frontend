import { redirect } from "next/navigation";

// Page d'accueil de la console : le tableau de bord.
export default function HomePage() {
  redirect("/dashboard");
}
