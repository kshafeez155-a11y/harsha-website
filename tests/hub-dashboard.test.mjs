import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const submissionsSource = "src/components/hub/HubSubmissions.tsx";
const eventsSource = "src/components/hub/HubEvents.tsx";
const dashboardSource = "src/components/hub/HubDashboard.tsx";

const manager = {
  hub_id: "kadapa",
  user_id: "kadapa-person",
  display_name: "Kadapa Manager",
  email: "manager@example.com",
  active: true,
};
const application = {
  id: "application-one",
  hub_id: "kadapa",
  founder_name: "Private founder",
  email: "founder@example.com",
  status: "pending",
  follow_up_notes: "Call next week",
  created_at: "2026-11-15T10:00:00Z",
};
const event = {
  id: "",
  hub_id: "kadapa",
  title: "Kadapa founder meetup",
  date: "2026-12-20",
  time: "4:00 PM",
  venue: "Kadapa Hub",
  type: "Meetup",
  summary: "Local founder conversations",
  is_published: false,
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
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
  const parent = nodes(tree).find((node) => node.type === "label" && text(node).startsWith(label));
  assert.ok(parent, `Missing label ${label}`);
  const input = nodes(parent).find((node) => ["input", "textarea", "select"].includes(node.type));
  assert.ok(input, `Missing control for ${label}`);
  return input;
}

function button(tree, label) {
  const found = nodes(tree).find((node) => node.type === "button" && text(node).trim() === label);
  assert.ok(found, `Missing button ${label}`);
  return found;
}

function alerts(tree, role) {
  return nodes(tree).filter((node) => node.props.role === role);
}

function renderer(source, exportName, { props = {}, api = {}, query = {}, client = {} } = {}) {
  const states = [];
  let stateIndex = 0;
  const plain = new Set();
  const jsx = (type, componentProps) =>
    plain.has(type) ? type(componentProps) : { type, props: componentProps ?? {} };
  const result = {
    data: undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: async () => {},
    ...query,
  };
  let queryOptions;
  const shared = {
    fieldClass: "field",
    buttonClass: "button",
    secondaryButtonClass: "secondary",
    panelClass: "panel",
    errorText: (error) => (error instanceof Error ? error.message : "Action failed"),
    formatDate: (value) => value,
    Field: (field) => jsx("label", { children: [field.label, field.children] }),
    Notice: (notice) =>
      notice.message
        ? jsx("div", { role: notice.error ? "alert" : "status", children: notice.message })
        : null,
    Busy: () => jsx("div", { role: "status", children: "Loading" }),
    StatusBadge: (badge) => jsx("span", { children: badge.status }),
  };
  [shared.Field, shared.Notice, shared.Busy, shared.StatusBadge].forEach((component) =>
    plain.add(component),
  );
  const modules = {
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [
          states[index],
          (value) => {
            states[index] = typeof value === "function" ? value(states[index]) : value;
          },
        ];
      },
      useEffect() {},
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "lucide-react": new Proxy({}, { get: (_target, key) => `icon-${String(key)}` }),
    "@tanstack/react-router": { useNavigate: () => async () => {} },
    "@tanstack/react-query": {
      useQuery(options) {
        queryOptions = options;
        return result;
      },
      useQueryClient: () => ({ clear() {} }),
    },
    "@/components/ui/dialog": Object.fromEntries(
      ["Dialog", "DialogContent", "DialogDescription", "DialogTitle"].map((name) => [name, name]),
    ),
    "@/lib/hub-management": api,
    "@/lib/supabase": { supabase: client },
    "./HubAccount": { HubAccount: "hub-account" },
    "./HubEvents": { HubEvents: "hub-events" },
    "./HubProfileEditor": { HubProfileEditor: "hub-profile" },
    "./HubSubmissions": { HubSubmissions: "hub-submissions" },
    "./shared": shared,
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
  // Exercise actual file-local handlers and the actual access gate without
  // mounting a browser or replacing the behavior being checked with a mock.
  const extra =
    source === submissionsSource ? "\nexports.SubmissionEditor = SubmissionEditor;" : "";
  vm.runInNewContext(
    compiled + extra,
    {
      exports,
      Error,
      Intl,
      Date,
      require(name) {
        assert.ok(name in modules, `Unexpected dependency: ${name}`);
        return modules[name];
      },
    },
    { filename },
  );
  return {
    props,
    result,
    render() {
      stateIndex = 0;
      return exports[exportName](props);
    },
    submit() {
      return nodes(this.render())
        .find((node) => node.type === "form")
        .props.onSubmit({ preventDefault() {} });
    },
    get queryOptions() {
      return queryOptions;
    },
  };
}

test("managers cannot alter final startup decisions and save only follow-up notes", async () => {
  for (const status of ["approved", "rejected"]) {
    const writes = [];
    const editor = renderer(submissionsSource, "SubmissionEditor", {
      props: {
        table: "startup_registrations",
        record: { ...application, status },
        hubId: "kadapa",
        onClose() {},
        onSaved: async () => {},
      },
      api: {
        updateHubSubmission: async (...args) => {
          writes.push(args);
        },
      },
    });
    assert.equal(control(editor.render(), "Status").props.disabled, true);
    assert.equal(control(editor.render(), "Status").props.value, status);
    control(editor.render(), "Follow-up notes").props.onChange({
      target: { value: "Owner decision communicated" },
    });
    await editor.submit();
    assert.equal(writes.length, 1);
    assert.equal(writes[0][1], "startup_registrations");
    assert.equal(writes[0][2], application.id);
    assert.equal(writes[0][4], "kadapa");
    assert.deepEqual(JSON.parse(JSON.stringify(writes[0][3])), {
      follow_up_notes: "Owner decision communicated",
    });
    assert.equal(control(editor.render(), "Status").props.disabled, true);
    assert.equal(control(editor.render(), "Status").props.value, status);
    assert.match(text(alerts(editor.render(), "status")), /Changes saved/);
  }
});

test("startup review offers only pending and reviewed before the owner's final decision", async () => {
  const writes = [];
  const editor = renderer(submissionsSource, "SubmissionEditor", {
    props: {
      table: "startup_registrations",
      record: application,
      hubId: "kadapa",
      onClose() {},
      onSaved: async () => {},
    },
    api: {
      updateHubSubmission: async (...args) => {
        writes.push(args);
      },
    },
  });
  assert.deepEqual(
    nodes(control(editor.render(), "Status"))
      .filter((node) => node.type === "option")
      .map((option) => option.props.value),
    ["pending", "reviewed"],
  );
  control(editor.render(), "Status").props.onChange({ target: { value: "reviewed" } });
  await editor.submit();
  assert.equal(writes[0][3].status, "reviewed");
});

test("a refused asynchronous status save preserves the dialog, input and previous decision", async () => {
  const write = deferred();
  let saved = 0;
  let closed = 0;
  const editor = renderer(submissionsSource, "SubmissionEditor", {
    props: {
      table: "community_join_applications",
      record: application,
      hubId: "kadapa",
      onClose() {
        closed += 1;
      },
      onSaved: async () => {
        saved += 1;
      },
    },
    api: { updateHubSubmission: () => write.promise },
  });
  control(editor.render(), "Status").props.onChange({ target: { value: "approved" } });
  control(editor.render(), "Follow-up notes").props.onChange({
    target: { value: "Keep this unsaved note" },
  });
  const saving = editor.submit();
  assert.equal(control(editor.render(), "Status").props.disabled, true);
  assert.equal(saved, 0);
  assert.equal(alerts(editor.render(), "status").length, 0);
  const pendingDialog = nodes(editor.render()).find((node) => node.type === "Dialog");
  pendingDialog.props.onOpenChange(false);
  assert.equal(closed, 0, "The dialog cannot close while the status write is pending");
  write.reject(new Error("Hub access has been revoked"));
  await saving;
  assert.equal(control(editor.render(), "Status").props.value, "approved");
  assert.equal(control(editor.render(), "Follow-up notes").props.value, "Keep this unsaved note");
  assert.equal(control(editor.render(), "Status").props.disabled, false);
  assert.equal(nodes(editor.render()).find((node) => node.type === "Dialog").props.open, true);
  assert.match(text(alerts(editor.render(), "alert")), /Hub access has been revoked/);
  assert.equal(alerts(editor.render(), "status").length, 0);
  assert.equal(saved, 0);
  assert.equal(closed, 0);
  assert.equal(application.status, "pending");
});

test("new events start as drafts and publishing waits for the database confirmation", async () => {
  const write = deferred();
  const writes = [];
  const saved = [];
  const editor = renderer(eventsSource, "HubEventEditor", {
    props: {
      event,
      onClose() {},
      onSaved: async (published) => {
        saved.push(published);
      },
    },
    api: {
      saveHubEvent: (_client, payload) => {
        writes.push(payload);
        return write.promise;
      },
    },
  });
  assert.equal(control(editor.render(), "Publish this event").props.checked, false);
  control(editor.render(), "Publish this event").props.onChange({ target: { checked: true } });
  const saving = editor.submit();
  assert.equal(saved.length, 0);
  assert.equal(writes[0].hub_id, "kadapa");
  assert.equal(writes[0].is_published, true);
  assert.equal(
    nodes(editor.render()).find((node) => node.type === "fieldset").props.disabled,
    true,
  );
  write.resolve({ ...event, id: "saved-event", is_published: true });
  await saving;
  assert.deepEqual(saved, [true]);
  assert.equal(event.is_published, false, "Editing must not mutate the supplied saved record");
});

test("a failed event publish retains its edited title, draft state and open editor", async () => {
  const write = deferred();
  let closes = 0;
  let saves = 0;
  const editor = renderer(eventsSource, "HubEventEditor", {
    props: {
      event,
      onClose() {
        closes += 1;
      },
      onSaved: async () => {
        saves += 1;
      },
    },
    api: { saveHubEvent: () => write.promise },
  });
  control(editor.render(), "Event title").props.onChange({
    target: { value: "My edited local event" },
  });
  control(editor.render(), "Publish this event").props.onChange({ target: { checked: true } });
  const saving = editor.submit();
  nodes(editor.render())
    .find((node) => node.type === "Dialog")
    .props.onOpenChange(false);
  assert.equal(closes, 0);
  write.reject(new Error("Event publish was denied"));
  await saving;
  assert.equal(control(editor.render(), "Event title").props.value, "My edited local event");
  assert.equal(control(editor.render(), "Publish this event").props.checked, true);
  assert.equal(nodes(editor.render()).find((node) => node.type === "Dialog").props.open, true);
  assert.match(text(alerts(editor.render(), "alert")), /Event publish was denied/);
  assert.equal(alerts(editor.render(), "status").length, 0);
  assert.equal(closes, 0);
  assert.equal(saves, 0);
});

test("unpublishing preserves the existing event identity and assigned hub", async () => {
  const writes = [];
  const saved = [];
  const editor = renderer(eventsSource, "HubEventEditor", {
    props: {
      event: { ...event, id: "existing-kadapa-event", is_published: true },
      onClose() {},
      onSaved: async (published) => {
        saved.push(published);
      },
    },
    api: {
      saveHubEvent: async (_client, payload) => {
        writes.push(payload);
        return payload;
      },
    },
  });
  control(editor.render(), "Publish this event").props.onChange({ target: { checked: false } });
  await editor.submit();
  assert.equal(writes[0].id, "existing-kadapa-event");
  assert.equal(writes[0].hub_id, "kadapa");
  assert.equal(writes[0].is_published, false);
  assert.deepEqual(saved, [false]);
});

test("a confirmed event keeps its saved identity when refresh fails so retry cannot duplicate it", async () => {
  const writes = [];
  let refreshes = 0;
  const editor = renderer(eventsSource, "HubEventEditor", {
    props: {
      event,
      onClose() {},
      async onSaved() {
        refreshes += 1;
        if (refreshes === 1) throw new Error("Refresh interrupted after saving");
      },
    },
    api: {
      async saveHubEvent(_client, payload) {
        writes.push(payload);
        return { ...payload, id: payload.id || "confirmed-event-identity" };
      },
    },
  });
  await editor.submit();
  assert.equal(writes[0].id, "");
  assert.match(text(alerts(editor.render(), "alert")), /Refresh interrupted/);
  assert.match(text(editor.render()), /Edit hub event/);
  assert.equal(control(editor.render(), "Event title").props.value, event.title);
  await editor.submit();
  assert.equal(writes.length, 2);
  assert.equal(
    writes[1].id,
    "confirmed-event-identity",
    "A retry must update the already-created event",
  );
  assert.equal(writes[1].hub_id, "kadapa");
  assert.equal(refreshes, 2);
  assert.equal(alerts(editor.render(), "alert").length, 0);
});

test("revoked assignment prevents scoped record loads and removes retained private content", async () => {
  const membershipChecks = [];
  let scopedLoads = 0;
  const membership = {
    select() {
      return this;
    },
    eq(key, value) {
      membershipChecks.push([key, value]);
      return this;
    },
    async maybeSingle() {
      return { data: null, error: null };
    },
  };
  const dashboard = renderer(dashboardSource, "HubDashboard", {
    props: { manager },
    query: {
      data: {
        hub: { id: "kadapa", city: "Kadapa" },
        manager,
        startups: [application],
        community: [],
        registrations: [],
        meetings: [],
        events: [],
        activity: [],
      },
    },
    client: {
      auth: {
        async getUser() {
          return { data: { user: { id: manager.user_id } }, error: null };
        },
      },
      from(table) {
        assert.equal(table, "hub_managers");
        return membership;
      },
    },
    api: Object.fromEntries(
      ["loadHubs", "loadHubEvents", "loadHubSubmissions", "loadHubActivity"].map((name) => [
        name,
        async () => {
          scopedLoads += 1;
          return [];
        },
      ]),
    ),
  });
  button(dashboard.render(), "Startup applications").props.onClick();
  const list = nodes(dashboard.render()).find((node) => node.type === "hub-submissions");
  assert.equal(list.props.records[0].founder_name, "Private founder");
  await assert.rejects(dashboard.queryOptions.queryFn(), /assignment has changed or been disabled/);
  assert.equal(scopedLoads, 0);
  assert.deepEqual(membershipChecks, [
    ["user_id", manager.user_id],
    ["hub_id", "kadapa"],
    ["active", true],
  ]);
  dashboard.result.isError = true;
  dashboard.result.error = new Error("Your hub assignment has changed or been disabled");
  // React Query retains the previous data on refetch failures. It must not be
  // rendered after an access failure, even while the cache still contains it.
  assert.equal(dashboard.result.data.startups.length, 1);
  assert.equal(
    nodes(dashboard.render()).some((node) => node.type === "hub-submissions"),
    false,
  );
  assert.match(
    text(alerts(dashboard.render(), "alert")),
    /assignment has changed or been disabled/,
  );
  assert.doesNotMatch(JSON.stringify(dashboard.render()), /Private founder|founder@example/);
});
