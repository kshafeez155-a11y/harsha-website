import type { SupabaseClient } from "@supabase/supabase-js";
import type { StartupStory, StartupMilestone, StartupProject } from "../data/startupStories";

export const STARTUP_STAGES = ["Idea Stage", "MVP", "Early Revenue", "Growth Stage", "Funded"] as const;
export const STARTUP_PROFILES_QUERY_KEY = ["startup-profiles", "published"] as const;

export type StartupProfile = StartupStory & {
  id: string;
  stage: string;
  website: string;
  isPublished: boolean;
  isFeatured: boolean;
  sortOrder: number;
};

type ProfileClient = Pick<SupabaseClient, "from">;
type DatabaseRow = Record<string, unknown>;
const detailFields = [
  "portfolioHeading", "mediaDivisionName", "mediaDivisionDescription",
  "technologyDivisionName", "technologyDivisionDescription",
] as const;

export function newStartupProfile(): StartupProfile {
  return {
    id: "", slug: "", startupName: "", founderName: "", location: "", industry: "",
    shortStory: "", stage: "Idea Stage", startupLogo: "", founderImage: "", coverImage: "",
    website: "", isPublished: false, isFeatured: false, sortOrder: 0, milestones: [],
  };
}

export function slugifyStartupName(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function projects(value: unknown): StartupProject[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    name: text(item?.name), description: text(item?.description),
    url: text(item?.url), linkLabel: text(item?.linkLabel),
  }));
}

export function parseStartupProfile(row: DatabaseRow): StartupProfile {
  const details = row.story_details && typeof row.story_details === "object" && !Array.isArray(row.story_details)
    ? row.story_details as DatabaseRow : {};
  const milestones: StartupMilestone[] = Array.isArray(details.milestones)
    ? details.milestones.map((item) => ({ number: text(item?.number), title: text(item?.title), description: text(item?.description) })) : [];
  return {
    id: text(row.id), slug: text(row.slug), startupName: text(row.startup_name),
    founderName: text(row.founder_name), location: text(row.location), industry: text(row.industry),
    shortStory: text(row.short_story), stage: text(row.stage) || "Idea Stage",
    startupLogo: text(row.startup_logo), founderImage: text(row.founder_image), coverImage: text(row.cover_image),
    website: text(row.website), isPublished: row.is_published === true, isFeatured: row.is_featured === true,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
    ...Object.fromEntries(detailFields.map((key) => [key, text(details[key])])),
    mediaPortfolio: projects(details.mediaPortfolio), technologyPortfolio: projects(details.technologyPortfolio), milestones,
  };
}

function validUrl(value: string, allowLocal: boolean) {
  if (!value) return true;
  if (allowLocal && /^\/images\/[A-Za-z0-9_./% -]+$/.test(value) && !value.includes("..")) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch { return false; }
}

export function startupProfilePayload(profile: StartupProfile) {
  const required = [
    ["Startup name", profile.startupName], ["Founder name", profile.founderName],
    ["Location", profile.location], ["Industry", profile.industry], ["Description", profile.shortStory],
  ];
  for (const [label, value] of required) {
    if (!value?.trim()) throw new Error(`${label} is required.`);
  }
  const slug = profile.slug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Page URL must contain lowercase letters, numbers, and single hyphens.");
  }
  if (slug === "register") throw new Error("That page URL is reserved. Choose a different page URL.");
  if (!STARTUP_STAGES.includes(profile.stage as typeof STARTUP_STAGES[number])) {
    throw new Error("Choose a valid startup stage.");
  }
  if (!Number.isSafeInteger(profile.sortOrder)) throw new Error("Display order must be a whole number.");
  for (const [label, url] of [["Logo", profile.startupLogo], ["Founder photo", profile.founderImage], ["Cover image", profile.coverImage]]) {
    if (!validUrl(url?.trim() ?? "", true)) throw new Error(`${label} must use an http(s) URL or a local /images/ path.`);
  }
  if (!validUrl(profile.website.trim(), false)) throw new Error("Website must use an http(s) URL.");
  const mediaPortfolio = profile.mediaPortfolio ?? [];
  const technologyPortfolio = profile.technologyPortfolio ?? [];
  for (const project of [...mediaPortfolio, ...technologyPortfolio]) {
    if (!validUrl(project.url.trim(), false)) throw new Error("Portfolio links must use http(s) URLs.");
  }
  return {
    slug, startup_name: profile.startupName.trim(), founder_name: profile.founderName!.trim(),
    location: profile.location.trim(), industry: profile.industry.trim(), short_story: profile.shortStory.trim(),
    stage: profile.stage, startup_logo: profile.startupLogo.trim(), founder_image: profile.founderImage?.trim() ?? "",
    cover_image: profile.coverImage.trim(), website: profile.website.trim(), is_published: profile.isPublished,
    is_featured: profile.isFeatured, sort_order: profile.sortOrder,
    story_details: {
      ...Object.fromEntries(detailFields.map((key) => [key, profile[key] ?? ""])),
      mediaPortfolio, technologyPortfolio, milestones: profile.milestones ?? [],
    },
  };
}

export function startupProfileError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "23505") return "That page URL is already in use. Choose a different page URL.";
  if (code === "42P01" || code === "PGRST205") return "Startup management is not set up yet. Apply migration 005_startup_profiles.sql to this website's Supabase project.";
  if (code === "42501" || code === "PGRST301") return "You do not have permission to change startups. Sign in with an administrator account.";
  return error instanceof Error ? error.message : "Could not complete this startup change. Please try again.";
}

export async function loadStartupProfiles(client: ProfileClient, { publishedOnly = false }: { publishedOnly?: boolean } = {}) {
  let query = client.from("startup_profiles").select("*");
  if (publishedOnly) query = query.eq("is_published", true);
  const { data, error } = await query.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw Object.assign(new Error(startupProfileError(error)), { code: error.code });
  return (data ?? []).map((row: DatabaseRow) => parseStartupProfile(row));
}

export async function saveStartupProfile(client: ProfileClient, profile: StartupProfile) {
  const payload = startupProfilePayload(profile);
  const query = profile.id
    ? client.from("startup_profiles").update(payload).eq("id", profile.id)
    : client.from("startup_profiles").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw Object.assign(new Error(startupProfileError(error)), { code: error.code });
  if (!data) throw new Error("Startup was not saved. Please refresh and try again.");
  return parseStartupProfile(data);
}

export async function deleteStartupProfile(client: ProfileClient, id: string) {
  if (!id) throw new Error("Choose a saved startup to delete.");
  const { data, error } = await client.from("startup_profiles").delete().eq("id", id).select("id").single();
  if (error) throw Object.assign(new Error(startupProfileError(error)), { code: error.code });
  if (!data?.id) throw new Error("Startup was not deleted. Please refresh and try again.");
}
