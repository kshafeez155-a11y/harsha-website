import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const liveHub = {
  id: "live-hub",
  city: "Live City",
  district: "Live District",
  status: "Active",
  summary: "A newly updated hub summary",
  description: "Support published by the local manager",
  focus_areas: ["A current focus area"],
  facilities: ["A current facility"],
  contact_name: "Local support team",
  contact_email: "hub@example.test",
  contact_phone: "+91 90000 00000",
};
const liveEvent = {
  id: "new-live-workshop",
  hub_id: liveHub.id,
  title: "Manager-published workshop",
  date: "2027-02-20",
  time: "10:00 AM",
  venue: "The new hub venue",
  type: "Workshop",
  summary: "A current workshop description",
  is_published: true,
};

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

function renderPage(
  source,
  { hubQueryOverrides = {}, eventQueryOverrides = {}, params = {}, search = {} } = {},
) {
  let options;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const query = (data, overrides) => ({
    data,
    isPending: false,
    isError: false,
    refetch() {},
    ...overrides,
  });
  const modules = {
    react: { useState: (initial) => [initial, () => {}], useMemo: (factory) => factory() },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@tanstack/react-router": {
      createFileRoute: () => (value) => {
        options = value;
        return { ...value, useSearch: () => search, useParams: () => params };
      },
    },
    "lucide-react": new Proxy({}, { get: () => "icon" }),
    "@/components/site/Navbar": { Navbar: "navbar" },
    "@/components/site/Footer": { Footer: "footer" },
    "@/components/site/HubSelect": { HubDataNotice: "hub-notice" },
    "@/hooks/use-hubs": {
      useHubs: () => query([liveHub], hubQueryOverrides),
      useHubEvents: () => query([liveEvent], eventQueryOverrides),
      formatEventDate: (date) => date,
    },
  };
  const fileName = path.resolve(source);
  const output = ts.transpileModule(fs.readFileSync(fileName, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName,
  }).outputText;
  vm.runInNewContext(
    output,
    {
      exports: {},
      require(name) {
        assert.ok(name in modules, `Unexpected page dependency: ${name}`);
        return modules[name];
      },
    },
    { filename: fileName },
  );
  return options.component();
}

test("hub directory renders database content rather than the static seed", () => {
  const tree = renderPage("src/routes/hubs/index.tsx");
  assert.match(text(tree), /Live City/);
  assert.match(text(tree), /newly updated hub summary/);
  assert.doesNotMatch(text(tree), /Proddatur|Kadapa|Tirupati/);
  assert.ok(nodes(tree).some((node) => node.type === "a" && node.props.href === "/hubs/live-hub"));
});

test("hub profile displays manager edits and preserves the chosen hub in the join link", () => {
  const tree = renderPage("src/routes/hubs/$hubId.tsx", { params: { hubId: liveHub.id } });
  assert.match(text(tree), /Support published by the local manager/);
  assert.match(text(tree), /Local support team/);
  assert.ok(
    nodes(tree).some(
      (node) => node.type === "a" && node.props.href === "/community/join?hub=live-hub",
    ),
  );
  assert.ok(
    nodes(tree).some((node) => node.type === "a" && node.props.href === "mailto:hub@example.test"),
  );
  assert.ok(
    nodes(tree).some((node) => node.type === "a" && node.props.href === "tel:+919000000000"),
  );
  const focus = nodes(tree).find((node) => node.props.label === "Focus areas");
  assert.deepEqual(Array.from(focus.props.items), liveHub.focus_areas);
});

test("event listings show newly published database events and their exact registration link", () => {
  const tree = renderPage("src/routes/events/index.tsx", { search: { hub: "" } });
  assert.match(text(tree), /Manager-published workshop/);
  assert.match(text(tree), /The new hub venue/);
  assert.match(text(tree), /Live City/);
  assert.ok(
    nodes(tree).some(
      (node) => node.type === "a" && node.props.href === "/events/register?event=new-live-workshop",
    ),
  );
});

test("the event hub filter excludes events from other hubs", () => {
  const tree = renderPage("src/routes/events/index.tsx", { search: { hub: "another-hub" } });
  assert.doesNotMatch(text(tree), /Manager-published workshop/);
  assert.match(text(tree), /No published event matches/);
});

test("loading failures suppress cached directory and event content instead of showing stale listings", () => {
  for (const source of [
    "src/routes/hubs/index.tsx",
    "src/routes/events/index.tsx",
    "src/routes/hubs/$hubId.tsx",
  ]) {
    const tree = renderPage(source, {
      hubQueryOverrides: { isError: true },
      params: { hubId: liveHub.id },
      search: { hub: "" },
    });
    assert.doesNotMatch(
      text(tree),
      /newly updated hub summary|Manager-published workshop|Support published by the local manager/,
    );
    assert.ok(nodes(tree).some((node) => node.type === "hub-notice" && node.props.unavailable));
    assert.doesNotMatch(text(tree), /Hub not found|No matching hub yet|No published event matches/);
  }
});
