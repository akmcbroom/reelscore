import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ReelScore" },
    {
      name: "description",
      content: "Watch what you like, not what the critics like.",
    },
  ];
}

export default function Home() {
  return <Welcome message="ReelScore rebuild in progress" />;
}
