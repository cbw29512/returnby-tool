(() => {
  "use strict";

  const STORAGE_KEY = "returnby.savedReturns.v1";
  const form = document.querySelector("#return-form");
  const emptyResult = document.querySelector("#empty-result");
  const resultContent = document.querySelector("#result-content");
  const resultPanel = document.querySelector("#result-panel");
  const startDateInput = document.querySelector("#start-date");
  const dateTypeInputs = document.querySelectorAll('input[name="dateType"]');
  const startDateLabel = document.querySelector("#start-date-label");
  const savedSection = document.querySelector("#saved-section");
  const savedList = document.querySelector("#saved-list");
  const saveButton = document.querySelector("#save-button");
  const toast = document.querySelector("#toast");
  let currentReturn = null;
  let toastTimer = null;

  const today = new Date();
  startDateInput.value = toInputDate(today);
  startDateInput.max = toInputDate(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()));

  dateTypeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      startDateLabel.textContent = input.value === "Delivered" ? "Delivery date" : "Purchase date";
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearErrors();
    const data = readForm();
    if (!validate(data)) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    const deadline = addDays(parseLocalDate(data.startDate), data.returnWindow);
    const daysLeft = differenceInCalendarDays(deadline, startOfToday());
    currentReturn = {
      id: makeId(),
      itemName: data.itemName,
      storeName: data.storeName,
      itemPrice: data.itemPrice,
      returnWindow: data.returnWindow,
      dateType: data.dateType,
      startDate: data.startDate,
      reminderDays: data.reminderDays,
      deadline: toInputDate(deadline),
      status: "Deciding",
      createdAt: new Date().toISOString(),
    };
    renderResult(currentReturn, daysLeft);
  });

  document.querySelector("#calendar-button").addEventListener("click", () => {
    if (!currentReturn) return;
    downloadCalendarReminder(currentReturn);
    showToast("Calendar reminder downloaded");
  });

  document.querySelector("#copy-button").addEventListener("click", async () => {
    if (!currentReturn) return;
    const text = summaryText(currentReturn);
    const copied = await copyText(text);
    showToast(copied ? "Return details copied" : "Copy failed — select and copy manually");
  });

  saveButton.addEventListener("click", () => {
    if (!currentReturn) return;
    const saved = loadSaved();
    if (saved.some((item) => item.id === currentReturn.id)) return;
    saved.unshift(currentReturn);
    if (!persistSaved(saved)) {
      showToast("This browser blocked local saving");
      return;
    }
    saveButton.disabled = true;
    saveButton.innerHTML = '<span aria-hidden="true">✓</span> Saved on this device';
    renderSaved();
    showToast("Saved privately on this device");
  });

  document.querySelector("#clear-all-button").addEventListener("click", () => {
    const saved = loadSaved();
    if (!saved.length) return;
    if (!window.confirm("Remove all saved returns from this device?")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      renderSaved();
      showToast("Saved returns cleared");
    } catch {
      showToast("This browser blocked local storage changes");
    }
  });

  savedList.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-id]");
    if (!select) return;
    const saved = loadSaved().map((item) => item.id === select.dataset.id ? { ...item, status: select.value } : item);
    if (persistSaved(saved)) showToast("Status updated");
    else showToast("This browser blocked local saving");
  });

  savedList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove-id]");
    if (!button) return;
    const saved = loadSaved().filter((item) => item.id !== button.dataset.removeId);
    if (!persistSaved(saved)) {
      showToast("This browser blocked local saving");
      return;
    }
    renderSaved();
    showToast("Return removed");
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) renderSaved();
  });

  function readForm() {
    const formData = new FormData(form);
    const priceText = String(formData.get("itemPrice") || "").trim();
    return {
      itemName: String(formData.get("itemName") || "").trim(),
      storeName: String(formData.get("storeName") || "").trim(),
      itemPriceText: priceText,
      itemPrice: priceText === "" ? 0 : Number(priceText),
      returnWindow: Number(formData.get("returnWindow")),
      dateType: String(formData.get("dateType") || "Delivered"),
      startDate: String(formData.get("startDate") || ""),
      reminderDays: Number(formData.get("reminderDays")) || 3,
    };
  }

  function validate(data) {
    let valid = true;
    if (!data.itemName) {
      setError("item-name", "item-name-error", "Add an item name.");
      valid = false;
    }
    if (data.itemPriceText && (!Number.isFinite(data.itemPrice) || data.itemPrice < 0 || data.itemPrice > 1000000)) {
      setError("item-price", "item-price-error", "Enter a price from $0 to $1,000,000.");
      valid = false;
    }
    if (!Number.isInteger(data.returnWindow) || data.returnWindow < 1 || data.returnWindow > 730) {
      setError("return-window", "return-window-error", "Enter a window from 1 to 730 days.");
      valid = false;
    }
    const parsedStart = data.startDate ? parseLocalDate(data.startDate) : new Date(NaN);
    if (!data.startDate || Number.isNaN(parsedStart.getTime())) {
      setError("start-date", "start-date-error", "Choose a valid date.");
      valid = false;
    }
    return valid;
  }

  function setError(inputId, errorId, message) {
    const input = document.querySelector(`#${inputId}`);
    input.setAttribute("aria-invalid", "true");
    document.querySelector(`#${errorId}`).textContent = message;
  }

  function clearErrors() {
    document.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
    document.querySelectorAll(".field-error").forEach((error) => { error.textContent = ""; });
  }

  function renderResult(item, daysLeft) {
    const deadline = parseLocalDate(item.deadline);
    emptyResult.hidden = true;
    resultContent.hidden = false;
    resultContent.style.animation = "none";
    requestAnimationFrame(() => { resultContent.style.animation = ""; });

    const deadlineTime = document.querySelector("#deadline-time");
    deadlineTime.dateTime = item.deadline;
    deadlineTime.textContent = formatDate(deadline, { month: "long", day: "numeric", year: "numeric" });
    document.querySelector("#result-store").textContent = item.storeName || item.itemName;
    const status = document.querySelector("#result-status");
    status.className = "result-status";

    if (daysLeft < 0) {
      const elapsed = Math.abs(daysLeft);
      status.textContent = "Estimated window passed";
      status.classList.add("expired");
      document.querySelector("#countdown").textContent = `${elapsed} ${elapsed === 1 ? "day" : "days"} past the estimated deadline. The store may still offer an exception or store credit.`;
    } else if (daysLeft <= 3) {
      status.textContent = daysLeft === 0 ? "Deadline today" : "Act soon";
      status.classList.add("urgent");
      document.querySelector("#countdown").textContent = daysLeft === 0 ? "The estimated return window ends today." : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left in the estimated return window.`;
    } else if (daysLeft <= 14) {
      status.textContent = "Coming up";
      status.classList.add("urgent");
      document.querySelector("#countdown").textContent = `${daysLeft} days left. Add a reminder now so it does not sneak up on you.`;
    } else {
      status.textContent = "Plenty of time";
      document.querySelector("#countdown").textContent = `${daysLeft} days left in the estimated return window.`;
    }

    const valueBox = document.querySelector("#value-protected");
    if (item.itemPrice > 0) {
      valueBox.hidden = false;
      document.querySelector("#protected-amount").textContent = formatCurrency(item.itemPrice);
    } else {
      valueBox.hidden = true;
    }

    const alreadySaved = loadSaved().some((saved) => saved.id === item.id);
    saveButton.disabled = alreadySaved;
    saveButton.innerHTML = alreadySaved
      ? '<span aria-hidden="true">✓</span> Saved on this device'
      : '<span aria-hidden="true">＋</span> Save to this device';

    if (window.innerWidth < 851) {
      resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderSaved() {
    const saved = loadSaved().slice().sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
    savedSection.hidden = saved.length === 0;
    savedList.replaceChildren();

    saved.forEach((item) => {
      const deadline = parseLocalDate(item.deadline);
      if (Number.isNaN(deadline.getTime())) return;
      const daysLeft = differenceInCalendarDays(deadline, startOfToday());
      const card = document.createElement("article");
      card.className = "saved-card";

      const identity = document.createElement("div");
      const name = document.createElement("h3");
      name.textContent = item.itemName || "Saved return";
      const details = document.createElement("p");
      details.textContent = [item.storeName, item.itemPrice > 0 ? formatCurrency(item.itemPrice) : ""].filter(Boolean).join(" · ") || "Saved return";
      identity.append(name, details);

      const due = document.createElement("div");
      due.className = "saved-deadline";
      const dueDate = document.createElement("strong");
      dueDate.textContent = formatDate(deadline, { month: "short", day: "numeric", year: "numeric" });
      const dueText = document.createElement("span");
      dueText.textContent = savedDeadlineMessage(item.status, daysLeft);
      due.append(dueDate, dueText);

      const status = document.createElement("select");
      status.className = "status-select";
      status.dataset.id = item.id;
      status.setAttribute("aria-label", `Status for ${item.itemName || "saved return"}`);
      ["Deciding", "Return started", "Waiting for refund", "Refund received", "Keeping it"].forEach((optionText) => {
        const option = document.createElement("option");
        option.value = optionText;
        option.textContent = optionText;
        option.selected = item.status === optionText;
        status.appendChild(option);
      });

      const remove = document.createElement("button");
      remove.className = "remove-button";
      remove.type = "button";
      remove.dataset.removeId = item.id;
      remove.setAttribute("aria-label", `Remove ${item.itemName || "saved return"}`);
      remove.textContent = "×";

      card.append(identity, due, status, remove);
      savedList.appendChild(card);
    });
  }

  // SavedReturn state: completed returns and returns already in progress
  // must not be presented as actionable missed deadlines.
  function savedDeadlineMessage(status, daysLeft) {
    try {
      if (status === "Refund received") return "Refund received — closed";
      if (status === "Keeping it") return "Keeping item — closed";
      if (status === "Waiting for refund") return "Awaiting refund";
      if (status === "Return started") return "Return in progress";
      if (!Number.isInteger(daysLeft)) throw new RangeError("Invalid deadline countdown");
      if (daysLeft < 0) return `${Math.abs(daysLeft)}d past estimate`;
      if (daysLeft === 0) return "Estimated deadline today";
      return `${daysLeft}d remaining`;
    } catch (error) {
      console.error("ReturnBy: cannot display saved deadline status", error);
      return "Check retailer's return policy";
    }
  }

  function loadSaved() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
    } catch {
      return [];
    }
  }

  function persistSaved(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch {
      return false;
    }
  }

  function downloadCalendarReminder(item) {
    const deadline = parseLocalDate(item.deadline);
    const endDate = addDays(deadline, 1);
    const uid = `${item.id}@returnby`;
    const title = escapeIcs(`Return deadline: ${item.itemName}`);
    const description = escapeIcs(summaryText(item));
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ReturnBy//Return Reminder//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${toUtcStamp(new Date())}`,
      `DTSTART;VALUE=DATE:${toIcsDate(deadline)}`,
      `DTEND;VALUE=DATE:${toIcsDate(endDate)}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${description}`,
      "BEGIN:VALARM",
      `TRIGGER:-P${item.reminderDays}D`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${title}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${slugify(item.itemName)}-return-reminder.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  function summaryText(item) {
    const store = item.storeName ? ` from ${item.storeName}` : "";
    const value = item.itemPrice > 0 ? ` (${formatCurrency(item.itemPrice)})` : "";
    return `${item.itemName}${store}${value}: estimated return deadline ${formatDate(parseLocalDate(item.deadline), { month: "long", day: "numeric", year: "numeric" })}. Please confirm the retailer's policy.`;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to the compatibility path.
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function parseLocalDate(value) {
    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return new Date(NaN);
    const [year, month, day] = parts;
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return new Date(NaN);
    return parsed;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }

  function differenceInCalendarDays(later, earlier) {
    const utcLater = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
    const utcEarlier = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
    return Math.round((utcLater - utcEarlier) / 86400000);
  }

  function toInputDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function toIcsDate(date) {
    return toInputDate(date).replaceAll("-", "");
  }

  function toUtcStamp(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function formatDate(date, options) {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
  }

  function escapeIcs(value) {
    return String(value).replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
  }

  function slugify(value) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
  }

  function makeId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  renderSaved();
})();
