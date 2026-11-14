import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadEnv } from "vite";

import { createSupabaseClients } from "../src/lib/supabase-clients.ts";

const env = loadEnv("development", process.cwd());
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error("Configure the Supabase URL and publishable key before running diagnostics.");
}

const { publicSupabase } = createSupabaseClients(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
    },
  },
);

const tables = [
  "contact_submissions",
  "community_join_applications",
  "chapter_applications",
  "event_registrations",
  "meeting_registrations",
  "partner_applications",
  "founder_connection_requests",
  "startup_registrations",
  "pitch_deck_submissions",
];

let failures = 0;
for (const table of tables) {
  const result = await publicSupabase.from(table).select("id").limit(0);
  const privateReadDenied = [401, 403].includes(result.status) && result.error?.code === "42501";
  if (result.error && !privateReadDenied) failures += 1;
  console.log(
    JSON.stringify({
      check: "public-access-probe",
      table,
      status: result.status,
      code: result.error?.code,
      message: result.error?.message,
      ...(privateReadDenied ? { privateReadDenied: true } : {}),
    }),
  );
}

if (!process.argv.includes("--submit")) {
  console.log("Read-only checks finished. Use --submit to create labelled diagnostic submissions.");
  process.exitCode = failures ? 1 : 0;
} else {
  const runId = randomUUID();
  const marker = `Hanova diagnostic ${runId}`;
  const email = `hanova-diagnostic-${runId}@example.invalid`;
  const text = "Diagnostic submission created to verify the Hanova form-to-admin data flow.";
  const person = { name: marker, phone: "0000000000", email, city: "Diagnostic test" };
  const manifestPath = ".hanova-diagnostic.local";
  const priorRuns = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "[]"));
  const run = { runId, marker, email, createdAt: new Date().toISOString(), rows: [], files: [] };
  priorRuns.push(run);
  const saveManifest = () => writeFile(manifestPath, JSON.stringify(priorRuns, null, 2) + "\n");
  await saveManifest();

  const fixtures = [
    [
      "contact_submissions",
      { contact_name: marker, contact_phone: person.phone, contact_email: email, message: text },
    ],
    [
      "community_join_applications",
      {
        ...person,
        district: "Diagnostic test",
        college_or_company: marker,
        profession: "other",
        startup_stage: "not-started",
        startup_name: null,
        consent_given: true,
      },
    ],
    [
      "chapter_applications",
      {
        ...person,
        district: "Diagnostic test",
        profession: "other",
        organization: marker,
        linkedin: null,
        entrepreneurship_experience: text,
        weekly_commitment: "1 hour",
        motivation: text,
        city_ecosystem: text,
        first_meetup_plan: text,
        community_reach: null,
        consent_given: true,
      },
    ],
    ["event_registrations", { ...person, purpose: text, consent_given: true }],
    ["meeting_registrations", { ...person, role: "other", purpose: text, consent_given: true }],
    [
      "partner_applications",
      {
        name: marker,
        email,
        phone: person.phone,
        organization: marker,
        location: person.city,
        website: null,
        organization_type: "Diagnostic test organization",
        partnership_interest: "Other",
        contribution: text,
        goal: text,
        community_reach: null,
        ecosystem_experience: null,
        consent_given: true,
      },
    ],
    [
      "founder_connection_requests",
      {
        ...person,
        startup_name: marker,
        founder: "harsha",
        startup_stage: "idea",
        meeting_purpose: "other",
        context: text,
        desired_outcome: text,
        preferred_date: null,
        preferred_time: null,
        consent_given: true,
      },
    ],
  ];

  for (const [table, payload] of fixtures) {
    const result = await publicSupabase.from(table).insert(payload);
    if (result.error) failures += 1;
    else {
      run.rows.push({
        table,
        emailColumn: table === "contact_submissions" ? "contact_email" : "email",
      });
      await saveManifest();
    }
    console.log(
      JSON.stringify({
        check: "diagnostic-insert",
        table,
        status: result.status,
        code: result.error?.code,
        message: result.error?.message,
      }),
    );
  }

  const path = `intake/${randomUUID()}.pdf`;
  const pdf = createDiagnosticPdf();
  const upload = await publicSupabase.storage.from("pitch-decks").upload(path, pdf, {
    contentType: "application/pdf",
    upsert: false,
  });
  console.log(
    JSON.stringify({
      check: "pitch-deck-upload",
      ok: !upload.error,
      message: upload.error?.message,
      status: upload.error?.statusCode,
    }),
  );

  if (upload.error) failures += 1;
  else {
    run.files.push({ bucket: "pitch-decks", path });
    await saveManifest();
    const table = "startup_registrations";
    const result = await publicSupabase.from(table).insert({
      startup_name: marker,
      founder_name: marker,
      problem: text,
      solution: text,
      startup_stage: "idea",
      website: null,
      linkedin: null,
      phone: person.phone,
      email,
      pitch_deck_path: path,
      consent_given: true,
    });
    if (result.error) failures += 1;
    else {
      run.rows.push({ table, emailColumn: "email" });
      await saveManifest();
    }
    console.log(
      JSON.stringify({
        check: "diagnostic-insert",
        table,
        status: result.status,
        code: result.error?.code,
        message: result.error?.message,
      }),
    );
  }

  console.log(JSON.stringify({ marker, failures, cleanupManifest: manifestPath }));
  process.exitCode = failures ? 1 : 0;
}

function createDiagnosticPdf() {
  const stream = "BT /F1 14 Tf 30 150 Td (Hanova diagnostic test - not a real application) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let content = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(content.length);
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = content.length;
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  content += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([content], { type: "application/pdf" });
}
