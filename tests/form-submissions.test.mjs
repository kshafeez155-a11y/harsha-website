import assert from "node:assert/strict";
import { File } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import ts from "typescript";

import * as chapterData from "../src/data/chapterData.ts";
import * as siteData from "../src/data/siteData.ts";

const base = {
  name: "Alex Intake Tester",
  phone: "+91 90000 00000",
  email: "intake@example.test",
  city: "Kadapa",
};
const deckPath = "intake/11111111-1111-4111-8111-111111111111.pdf";

const cases = [
  {
    name: "community application",
    source: "src/routes/community/join.tsx",
    table: "community_join_applications",
    values: {
      ...base,
      district: "YSR Kadapa",
      college_or_company: "Example Works",
      profession: "Founder",
      startup_stage: "mvp",
      startup_name: "Test Startup",
    },
    expected: {
      ...base,
      district: "YSR Kadapa",
      college_or_company: "Example Works",
      profession: "Founder",
      startup_stage: "mvp",
      startup_name: "Test Startup",
      consent_given: true,
    },
    confirmation: "Registration completed",
  },
  {
    name: "chapter application",
    source: "src/routes/chapters/apply.tsx",
    table: "chapter_applications",
    values: {
      ...base,
      district: "YSR Kadapa",
      profession: "Mentor",
      organization: "Example Works",
      linkedin: "https://example.test/founder",
      entrepreneurship_experience: "Three years of product development",
      weekly_commitment: "Four hours",
      motivation: "Support local founders",
      city_ecosystem: "A growing student community",
      first_meetup_plan: "A founder introduction session",
      community_reach: "",
    },
    expected: {
      ...base,
      district: "YSR Kadapa",
      profession: "Mentor",
      organization: "Example Works",
      linkedin: "https://example.test/founder",
      entrepreneurship_experience: "Three years of product development",
      weekly_commitment: "Four hours",
      motivation: "Support local founders",
      city_ecosystem: "A growing student community",
      first_meetup_plan: "A founder introduction session",
      community_reach: null,
      consent_given: true,
    },
    confirmation: "Chapter application received",
  },
  {
    name: "event registration",
    source: "src/routes/events/register.tsx",
    table: "event_registrations",
    search: { event: siteData.hubEvents[0].id },
    values: { ...base, purpose: "Meet local startup mentors" },
    expected: { ...base, purpose: "Meet local startup mentors", consent_given: true },
    confirmation: "Registration received",
  },
  {
    name: "meeting registration",
    source: "src/routes/meetings/register.tsx",
    table: "meeting_registrations",
    search: { meeting: chapterData.chapterMeetings.find((item) => item.status === "upcoming").id },
    values: { ...base, role: "Founder", purpose: "Validate a product idea" },
    expected: {
      ...base,
      role: "Founder",
      purpose: "Validate a product idea",
      consent_given: true,
    },
    confirmation: "Registration received",
  },
  {
    name: "partnership application",
    source: "src/routes/partners.tsx",
    table: "partner_applications",
    values: {
      name: base.name,
      email: base.email,
      phone: base.phone,
      organization: "Example Works",
      location: "Kadapa, Andhra Pradesh",
      website: "",
      organization_type: "Local artisan cooperative",
      partnership_interest: "Founder programs",
      contribution: "Workshop space and volunteer mentors",
      goal: "Support first-time founders",
      community_reach: "",
      ecosystem_experience: "",
    },
    expected: {
      name: base.name,
      email: base.email,
      phone: base.phone,
      organization: "Example Works",
      location: "Kadapa, Andhra Pradesh",
      website: null,
      organization_type: "Local artisan cooperative",
      partnership_interest: "Founder programs",
      contribution: "Workshop space and volunteer mentors",
      goal: "Support first-time founders",
      community_reach: null,
      ecosystem_experience: null,
      consent_given: true,
    },
    confirmation: "Partnership interest received",
  },
  {
    name: "founder connection request",
    source: "src/routes/founders/connect.tsx",
    table: "founder_connection_requests",
    values: {
      ...base,
      startup_name: "",
      founder: "harsha",
      startup_stage: "idea",
      meeting_purpose: "idea",
      context: "Interviewing potential customers",
      desired_outcome: "A clearer validation plan",
      preferred_date: "",
      preferred_time: "",
    },
    expected: {
      ...base,
      startup_name: null,
      founder: "harsha",
      startup_stage: "idea",
      meeting_purpose: "idea",
      context: "Interviewing potential customers",
      desired_outcome: "A clearer validation plan",
      preferred_date: null,
      preferred_time: null,
      consent_given: true,
    },
    confirmation: "Meeting request received",
  },
  {
    name: "contact message",
    source: "src/components/site/Contact.tsx",
    exportName: "Contact",
    table: "contact_submissions",
    values: {
      "contact-name": base.name,
      "contact-phone": base.phone,
      "contact-email": base.email,
      "contact-location": " Kadapa ",
      message: "Please share the next community meetup details.",
    },
    expected: {
      contact_name: base.name,
      contact_phone: base.phone,
      contact_email: base.email,
      message: "Location: Kadapa\n\nPlease share the next community meetup details.",
    },
    confirmation: "Your message was sent successfully.",
  },
  {
    name: "startup registration",
    source: "src/routes/startups/register.tsx",
    table: "startup_registrations",
    values: {
      startup_name: "Test Startup",
      founder_name: base.name,
      problem: "Local teams struggle to find relevant mentors",
      solution: "A regional mentor directory",
      startup_stage: "mvp",
      website: "https://example.test/startup",
      linkedin: "",
      phone: base.phone,
      email: base.email,
      pitch_deck: new File(["%PDF-1.4\n%%EOF"], "pitch.pdf", { type: "application/pdf" }),
    },
    expected: {
      startup_name: "Test Startup",
      founder_name: base.name,
      problem: "Local teams struggle to find relevant mentors",
      solution: "A regional mentor directory",
      startup_stage: "mvp",
      website: "https://example.test/startup",
      linkedin: null,
      phone: base.phone,
      email: base.email,
      pitch_deck_path: deckPath,
      consent_given: true,
    },
    confirmation: "Startup registration completed",
  },
];

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}

function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  return tree && typeof tree === "object" ? text(tree.props?.children) : "";
}

function loadForm(fixture, { uploadError = null } = {}) {
  const inserted = deferred();
  const requests = { inserts: [], uploads: [], removals: [], authenticatedClientAccesses: 0 };
  const states = [];
  let stateIndex = 0;
  let routeOptions;
  let resetCount = 0;
  const form = {
    values: { ...fixture.values },
    querySelector: () => ({ checked: true }),
    reset() {
      resetCount += 1;
      this.values = {};
    },
  };
  const publicSupabase = {
    from(table) {
      return {
        insert(payload) {
          requests.inserts.push({ table, payload: JSON.parse(JSON.stringify(payload)) });
          return inserted.promise;
        },
      };
    },
    storage: {
      from(bucket) {
        return {
          async upload(filePath, file, options) {
            requests.uploads.push({ bucket, filePath, file, options });
            return { error: uploadError };
          },
          async remove(paths) {
            requests.removals.push({ bucket, paths });
            return { error: null };
          },
        };
      },
    },
  };
  const authenticatedSupabase = new Proxy(
    {},
    {
      get() {
        requests.authenticatedClientAccesses += 1;
        throw new Error("A public form used the authenticated admin client");
      },
    },
  );
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const modules = {
    react: {
      useState(initialValue) {
        const index = stateIndex++;
        if (!(index in states)) {
          states[index] = typeof initialValue === "function" ? initialValue() : initialValue;
        }
        return [
          states[index],
          (value) => {
            states[index] = typeof value === "function" ? value(states[index]) : value;
          },
        ];
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@tanstack/react-router": {
      createFileRoute: () => (options) => {
        routeOptions = options;
        return { ...options, useSearch: () => fixture.search ?? {} };
      },
    },
    "lucide-react": new Proxy({}, { get: () => "icon" }),
    "@/components/site/Navbar": { Navbar: "navbar" },
    "@/components/site/Footer": { Footer: "footer" },
    "@/lib/supabase": { publicSupabase, supabase: authenticatedSupabase },
    "@/lib/reliability": { getUserFacingError: (_error, fallback) => fallback },
    "@/data/siteData": siteData,
    "@/data/chapterData": chapterData,
  };
  const sourcePath = path.resolve(fixture.source);
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: sourcePath,
  }).outputText;
  const exports = {};
  const sandbox = {
    exports,
    require(name) {
      assert.ok(name in modules, `Unexpected form dependency: ${name}`);
      return modules[name];
    },
    File,
    FormData: class {
      constructor(currentForm) {
        this.values = currentForm.values;
      }
      get(name) {
        return this.values[name] ?? null;
      }
      entries() {
        return Object.entries(this.values)[Symbol.iterator]();
      }
    },
    window: { scrollTo() {} },
    crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
    console: { error() {}, info() {} },
  };
  vm.runInNewContext(compiled, sandbox, { filename: sourcePath });
  const component = fixture.exportName ? exports[fixture.exportName] : routeOptions.component;

  function render() {
    stateIndex = 0;
    return component();
  }

  return {
    requests,
    inserted,
    form,
    render,
    get resetCount() {
      return resetCount;
    },
    submit() {
      const renderedForms = nodes(render()).filter((node) => node.type === "form");
      assert.equal(renderedForms.length, 1, "Expected one usable public form");
      return renderedForms[0].props.onSubmit({ preventDefault() {}, currentTarget: form });
    },
  };
}

async function waitForInsert(harness) {
  // Startup intake awaits its upload before it reaches the database insert.
  for (let attempt = 0; attempt < 10 && harness.requests.inserts.length === 0; attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(harness.requests.authenticatedClientAccesses, 0);
  assert.equal(harness.requests.inserts.length, 1, "The public handler must reach its insert");
}

for (const fixture of cases) {
  test(`${fixture.name}: saves the actual form payload and waits for database confirmation`, async () => {
    const harness = loadForm(fixture);
    const submission = harness.submit();
    await waitForInsert(harness);

    const request = harness.requests.inserts[0];
    assert.equal(request.table, fixture.table);
    const actualPayload = Array.isArray(request.payload) ? request.payload[0] : request.payload;
    assert.deepEqual(actualPayload, fixture.expected);
    assert.equal(harness.resetCount, 0, "Values must not reset before confirmation");
    assert.equal(text(harness.render()).includes(fixture.confirmation), false);

    harness.inserted.resolve({ error: null });
    await submission;

    assert.equal(harness.resetCount, 1);
    assert.ok(text(harness.render()).includes(fixture.confirmation));
    assert.equal(harness.requests.authenticatedClientAccesses, 0);

    if (fixture.table === "startup_registrations") {
      assert.equal(harness.requests.uploads.length, 1);
      const upload = harness.requests.uploads[0];
      assert.equal(upload.bucket, "pitch-decks");
      assert.equal(upload.filePath, actualPayload.pitch_deck_path);
      assert.equal(upload.file, fixture.values.pitch_deck);
      assert.equal(upload.options.contentType, "application/pdf");
    }
  });

  test(`${fixture.name}: insert failure preserves entered values and never shows success`, async () => {
    const harness = loadForm(fixture);
    const submission = harness.submit();
    await waitForInsert(harness);
    harness.inserted.resolve({ error: { code: "42501", message: "Insert denied" } });
    await submission;

    assert.equal(harness.resetCount, 0);
    assert.deepEqual(harness.form.values, fixture.values);
    assert.equal(text(harness.render()).includes(fixture.confirmation), false);
    assert.match(text(harness.render()), /could not/i);
    assert.equal(nodes(harness.render()).filter((node) => node.type === "form").length, 1);
    assert.equal(harness.requests.authenticatedClientAccesses, 0);
  });
}

test("startup upload failure prevents application insertion and keeps the form filled", async () => {
  const fixture = cases.find((item) => item.table === "startup_registrations");
  const harness = loadForm(fixture, { uploadError: { message: "Bucket not found" } });
  await harness.submit();

  assert.equal(harness.requests.uploads.length, 1);
  assert.equal(harness.requests.inserts.length, 0);
  assert.equal(harness.resetCount, 0);
  assert.deepEqual(harness.form.values, fixture.values);
  assert.equal(text(harness.render()).includes(fixture.confirmation), false);
  assert.match(text(harness.render()), /could not/i);
  assert.equal(harness.requests.authenticatedClientAccesses, 0);
});
