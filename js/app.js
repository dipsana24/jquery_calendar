$(function () {
  const LS_KEY = "calendar_tasks_v2"; // Changed key to avoid conflicts with old data structure if any
  let view = new Date();
  let selected = stripTime(new Date());

  // --- Helpers ---
  function stripTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function toISODate(d) {
    const offset = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - offset);
    return local.toISOString().split("T")[0];
  }

  function prettyDate(d) {
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function loadAll() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveAll(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  function toast(msg, type = "success") {
    const $t = $("#toast");
    const $msg = $("#toastMsg");
    const $icon = $t.find("i");

    $msg.text(msg);
    $t.removeClass("hidden");

    // Reset icon
    $icon.attr(
      "class",
      type === "success"
        ? "ph-fill ph-check-circle"
        : "ph-fill ph-warning-circle",
    );
    $icon.css("color", type === "success" ? "var(--success)" : "var(--danger)");

    clearTimeout($t.data("hideTimeout"));
    const timeout = setTimeout(() => $t.addClass("hidden"), 3000);
    $t.data("hideTimeout", timeout);
  }

  // --- Core Logic ---
  function getTasksForDate(date) {
    const iso = toISODate(date);
    return loadAll().filter((t) => t.date === iso);
  }

  function renderCalendar() {
    const year = view.getFullYear();
    const month = view.getMonth();

    $("#monthTitle").text(
      view.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    );

    const first = new Date(year, month, 1);
    const startDay = first.getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const prevDays = startDay;
    const prevMonthDays = new Date(year, month, 0).getDate();

    const all = loadAll();
    // Create a map of date -> hasEvents for quick lookup
    const eventMap = new Set(all.map((t) => t.date));

    $("#calendar").empty();

    for (let i = 0; i < 42; i++) {
      let cellDate;
      let isMuted = false;

      if (i < prevDays) {
        cellDate = new Date(year, month - 1, prevMonthDays - prevDays + i + 1);
        isMuted = true;
      } else if (i >= prevDays + daysInMonth) {
        cellDate = new Date(year, month + 1, i - (prevDays + daysInMonth) + 1);
        isMuted = true;
      } else {
        cellDate = new Date(year, month, i - prevDays + 1);
      }

      const iso = toISODate(cellDate);
      const hasEvents = eventMap.has(iso);
      const isSelected = toISODate(cellDate) === toISODate(selected);
      const isToday = toISODate(cellDate) === toISODate(new Date());

      const $day = $(`
                <div class="day ${isMuted ? "mutedDay" : ""} ${isSelected ? "selected" : ""} ${hasEvents ? "has-event" : ""}">
                    ${cellDate.getDate()}
                </div>
            `);

      if (isToday && !isSelected) {
        $day.css("border-color", "var(--primary)");
        $day.css("color", "var(--primary)");
        $day.css("font-weight", "700");
      }

      $day.on("click", function () {
        selected = stripTime(cellDate);
        renderCalendar();
        renderTasks();
      });

      $("#calendar").append($day);
    }
  }

  function renderTasks() {
    const iso = toISODate(selected);
    let tasks = getTasksForDate(selected);
    const q = ($("#search").val() || "").trim().toLowerCase();

    // Global search if query exists
    if (q) {
      tasks = loadAll().filter(
        (t) =>
          (t.title || "").toLowerCase().includes(q) ||
          (t.notes || "").toLowerCase().includes(q),
      );
      $("#selectedDateTitle").text(
        tasks.length ? "Search Results" : "No results found",
      );
    } else {
      $("#selectedDateTitle").text(prettyDate(selected));
    }

    $("#taskCount").text(
      tasks.length
        ? `${tasks.length} task${tasks.length === 1 ? "" : "s"}`
        : "No tasks",
    );
    $("#tasks").empty();

    if (tasks.length === 0) {
      $("#empty").removeClass("hidden");
      if (q) $("#empty p").text("No matches found.");
      else $("#empty p").text("No tasks for this day.");
      return;
    }

    $("#empty").addClass("hidden");

    // Sort: Pending first, then by time
    tasks.sort((a, b) => {
      if (a.status === b.status)
        return (a.time || "").localeCompare(b.time || "");
      return a.status === "Done" ? 1 : -1;
    });

    tasks.forEach((t) => {
      const isDone = t.status === "Done";
      const $item = $(`
                <div class="task-item priority-${(t.priority || "medium").toLowerCase()} ${isDone ? "task-completed" : ""}">
                    <div class="task-checkbox ${isDone ? "checked" : ""}">
                        ${isDone ? '<i class="ph-bold ph-check"></i>' : ""}
                    </div>
                    
                    <div class="task-content">
                        <h4 class="task-title">${escapeHtml(t.title)}</h4>
                        <div class="task-meta">
                            ${t.time ? `<span><i class="ph ph-clock"></i> ${t.time}</span>` : ""}
                            ${t.notes ? `<span><i class="ph ph-note"></i> Note</span>` : ""}
                            <span style="text-transform: capitalize;">${t.priority}</span>
                        </div>
                    </div>

                    <div class="task-actions">
                        <button class="icon-btn btn-edit" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                        <button class="icon-btn btn-delete" title="Delete"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
            `);

      // Toggle Status
      $item.find(".task-checkbox, .task-title").on("click", (e) => {
        e.stopPropagation(); // prevent triggering edit when clicking specific areas if row click was used
        const newStatus = t.status === "Done" ? "Pending" : "Done";
        updateTask(t.id, { status: newStatus });
        renderCalendar(); // To update dots
        renderTasks();
      });

      // Edit
      $item.find(".btn-edit").on("click", (e) => {
        e.stopPropagation();
        openModal("edit", t);
      });

      // Delete
      $item.find(".btn-delete").on("click", (e) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this task?")) {
          deleteTask(t.id);
          toast("Task deleted");
          renderCalendar();
          renderTasks();
        }
      });

      $("#tasks").append($item);
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- CRUD ---
  function createTask(task) {
    const all = loadAll();
    all.push(task);
    saveAll(all);
  }

  function updateTask(id, patch) {
    const all = loadAll().map((t) => (t.id === id ? { ...t, ...patch } : t));
    saveAll(all);
  }

  function deleteTask(id) {
    const all = loadAll().filter((t) => t.id !== id);
    saveAll(all);
  }

  // --- Modal ---
  function openModal(mode, task) {
    const $m = $("#modal");
    $m.removeClass("hidden");

    if (mode === "add") {
      $("#modalTitle").text("New Task");
      $("#taskId").val("");
      $("#title").val("");
      $("#time").val("");
      $("#notes").val("");
      $("#priority").val("Medium");
      $("#status").val("Pending");
      $("#btnDelete").addClass("hidden");
      $("#btnSave").text("Create Task");
    } else {
      $("#modalTitle").text("Edit Task");
      $("#taskId").val(task.id);
      $("#title").val(task.title);
      $("#time").val(task.time || "");
      $("#notes").val(task.notes || "");
      $("#priority").val(task.priority || "Medium");
      $("#status").val(task.status || "Pending");
      $("#btnDelete").removeClass("hidden");
      $("#btnSave").text("Save Changes");
    }

    $("#title").focus();
  }

  function closeModal() {
    $("#modal").addClass("hidden");
  }

  // --- Event Listeners ---
  $("#btnOpenModal, #btnEmptyAdd").on("click", () => openModal("add"));

  $("#btnClose, #btnCancel").on("click", closeModal);

  $("#modal").on("click", function (e) {
    if (e.target === this) closeModal();
  });

  $("#taskForm").on("submit", function (e) {
    e.preventDefault();

    const id = $("#taskId").val();
    const data = {
      title: $("#title").val().trim(),
      time: $("#time").val(),
      notes: $("#notes").val().trim(),
      priority: $("#priority").val(),
      status: $("#status").val(),
    };

    if (!data.title) return;

    if (!id) {
      createTask({
        id: uid(),
        date: toISODate(selected),
        createdAt: Date.now(),
        ...data,
      });
      toast("Task created successfully");
    } else {
      updateTask(id, data);
      toast("Task updated successfully");
    }

    closeModal();
    renderCalendar();
    renderTasks();
  });

  $("#btnDelete").on("click", function () {
    const id = $("#taskId").val();
    if (!id) return;

    if (confirm("Are you sure you want to delete this task?")) {
      deleteTask(id);
      toast("Task deleted", "error");
      closeModal();
      renderCalendar();
      renderTasks();
    }
  });

  $("#prevMonth").on("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    renderCalendar();
  });

  $("#nextMonth").on("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    renderCalendar();
  });

  $("#btnToday").on("click", () => {
    const now = stripTime(new Date());
    selected = now;
    view = new Date(now.getFullYear(), now.getMonth(), 1);

    // Reset search
    $("#search").val("");

    renderCalendar();
    renderTasks();
  });

  $("#search").on("input", function () {
    renderTasks(); // Calendar stays, but tasks list updates
  });

  // Init
  renderCalendar();
  renderTasks();
});
