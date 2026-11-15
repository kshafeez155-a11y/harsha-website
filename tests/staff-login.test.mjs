import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import { ADMIN_ACCESS_MESSAGES, isAdminAccessFailureReason } from "../src/lib/admin-access.ts";

const user = { id: "manager-user", email: "kadapa@example.test" };
const managerAccess = {
  allowed: true,
  role: "hub_manager",
  manager: { hub_id: "kadapa", user_id: user.id, active: true },
};
const strongPassword = "A new password 123";

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

const copy = (value) => JSON.parse(JSON.stringify(value));

function loadLogin({
  search = {},
  staffAccess = managerAccess,
  signInResult = { data: { user }, error: null },
  identityResult = { data: { user }, error: null },
  updateResult = { data: { user }, error: null },
  resetResult = { data: {}, error: null },
} = {}) {
  const states = [];
  let stateIndex = 0;
  let routeOptions;
  let effectRan = false;
  let authListener;
  let cleanup;
  const calls = {
    signIn: [],
    getUser: 0,
    updateUser: [],
    reset: [],
    verify: 0,
    signOut: 0,
    navigate: [],
    unsubscribe: 0,
  };
  const auth = {
    onAuthStateChange(callback) {
      authListener = callback;
      return {
        data: {
          subscription: {
            unsubscribe() {
              calls.unsubscribe += 1;
            },
          },
        },
      };
    },
    async signInWithPassword(values) {
      calls.signIn.push(copy(values));
      return signInResult;
    },
    async getUser() {
      calls.getUser += 1;
      return identityResult;
    },
    async updateUser(values) {
      calls.updateUser.push(copy(values));
      return updateResult;
    },
    async resetPasswordForEmail(email, options) {
      calls.reset.push({ email, options: copy(options) });
      return resetResult;
    },
    async signOut() {
      calls.signOut += 1;
      return { error: null };
    },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const modules = {
    react: {
      useState(initialValue) {
        const index = stateIndex++;
        if (!(index in states))
          states[index] = typeof initialValue === "function" ? initialValue() : initialValue;
        return [
          states[index],
          (value) => {
            states[index] = typeof value === "function" ? value(states[index]) : value;
          },
        ];
      },
      useEffect(effect) {
        if (!effectRan) {
          effectRan = true;
          cleanup = effect();
        }
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@tanstack/react-router": {
      createFileRoute: () => (options) => {
        routeOptions = options;
        return {
          ...options,
          useSearch: () => options.validateSearch(search),
          useNavigate: () => async (target) => {
            calls.navigate.push(copy(target));
          },
        };
      },
    },
    "@/components/admin/admin-auth": {
      verifyStaffAccess: async () => {
        calls.verify += 1;
        return staffAccess;
      },
    },
    "@/lib/admin-access": { ADMIN_ACCESS_MESSAGES, isAdminAccessFailureReason },
    "@/lib/supabase": { supabase: { auth } },
  };
  const fileName = path.resolve("src/routes/admin.login.tsx");
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
        assert.ok(name in modules, `Unexpected login dependency: ${name}`);
        return modules[name];
      },
      window: { location: { origin: "https://hanova.example.test" } },
      console: { error() {} },
    },
    { filename: fileName },
  );

  function render() {
    stateIndex = 0;
    return routeOptions.component();
  }
  function input(type, value, index = 0) {
    const fields = nodes(render()).filter(
      (node) => node.type === "input" && node.props.type === type,
    );
    assert.ok(fields[index], `Missing ${type} field ${index}`);
    fields[index].props.onChange({ target: { value } });
  }
  function click(label) {
    const button = nodes(render()).find(
      (node) => node.type === "button" && text(node).includes(label),
    );
    assert.ok(button, `Missing button: ${label}`);
    button.props.onClick();
  }
  return {
    calls,
    render,
    input,
    click,
    validateSearch: (value) => copy(routeOptions.validateSearch(value)),
    emit(event) {
      render();
      authListener(event);
    },
    unmount() {
      cleanup?.();
    },
    submit() {
      const form = nodes(render()).find((node) => node.type === "form");
      return form.props.onSubmit({ preventDefault() {} });
    },
  };
}

async function flush() {
  for (let attempt = 0; attempt < 8; attempt += 1) await Promise.resolve();
}

test("staff setup search accepts only the intended true values and known access reasons", () => {
  const harness = loadLogin();
  assert.deepEqual(harness.validateSearch({ setup: true, access: "session" }), {
    setup: true,
    access: "session",
  });
  assert.deepEqual(harness.validateSearch({ setup: "true", access: "forbidden" }), {
    setup: true,
    access: "forbidden",
  });
  for (const setup of [false, "false", "1", 1, {}, [], null]) {
    assert.deepEqual(harness.validateSearch({ setup, access: "untrusted" }), {});
  }
});

for (const [role, destination] of [
  ["admin", "/admin"],
  ["hub_manager", "/hub-dashboard"],
]) {
  test(`a successful ${role} login opens its own dashboard`, async () => {
    const harness = loadLogin({ staffAccess: { ...managerAccess, role } });
    harness.input("email", user.email);
    harness.input("password", "existing-password");
    await harness.submit();
    assert.deepEqual(harness.calls.signIn, [{ email: user.email, password: "existing-password" }]);
    assert.equal(harness.calls.verify, 1);
    assert.deepEqual(harness.calls.navigate, [{ to: destination }]);
    assert.equal(harness.calls.signOut, 0);
  });
}

test("invalid credentials and absent auth users never reach staff authorization or navigation", async () => {
  for (const signInResult of [
    { data: { user }, error: { message: "Invalid credentials" } },
    { data: { user: null }, error: null },
  ]) {
    const harness = loadLogin({ signInResult });
    await harness.submit();
    assert.equal(harness.calls.verify, 0);
    assert.equal(harness.calls.navigate.length, 0);
    assert.match(text(harness.render()), /Unable to sign in/);
  }
});

test("an account without a valid assignment is signed out and gets the authorization message", async () => {
  const harness = loadLogin({
    staffAccess: {
      allowed: false,
      reason: "forbidden",
      message: "This account has no active hub assignment.",
    },
  });
  await harness.submit();
  assert.equal(harness.calls.signOut, 1);
  assert.equal(harness.calls.navigate.length, 0);
  assert.match(text(harness.render()), /no active hub assignment/);
});

test("setup links open password creation and do not require the invitation email to be retyped", async () => {
  const harness = loadLogin({ search: { setup: "true" } });
  assert.match(text(harness.render()), /Set your password/);
  const email = nodes(harness.render()).find(
    (node) => node.type === "input" && node.props.type === "email",
  );
  assert.equal(email.props.required, false);
  harness.input("password", strongPassword);
  harness.input("password", strongPassword, 1);
  await harness.submit();
  assert.equal(harness.calls.signIn.length, 0);
  assert.equal(harness.calls.getUser, 1);
  assert.deepEqual(harness.calls.updateUser, [{ password: strongPassword }]);
  assert.deepEqual(harness.calls.navigate, [{ to: "/hub-dashboard" }]);
});

test("short or mismatched setup passwords never call the auth update API", async () => {
  for (const [password, confirmation] of [
    ["short", "short"],
    [strongPassword, "A different password"],
  ]) {
    const harness = loadLogin({ search: { setup: true } });
    harness.input("password", password);
    harness.input("password", confirmation, 1);
    await harness.submit();
    assert.equal(harness.calls.getUser, 0);
    assert.equal(harness.calls.updateUser.length, 0);
    assert.equal(harness.calls.navigate.length, 0);
    assert.match(text(harness.render()), /at least 12 characters.*same password twice/);
  }
});

test("expired invitation sessions cannot change a password", async () => {
  for (const identityResult of [
    { data: { user: null }, error: null },
    { data: { user }, error: { message: "Token expired" } },
  ]) {
    const harness = loadLogin({ search: { setup: true }, identityResult });
    harness.input("password", strongPassword);
    harness.input("password", strongPassword, 1);
    await harness.submit();
    assert.equal(harness.calls.updateUser.length, 0);
    assert.equal(harness.calls.navigate.length, 0);
    assert.match(text(harness.render()), /link has expired/);
  }
});

test("password update rejection preserves the setup form and never opens a dashboard", async () => {
  const harness = loadLogin({
    search: { setup: true },
    updateResult: { data: { user }, error: { message: "Password rejected by server" } },
  });
  harness.input("password", strongPassword);
  harness.input("password", strongPassword, 1);
  await harness.submit();
  assert.equal(harness.calls.verify, 0);
  assert.equal(harness.calls.navigate.length, 0);
  assert.match(text(harness.render()), /Password rejected by server/);
  assert.match(text(harness.render()), /Set your password/);
});

test("PASSWORD_RECOVERY events switch the form into password setup", () => {
  const harness = loadLogin();
  assert.match(text(harness.render()), /Staff login/);
  harness.emit("PASSWORD_RECOVERY");
  assert.match(text(harness.render()), /Set your password/);
  assert.equal(
    nodes(harness.render()).filter(
      (node) => node.type === "input" && node.props.type === "password",
    ).length,
    2,
  );
  harness.unmount();
  assert.equal(harness.calls.unsubscribe, 1);
});

test("password reset emails use the current origin and reopen password setup", async () => {
  const harness = loadLogin();
  harness.input("email", "  kadapa@example.test  ");
  harness.click("Send password setup email");
  await flush();
  assert.deepEqual(harness.calls.reset, [
    {
      email: user.email,
      options: { redirectTo: "https://hanova.example.test/admin/login?setup=true" },
    },
  ]);
  assert.match(text(harness.render()), /If an account exists/);
  assert.equal(harness.calls.navigate.length, 0);
});

test("password reset requires an email and reports send failures without showing success", async () => {
  const missingEmail = loadLogin();
  missingEmail.click("Send password setup email");
  await flush();
  assert.equal(missingEmail.calls.reset.length, 0);
  assert.match(text(missingEmail.render()), /Enter your email address first/);

  const rejected = loadLogin({ resetResult: { error: { message: "Request failed" } } });
  rejected.input("email", user.email);
  rejected.click("Send password setup email");
  await flush();
  assert.match(text(rejected.render()), /could not be sent/);
  assert.doesNotMatch(text(rejected.render()), /If an account exists/);
});

test("back to sign in leaves password setup mode", () => {
  const harness = loadLogin({ search: { setup: true } });
  harness.click("Back to sign in");
  assert.match(text(harness.render()), /Staff login/);
  assert.equal(
    nodes(harness.render()).filter(
      (node) => node.type === "input" && node.props.type === "password",
    ).length,
    1,
  );
});

test("an in-flight login cannot submit again", async () => {
  let resolve;
  const pending = new Promise((complete) => {
    resolve = complete;
  });
  const harness = loadLogin({ signInResult: pending });
  const first = harness.submit();
  await harness.submit();
  assert.equal(harness.calls.signIn.length, 1);
  const submit = nodes(harness.render()).find(
    (node) => node.type === "button" && node.props.type === "submit",
  );
  assert.equal(submit.props.disabled, true);
  resolve({ data: { user }, error: null });
  await first;
  assert.equal(harness.calls.navigate.length, 1);
});
