import type { Route } from "next";
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/home" as Route<string>);
}
