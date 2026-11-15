import { useState, type FormEvent } from "react";
import { Building2, LoaderCircle, Plus, Trash2, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  STARTUP_STAGES,
  slugifyStartupName,
  startupProfilePayload,
  type StartupProfile,
} from "@/lib/startup-profiles";
import { supabase } from "@/lib/supabase";
import type { StartupMilestone, StartupProject } from "@/data/startupStories";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60";

export function StartupProfileEditor({
  profile,
  busy,
  onSave,
  onClose,
}: {
  profile: StartupProfile;
  busy: boolean;
  onSave: (profile: StartupProfile) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [error, setError] = useState("");
  const [uploadCount, setUploadCount] = useState(0);
  const [customSlug, setCustomSlug] = useState(Boolean(profile.id));
  const locked = busy || uploadCount > 0;

  function change<K extends keyof StartupProfile>(key: K, value: StartupProfile[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    setError("");
    try {
      startupProfilePayload(draft);
      await onSave(draft);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this startup. Please try again.",
      );
    }
  }

  const textField = (
    key:
      | "founderName"
      | "location"
      | "industry"
      | "website"
      | "portfolioHeading"
      | "mediaDivisionName"
      | "mediaDivisionDescription"
      | "technologyDivisionName"
      | "technologyDivisionDescription",
    label: string,
    required = false,
    placeholder = "",
  ) => (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {required && " *"}
      <input
        className={inputClass}
        value={draft[key] ?? ""}
        required={required}
        placeholder={placeholder}
        onChange={(event) => change(key, event.target.value)}
        type={key === "website" ? "url" : "text"}
      />
    </label>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent
        className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-4xl overflow-y-auto rounded-2xl bg-white p-0"
        onEscapeKeyDown={(event) => {
          if (locked) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b border-slate-200 px-6 py-5 text-left">
          <DialogTitle className="text-2xl font-bold">
            {profile.id ? "Edit startup" : "Add a startup"}
          </DialogTitle>
          <DialogDescription>
            Manage the card and profile visitors see on your website. Fields marked * are required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="space-y-7 px-6 py-6 disabled:opacity-70">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
              >
                {error}
              </div>
            )}
            <section className="space-y-4">
              <h3 className="text-base font-bold">Startup details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                  Startup name *
                  <input
                    autoFocus
                    required
                    maxLength={200}
                    className={inputClass}
                    value={draft.startupName}
                    onChange={(event) => {
                      const name = event.target.value;
                      setDraft((current) => ({
                        ...current,
                        startupName: name,
                        ...(!customSlug ? { slug: slugifyStartupName(name) } : {}),
                      }));
                    }}
                    placeholder="Your startup's name"
                  />
                </label>
                {textField("founderName", "Founder name", true)}
                {textField("location", "City / location", true, "e.g. Kadapa")}
                {textField("industry", "Industry", true, "e.g. Technology")}
                <label className="block text-sm font-medium text-slate-700">
                  Startup stage *
                  <select
                    className={inputClass}
                    value={draft.stage}
                    onChange={(event) => change("stage", event.target.value)}
                  >
                    {STARTUP_STAGES.map((stage) => (
                      <option key={stage}>{stage}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                  Description / founder story *
                  <textarea
                    required
                    rows={4}
                    className={inputClass}
                    value={draft.shortStory}
                    onChange={(event) => change("shortStory", event.target.value)}
                    placeholder="Tell visitors what this startup does and the story behind it."
                  />
                </label>
                {textField("website", "Website", false, "https://example.com")}
                <label className="block text-sm font-medium text-slate-700">
                  Profile URL *
                  <input
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    className={inputClass}
                    value={draft.slug}
                    onChange={(event) => {
                      setCustomSlug(true);
                      change("slug", event.target.value.toLowerCase());
                    }}
                  />
                  <span className="mt-1 block break-all text-xs text-slate-500">
                    /startups/{draft.slug || "your-startup"}
                  </span>
                </label>
              </div>
            </section>
            <section className="space-y-4 border-t border-slate-200 pt-6">
              <h3 className="text-base font-bold">Images</h3>
              <p className="text-sm text-slate-500">
                Upload a JPG, PNG, WebP, or GIF up to 5 MB, or paste an image URL.
              </p>
              <div className="grid gap-5 sm:grid-cols-3">
                {(
                  [
                    ["startupLogo", "Startup logo"],
                    ["founderImage", "Founder photo"],
                    ["coverImage", "Cover image"],
                  ] as const
                ).map(([key, label]) => (
                  <ImageField
                    key={key}
                    label={label}
                    value={draft[key] ?? ""}
                    disabled={busy}
                    onChange={(url) => change(key, url)}
                    onUploading={(uploading) =>
                      setUploadCount((count) => count + (uploading ? 1 : -1))
                    }
                  />
                ))}
              </div>
            </section>
            <details className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer text-sm font-bold">
                Profile story, milestones & portfolio (optional)
              </summary>
              <div className="mt-5 space-y-6">
                {textField("portfolioHeading", "Portfolio heading")}
                <MilestoneFields
                  value={draft.milestones}
                  onChange={(value) => change("milestones", value)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {textField("mediaDivisionName", "First division name")}
                  {textField("mediaDivisionDescription", "First division description")}
                </div>
                <ProjectFields
                  title="First division projects"
                  value={draft.mediaPortfolio ?? []}
                  onChange={(value) => change("mediaPortfolio", value)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {textField("technologyDivisionName", "Second division name")}
                  {textField("technologyDivisionDescription", "Second division description")}
                </div>
                <ProjectFields
                  title="Second division projects"
                  value={draft.technologyPortfolio ?? []}
                  onChange={(value) => change("technologyPortfolio", value)}
                />
              </div>
            </details>
            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-base font-bold">Visibility & order</h3>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-blue-600"
                  checked={draft.isPublished}
                  onChange={(event) => change("isPublished", event.target.checked)}
                />
                <span>
                  <span className="block font-semibold">Publish on website</span>
                  <span className="text-slate-500">
                    Show this startup on the founder wall and its public profile. Leave unchecked to
                    save a draft.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-blue-600"
                  checked={draft.isFeatured}
                  onChange={(event) => change("isFeatured", event.target.checked)}
                />
                <span>
                  <span className="block font-semibold">Feature as a success story</span>
                  <span className="text-slate-500">
                    Also show in the homepage success stories when published.
                  </span>
                </span>
              </label>
              <label className="block max-w-44 text-sm font-medium text-slate-700">
                Display order
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  className={inputClass}
                  value={draft.sortOrder}
                  onChange={(event) => change("sortOrder", Number(event.target.value))}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Lower numbers appear first.
                </span>
              </label>
            </section>
            <section
              aria-label="Startup card preview"
              className="rounded-xl border border-blue-100 bg-blue-50/50 p-5"
            >
              <p className="mb-4 text-xs font-bold uppercase tracking-wider text-blue-700">
                Card preview
              </p>
              <div className="flex items-center gap-3">
                {draft.startupLogo ? (
                  <img
                    src={draft.startupLogo}
                    alt=""
                    className="size-14 rounded-xl bg-white object-contain"
                  />
                ) : (
                  <Building2 className="size-12 rounded-xl bg-slate-950 p-3 text-white" />
                )}
                <div className="min-w-0">
                  <h3 className="break-words text-lg font-bold">
                    {draft.startupName || "Startup name"}
                  </h3>
                  <p className="text-sm text-blue-700">{draft.stage}</p>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-slate-600">
                {draft.shortStory || "Your startup description will appear here."}
              </p>
              <p className="mt-3 text-sm font-medium">
                {draft.founderName || "Founder name"} · {draft.location || "Location"}
              </p>
            </section>
          </fieldset>
          <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
            <button
              type="button"
              disabled={locked}
              onClick={onClose}
              className="min-h-11 rounded-lg border border-slate-300 px-5 text-sm font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={locked}
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {locked && <LoaderCircle size={16} className="animate-spin" />}
              {uploadCount > 0
                ? "Uploading images…"
                : busy
                  ? "Saving…"
                  : profile.id
                    ? "Save changes"
                    : draft.isPublished
                      ? "Publish startup"
                      : "Save draft"}
            </button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImageField({
  label,
  value,
  disabled,
  onChange,
  onUploading,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (url: string) => void;
  onUploading: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [failedPreview, setFailedPreview] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    setError("");
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const extension = extensions[file.type];
    if (!extension || file.size > 5 * 1024 * 1024 || file.size === 0) {
      setError("Choose a JPG, PNG, WebP, or GIF between 1 byte and 5 MB.");
      return;
    }
    setUploading(true);
    onUploading(true);
    try {
      const path = `startups/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("startup-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("startup-images").getPublicUrl(path);
      onChange(data.publicUrl);
    } catch {
      setError("Image upload failed. Please try again or paste an image URL.");
    } finally {
      setUploading(false);
      onUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {label}
        <input
          className={inputClass}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || uploading}
          placeholder="https://… or /images/…"
        />
      </label>
      <div className="mt-2 flex h-24 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
        {value && failedPreview !== value ? (
          <img
            src={value}
            onError={() => setFailedPreview(value)}
            alt={`${label} preview`}
            className="h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-xs text-slate-400">
            {value ? "Image unavailable" : "No image selected"}
          </span>
        )}
      </div>
      <label
        className={`mt-2 inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-blue-700 ${disabled || uploading ? "pointer-events-none opacity-50" : ""}`}
      >
        {uploading ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}
        {uploading ? "Uploading…" : "Upload image"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          disabled={disabled || uploading}
          className="sr-only"
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {value && (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => onChange("")}
          className="ml-3 text-xs text-slate-500 hover:text-rose-600"
        >
          Remove
        </button>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

function MilestoneFields({
  value,
  onChange,
}: {
  value: StartupMilestone[];
  onChange: (value: StartupMilestone[]) => void;
}) {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">Milestones</h4>
      {value.map((milestone, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center gap-3">
            <label className="flex-1 text-xs text-slate-500">
              Milestone {index + 1} title
              <input
                aria-label={`Milestone ${index + 1} title`}
                className={inputClass}
                value={milestone.title}
                required
                onChange={(event) =>
                  onChange(
                    value.map((item, i) =>
                      i === index ? { ...item, title: event.target.value } : item,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              aria-label={`Remove milestone ${index + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              className="mt-5 p-2 text-rose-600"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <label className="block text-xs text-slate-500">
            Description
            <textarea
              aria-label={`Milestone ${index + 1} description`}
              className={inputClass}
              value={milestone.description}
              rows={2}
              onChange={(event) =>
                onChange(
                  value.map((item, i) =>
                    i === index ? { ...item, description: event.target.value } : item,
                  ),
                )
              }
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...value,
            { number: String(value.length + 1).padStart(2, "0"), title: "", description: "" },
          ])
        }
        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"
      >
        <Plus size={15} />
        Add milestone
      </button>
    </section>
  );
}

function ProjectFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: StartupProject[];
  onChange: (value: StartupProject[]) => void;
}) {
  const fields = [
    ["name", "Project name"],
    ["description", "Description"],
    ["url", "Project URL"],
    ["linkLabel", "Link text"],
  ] as const;
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      {value.map((project, index) => (
        <div key={index} className="rounded-lg border border-slate-200 p-3">
          <div className="flex justify-between text-xs font-semibold text-slate-500">
            <span>Project {index + 1}</span>
            <button
              type="button"
              aria-label={`Remove ${title.toLowerCase()} project ${index + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              className="p-1 text-rose-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {fields.map(([key, label]) => (
              <label key={key} className="text-xs text-slate-500">
                {label}
                <input
                  className={inputClass}
                  type={key === "url" ? "url" : "text"}
                  required={key === "name" || key === "url"}
                  value={project[key]}
                  onChange={(event) =>
                    onChange(
                      value.map((item, i) =>
                        i === index ? { ...item, [key]: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...value, { name: "", description: "", url: "", linkLabel: "Visit website" }])
        }
        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"
      >
        <Plus size={15} />
        Add project
      </button>
    </section>
  );
}
