import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type SiteContent = { rules: string; benefits: string; principles: string; about: string };
export const siteContentFields: { key: keyof SiteContent; title: string }[] = [
  { key: "rules", title: "Правила сообщества" },
  { key: "benefits", title: "Преимущества" },
  { key: "principles", title: "Основные принципы" },
  { key: "about", title: "О проекте" },
];
export function useSiteContent() {
  return useQuery({ queryKey: ["site-content"], queryFn: () => api<SiteContent>("/site-content") });
}
