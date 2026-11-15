import assert from "node:assert/strict";
import { File } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import * as profileApi from "../src/lib/startup-profiles.ts";

const editorSource = "src/components/admin/StartupProfileEditor.tsx";
const portfolioSource = "src/routes/admin/portfolio.tsx";

function startup(overrides = {}) {
  return {
    ...profileApi.newStartupProfile(),
    startupName: "Regional Venture", slug: "regional-venture", founderName: "Example Founder",
    location: "Kadapa", industry: "Technology", shortStory: "A founder-led business.",
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
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

function control(tree, label) {
  const labelled = nodes(tree).find((node) => node.type === "label" && text(node).startsWith(label));
  assert.ok(labelled, `Missing label ${label}`);
  return nodes(labelled).find((node) => ["input", "textarea", "select"].includes(node.type));
}

function button(tree, label) {
  const found = nodes(tree).find((node) => node.type === "button" && text(node).trim() === label);
  assert.ok(found, `Missing button ${label}`);
  return found;
}

function renderer(source, exportName, { props = {}, api = {}, storage, query = {}, confirm = true } = {}) {
  const states = [];
  let stateIndex = 0;
  let routeOptions;
  const invalidations = [];
  const result = { data: [], isPending: false, isError: false, isFetching: false, refetch() {}, ...query };
  const jsx = (type, componentProps) => ({ type, props: componentProps ?? {} });
  const modules = {
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "lucide-react": new Proxy({}, { get: (_target, key) => `icon-${String(key)}` }),
    "@tanstack/react-router": {
      createFileRoute: () => (options) => { routeOptions = options; return options; },
    },
    "@tanstack/react-query": {
      useQuery: () => result,
      useQueryClient: () => ({ async invalidateQueries(options) { invalidations.push(options); } }),
    },
    "@/components/admin/AdminShell": { AdminShell: "admin-shell" },
    "@/components/admin/admin-auth": { requireAdmin() {} },
    "@/components/admin/StartupProfileEditor": { StartupProfileEditor: "profile-editor" },
    "@/components/ui/dialog": Object.fromEntries(
      ["Dialog", "DialogContent", "DialogDescription", "DialogHeader", "DialogTitle"].map((name) => [name, name]),
    ),
    "@/lib/startup-profiles": { ...profileApi, ...api },
    "@/lib/supabase": { supabase: { storage } },
  };
  const filename = path.resolve(source);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  // Expose the file-local image component to exercise its actual asynchronous upload handler.
  const exposeImage = source === editorSource ? "\nexports.TestImageField = ImageField;" : "";
  vm.runInNewContext(compiled + exposeImage, {
    exports, Error, crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
    window: { confirm: () => confirm },
    require(name) { assert.ok(name in modules, `Unexpected dependency: ${name}`); return modules[name]; },
  }, { filename });
  const component = exportName ? exports[exportName] : routeOptions.component;
  return {
    props, result, invalidations,
    render() { stateIndex = 0; return component(props); },
    submit() { return nodes(this.render()).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); },
  };
}

test("new editor defaults to a draft and publishing updates the profile passed to save", async () => {
  const saved = [];
  const editor = renderer(editorSource, "StartupProfileEditor", {
    props: { profile: startup(), busy: false, onSave: async (value) => saved.push(value), onClose() {} },
  });
  assert.equal(control(editor.render(), "Publish on website").props.checked, false);
  assert.ok(button(editor.render(), "Save draft"));
  control(editor.render(), "Startup name").props.onChange({ target: { value: "Updated Venture" } });
  assert.equal(control(editor.render(), "Profile URL").props.value, "updated-venture");
  control(editor.render(), "Publish on website").props.onChange({ target: { checked: true } });
  assert.ok(button(editor.render(), "Publish startup"));
  await editor.submit();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].startupName, "Updated Venture");
  assert.equal(saved[0].isPublished, true);
  assert.equal(profileApi.startupProfilePayload(saved[0]).is_published, true);
});

test("required fields, reserved slugs, and unsafe URLs prevent editor save", async () => {
  for (const [overrides, expected] of [
    [{ founderName: "" }, /Founder name is required/],
    [{ slug: "register" }, /reserved/],
    [{ website: "javascript:alert(1)" }, /http\(s\)/],
  ]) {
    let saves = 0;
    const editor = renderer(editorSource, "StartupProfileEditor", {
      props: { profile: startup(overrides), busy: false, onSave: async () => { saves += 1; }, onClose() {} },
    });
    await editor.submit();
    assert.equal(saves, 0);
    const alerts = nodes(editor.render()).filter((node) => node.props.role === "alert");
    assert.equal(alerts.length, 1);
    assert.match(text(alerts[0]), expected);
  }
});

test("failed asynchronous save keeps the editor and typed input without a success state", async () => {
  const write = deferred();
  let closes = 0;
  const page = renderer(portfolioSource, null, {
    api: { saveStartupProfile: () => write.promise },
  });
  button(page.render(), "Add startup").props.onClick();
  const pageEditor = nodes(page.render()).find((node) => node.type === "profile-editor");
  const editor = renderer(editorSource, "StartupProfileEditor", {
    props: { ...pageEditor.props, profile: startup(), onClose() { closes += 1; } },
  });
  control(editor.render(), "Startup name").props.onChange({ target: { value: "Still here after failure" } });
  let settled = false;
  const saving = editor.submit().then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  const pendingEditor = nodes(page.render()).find((node) => node.type === "profile-editor");
  assert.ok(pendingEditor, "The editor must remain open before the database confirms the write");
  assert.equal(pendingEditor.props.busy, true);
  assert.equal(nodes(page.render()).filter((node) => node.props.role === "status").length, 0);
  write.reject(new Error("Connection interrupted"));
  await saving;
  assert.equal(control(editor.render(), "Startup name").props.value, "Still here after failure");
  assert.match(text(editor.render()), /Connection interrupted/);
  assert.equal(closes, 0);
  assert.ok(nodes(page.render()).find((node) => node.type === "profile-editor"));
  assert.equal(nodes(page.render()).filter((node) => node.props.role === "status").length, 0);
  assert.equal(page.invalidations.length, 0);
});

test("confirmed save closes the editor and invalidates both public and admin profile queries", async () => {
  const write = deferred();
  const page = renderer(portfolioSource, null, { api: { saveStartupProfile: () => write.promise } });
  button(page.render(), "Add startup").props.onClick();
  const editor = nodes(page.render()).find((node) => node.type === "profile-editor");
  const saving = editor.props.onSave(startup({ isPublished: true }));
  assert.ok(nodes(page.render()).find((node) => node.type === "profile-editor"));
  write.resolve(startup({ id: "saved", isPublished: true }));
  await saving;
  assert.equal(nodes(page.render()).filter((node) => node.type === "profile-editor").length, 0);
  assert.match(text(page.render()), /saved and published/);
  assert.deepEqual(JSON.parse(JSON.stringify(page.invalidations)), [{ queryKey: ["startup-profiles"] }]);
});

test("failed publish and delete actions display errors without changing their success notices", async () => {
  const profile = startup({ id: "saved" });
  const page = renderer(portfolioSource, null, {
    query: { data: [profile] },
    api: {
      async saveStartupProfile() { throw new Error("Publish denied"); },
      async deleteStartupProfile() { throw new Error("Delete denied"); },
    },
  });
  // Button handlers intentionally discard promises; flush their immediate rejection handlers.
  button(page.render(), "Publish").props.onClick();
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
  assert.match(text(page.render()), /Publish denied/);
  assert.equal(nodes(page.render()).filter((node) => node.props.role === "status").length, 0);
  const remove = nodes(page.render()).find((node) => node.props["aria-label"] === "Delete Regional Venture");
  remove.props.onClick();
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
  assert.match(text(page.render()), /Delete denied/);
  assert.equal(nodes(page.render()).filter((node) => node.props.role === "status").length, 0);
  assert.equal(page.invalidations.length, 0);
  assert.equal(profile.isPublished, false);
});

test("invalid or failed image uploads retain the existing URL and never request a success preview", async () => {
  const upload = deferred();
  const changes = [];
  const uploading = [];
  const requests = [];
  let publicUrls = 0;
  const image = renderer(editorSource, "TestImageField", {
    props: {
      label: "Startup logo", value: "https://example.com/existing.png", disabled: false,
      onChange(value) { changes.push(value); }, onUploading(value) { uploading.push(value); },
    },
    storage: {
      from(bucket) {
        return {
          upload(objectPath, file, options) { requests.push({ bucket, objectPath, file, options }); return upload.promise; },
          getPublicUrl() { publicUrls += 1; return { data: { publicUrl: "https://example.com/new.png" } }; },
        };
      },
    },
  });
  const choose = (file) => nodes(image.render()).find((node) => node.type === "input" && node.props.type === "file")
    .props.onChange({ target: { files: [file], value: "" } });
  choose(new File(["text"], "document.txt", { type: "text/plain" }));
  assert.match(text(image.render()), /Choose a JPG/);
  assert.equal(requests.length, 0);
  const file = new File(["png-image"], "logo.png", { type: "image/png" });
  choose(file);
  assert.deepEqual(uploading, [true]);
  assert.equal(control(image.render(), "Startup logo").props.disabled, true);
  assert.equal(requests[0].bucket, "startup-images");
  assert.equal(requests[0].options.upsert, false);
  assert.equal(changes.length, 0);
  upload.resolve({ error: { message: "Storage permission denied" } });
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  assert.deepEqual(uploading, [true, false]);
  assert.equal(changes.length, 0);
  assert.equal(publicUrls, 0);
  assert.equal(control(image.render(), "Startup logo").props.value, "https://example.com/existing.png");
  assert.match(text(image.render()), /Image upload failed/);
});
