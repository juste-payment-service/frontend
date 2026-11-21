import { redirect } from "next/navigation";

// Le tableau de bord deviendra la page d'accueil ; en attendant, la gestion des services.
export default function HomePage() {
  redirect("/services");
}
