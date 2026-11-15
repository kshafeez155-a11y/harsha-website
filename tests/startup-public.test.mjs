import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const stages = ["Idea Stage", "MVP", "Early Revenue", "Growth Stage", "Funded"];

function startup(overrides = {}) {
  return {
    id: "startup-one",
    slug: "regional-venture",
    startupName: "Regional Venture",
    founderName: "Example Founder",
    location: "Kadapa",
    industry: "Technology",
    shortStory: "A published founder profile.",
    stage: "MVP",
    startupLogo: "",
    founderImage: "",
    coverImage: "",
    website: "",
    milestones: [],
    isPublished: true,
    isFeatured: false,
    sortOrder: 0,
    ...overrides,
  };
}

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node == null || typeof node === "boolean") return "";
  return typeof node === "object" ? text(node.props?.children) : String(node);
}

function renderer(source, exportName, query = {}, slug = "regional-venture") {
  const result = { data: [], isPending: false, isError: false, refetch() {}, ...query };
  const states = [];
  let stateIndex = 0;
  let routeOptions;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const modules = {
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [
          states[index],
          (value) => {
            states[index] = value;
          },
        ];
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@tanstack/react-router": {
      Link: "link",
      createFileRoute: () => (options) => {
        routeOptions = options;
        return { ...options, useParams: () => ({ startupSlug: slug }) };
      },
    },
    "lucide-react": new Proxy({}, { get: (_target, key) => `icon-${String(key)}` }),
    "@/hooks/use-startup-profiles": { useStartupProfiles: () => result },
    "@/lib/startup-profiles": { STARTUP_STAGES: stages },
    "@/components/site/Navbar": { Navbar: "navbar" },
    "@/components/site/Footer": { Footer: "footer" },
  };
  const filename = path.resolve(source);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    compiled,
    {
      exports,
      require(name) {
        assert.ok(name in modules, `Unexpected dependency: ${name}`);
        return modules[name];
      },
    },
    { filename },
  );
  const component = exportName ? exports[exportName] : routeOptions.component;
  return {
    result,
    render() {
      stateIndex = 0;
      return component({});
    },
  };
}

const wallSource = "src/components/site/FounderWall.tsx";
const storiesSource = "src/components/site/SuccessStories.tsx";
const detailSource = "src/routes/startups/$startupSlug.tsx";

test("founder wall uses the saved profiles and stage buttons filter the displayed cards", () => {
  const wall = renderer(wallSource, "FounderWall", {
    data: [
      startup(),
      startup({
        id: "startup-two",
        slug: "funded-venture",
        startupName: "Funded Venture",
        stage: "Funded",
      }),
    ],
  });
  assert.equal(nodes(wall.render()).filter((node) => node.type === "article").length, 2);
  const fundedFilter = nodes(wall.render()).find(
    (node) => node.type === "button" && text(node) === "Funded",
  );
  fundedFilter.props.onClick();
  const filtered = wall.render();
  const cards = nodes(filtered).filter((node) => node.type === "article");
  assert.equal(cards.length, 1);
  assert.match(text(cards[0]), /Funded Venture/);
  assert.doesNotMatch(text(cards[0]), /Regional Venture/);
  assert.equal(
    nodes(filtered).find((node) => node.type === "button" && text(node) === "Funded").props[
      "aria-pressed"
    ],
    true,
  );
});

test("empty saved data never restores sample or formerly published founder cards", () => {
  const wall = renderer(wallSource, "FounderWall");
  const rendered = wall.render();
  assert.equal(nodes(rendered).filter((node) => node.type === "article").length, 0);
  assert.match(text(rendered), /New startups are on the way/);
  assert.doesNotMatch(text(rendered), /Startup Two|Startup Three|Mila Innovations/);
});

test("a failed founder query shows retry instead of an empty-success state", () => {
  let retried = false;
  const wall = renderer(wallSource, "FounderWall", {
    isError: true,
    refetch() {
      retried = true;
    },
  });
  const rendered = wall.render();
  assert.match(text(rendered), /could not be loaded/);
  assert.doesNotMatch(text(rendered), /New startups are on the way/);
  nodes(rendered)
    .find((node) => node.type === "button" && text(node) === "Try again")
    .props.onClick();
  assert.equal(retried, true);
});

test("success stories hide when no saved startup is featured", () => {
  const stories = renderer(storiesSource, "SuccessStories", { data: [startup()] });
  assert.equal(stories.render(), null);
  stories.result.data = [
    startup({ isFeatured: true }),
    startup({ id: "unfeatured", startupName: "Unfeatured Venture" }),
  ];
  const rendered = stories.render();
  assert.equal(nodes(rendered).filter((node) => node.type === "article").length, 1);
  assert.match(text(rendered), /Regional Venture/);
  assert.doesNotMatch(text(rendered), /Unfeatured Venture/);
  assert.ok(
    nodes(rendered)
      .filter((node) => node.type === "img")
      .every((node) => node.props.src),
  );
});

test("startup detail waits for data and never revives an unpublished static story", () => {
  const detail = renderer(detailSource, null, { isPending: true }, "omax-media");
  assert.match(text(detail.render()), /Loading startup/);
  assert.doesNotMatch(text(detail.render()), /Startup not found/);
  detail.result.isPending = false;
  assert.match(text(detail.render()), /Startup not found/);
  assert.doesNotMatch(text(detail.render()), /Mila Innovations/);
});

test("startup detail links the saved website and omits blank images or empty milestones", () => {
  const detail = renderer(detailSource, null, {
    data: [startup({ website: "https://venture.example.com" })],
  });
  const rendered = detail.render();
  assert.equal(
    nodes(rendered).find((node) => node.type === "a" && text(node).includes("Visit website")).props
      .href,
    "https://venture.example.com",
  );
  assert.ok(
    nodes(rendered)
      .filter((node) => node.type === "img")
      .every((node) => node.props.src),
  );
  assert.doesNotMatch(text(rendered), /The startup journey/);
});
