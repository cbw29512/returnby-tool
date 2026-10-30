#!/usr/bin/env node
// Test the real ReturnBy helpers without a browser or third-party packages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

try {
  // SavedReturn schema: { id, itemName, deadline: YYYY-MM-DD, status }.
  // Display state is derived from status first, then calendar days remaining.
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const statusStart = source.indexOf("  function savedDeadlineMessage(");
  const statusEnd = source.indexOf("  function loadSaved() {", statusStart);
  assert.ok(statusStart >= 0 && statusEnd > statusStart,
    "Cannot find production saved-status implementation");
  assert.ok(source.includes("dueText.textContent = savedDeadlineMessage(item.status, daysLeft)"),
    "Saved cards must use the tested status renderer");
  const logged = [];
  const status = vm.runInNewContext(
    source.slice(statusStart, statusEnd) + "\nsavedDeadlineMessage;",
    { console: { error: (...args) => logged.push(args.map(String).join(" ")) } },
    { timeout: 1000 }
  );

  const cases = [
    ["Refund received", -5, "Refund received — closed"],
    ["Keeping it", -5, "Keeping item — closed"],
    ["Waiting for refund", -5, "Awaiting refund"],
    ["Return started", -5, "Return in progress"],
    ["Deciding", -5, "5d past estimate"],
    ["Deciding", 0, "Estimated deadline today"],
    ["Deciding", 1, "1d remaining"],
    ["Deciding", 14, "14d remaining"],
  ];
  for (const [savedStatus, daysLeft, expected] of cases) {
    assert.equal(status(savedStatus, daysLeft), expected);
  }
  assert.equal(status("Deciding", Number.NaN), "Check retailer's return policy");
  assert.equal(logged.length, 1, "Invalid dates must produce a diagnostic");

  // Date computations must remain correct around leap days, month edges,
  // and daylight-saving transitions, with no UTC-offset day loss.
  const dateStart = source.indexOf("  function parseLocalDate(");
  const dateEnd = source.indexOf("  function formatDate(", dateStart);
  assert.ok(dateStart >= 0 && dateEnd > dateStart,
    "Cannot find production date helpers");
  const date = vm.runInNewContext(
    source.slice(dateStart, dateEnd) +
      "\n({ parseLocalDate, addDays, differenceInCalendarDays, toInputDate });",
    { Date, Number, Math, String }, { timeout: 1000 }
  );
  assert.equal(date.toInputDate(date.addDays(date.parseLocalDate("2024-02-28"), 1)),
    "2024-02-29");
  assert.equal(date.toInputDate(date.addDays(date.parseLocalDate("2024-02-28"), 2)),
    "2024-03-01");
  assert.equal(date.toInputDate(date.addDays(date.parseLocalDate("2025-12-31"), 1)),
    "2026-01-01");
  const dstStart = date.parseLocalDate("2025-03-08");
  const dstEnd = date.addDays(dstStart, 4);
  assert.equal(date.toInputDate(dstEnd), "2025-03-12");
  assert.equal(date.differenceInCalendarDays(dstEnd, dstStart), 4);
  assert.ok(Number.isNaN(date.parseLocalDate("2026-02-30").getTime()),
    "Invalid calendar dates must be rejected");

  // Exercise the real DOM change handler with a tiny in-memory saved-return
  // model. A status change must update the visible label without rebuilding
  // the card (which would steal keyboard focus from its select element).
  const changeStart = source.indexOf('  savedList.addEventListener("change",');
  const changeEnd = source.indexOf('  savedList.addEventListener("click",', changeStart);
  assert.ok(changeStart >= 0 && changeEnd > changeStart,
    "Cannot locate production status change handler");
  let onChange;
  let saved = [{ id: "r1", status: "Deciding", deadline: "2025-03-08" }];
  let allowSave = true;
  const notices = [];
  const liveLabel = { textContent: "Old countdown" };
  const select = {
    dataset: { id: "r1" },
    value: "Refund received",
    closest(selector) {
      if (selector === "select[data-id]") return this;
      if (selector === ".saved-card") {
        return { querySelector: () => liveLabel };
      }
      throw Error("Unexpected selector: " + selector);
    },
  };
  vm.runInNewContext(source.slice(changeStart, changeEnd), {
    savedList: { addEventListener: (name, fn) => {
      assert.equal(name, "change");
      onChange = fn;
    } },
    loadSaved: () => saved,
    persistSaved: next => {
      if (!allowSave) return false;
      saved = next;
      return true;
    },
    parseLocalDate: date.parseLocalDate,
    startOfToday: () => date.parseLocalDate("2025-03-13"),
    differenceInCalendarDays: date.differenceInCalendarDays,
    savedDeadlineMessage: status,
    showToast: message => notices.push(message),
    console: { error: (...args) => logged.push(args.map(String).join(" ")) },
  }, { timeout: 1000 });
  assert.equal(typeof onChange, "function");
  onChange({ target: select });
  assert.equal(saved[0].status, "Refund received");
  assert.equal(liveLabel.textContent, "Refund received — closed");
  assert.equal(select.value, "Refund received", "Keep the active select intact");
  assert.equal(notices.at(-1), "Status updated");

  // Failed local storage writes must not display a fictitious saved status.
  allowSave = false;
  select.value = "Keeping it";
  onChange({ target: select });
  assert.equal(saved[0].status, "Refund received");
  assert.equal(select.value, "Refund received");
  assert.equal(liveLabel.textContent, "Refund received — closed");
  assert.equal(notices.at(-1), "This browser blocked local saving");

  console.log("PASS: saved states, overdue labels, error logging, and date edges and live UI updates");
} catch (error) {
  console.error("ReturnBy release verification failed:", error);
  process.exitCode = 1;
}
