import { readFile, access } from "node:fs/promises";
const requiredFiles = [
  "index.html",
  "css/styles.css",
  "js/app.js",
  "js/cloud-sync.js",
  "js/supabase-config.js",
  "assets/logo.svg",
  "manifest.webmanifest",
  "service-worker.js",
  "privacy.html",
  "terms.html",
];
await Promise.all(requiredFiles.map((file) => access(file)));
const [html, app, cloud, schema] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("js/app.js", "utf8"),
  readFile("js/cloud-sync.js", "utf8"),
  readFile("supabase/schema.sql", "utf8"),
]);
for (const id of [
  "viewport",
  "accountDialog",
  "forgotPasswordButton",
  "changePasswordButton",
  "deleteAccountButton",
  "deleteButton",
  "saveStatus",
  "textColorPicker",
  "autoTextColorButton",
])
  if (!html.includes(`id="${id}"`))
    throw new Error(`Missing required UI element: ${id}`);
for (const method of [
  "requestPasswordReset",
  "updatePassword",
  "deleteAccount",
])
  if (!cloud.includes(method))
    throw new Error(`Missing cloud method: ${method}`);
if (!schema.includes("delete_own_account"))
  throw new Error("Account deletion SQL is missing");
if (!app.includes('window.addEventListener("keydown", handleKeyDown)'))
  throw new Error("Keyboard controls are not connected");
if (app.includes('if (event.key === "Tab")'))
  throw new Error("Tab must remain available for interface focus navigation");
if (!app.includes("isInterfaceControl"))
  throw new Error(
    "Focused interface controls must keep native keyboard behavior",
  );
if (!app.includes("applyTextColorToSelection"))
  throw new Error("Writing color controls are not connected");
if (!app.includes("completeTask"))
  throw new Error("Task completion control is not connected");
if ([html, app, cloud].some((source) => source.includes("`r`n")))
  throw new Error("Literal line-break escape found");
console.log("IdeaCanvas project checks passed.");
