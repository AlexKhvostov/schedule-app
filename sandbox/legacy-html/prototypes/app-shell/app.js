const WEEK = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MARKS = [
  { t: "PL", bg: "#ffd966", fg: "#1a2118" },
  { t: "SV", bg: "#ea9999", fg: "#1a2118" },
  { t: "OK", bg: "#9fc5e8", fg: "#1a2118" },
  { t: "AL", bg: "#b6d7a8", fg: "#1a2118" },
  { t: "XP", bg: "#d5a6bd", fg: "#1a2118" },
  { t: "LO", bg: "#f9cb9c", fg: "#1a2118" },
];
const ME = { t: "YO", bg: "#c4d45a", fg: "#1a2118" };

function daysInMonth(year, monthIndex) {
  const list = [];
  const last = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= last; d += 1) {
    const dt = new Date(year, monthIndex, d);
    list.push({ d, wd: WEEK[dt.getDay()] });
  }
  return list;
}

function capFor(halfIndex) {
  const hour = Math.floor(halfIndex / 2);
  return hour >= 22 || hour < 6 ? 2 : 1;
}

const dayPlans = {};

function planForDay(day) {
  if (dayPlans[day]) return dayPlans[day];
  const occupied = Array.from({ length: 48 }, () => []);
  let cursor = (day * 3) % 6;
  for (let block = 0; block < 4; block += 1) {
    const len = 4 + ((day + block) % 5);
    const mark = MARKS[(day + block) % MARKS.length];
    for (let i = 0; i < len && cursor < 48; i += 1, cursor += 1) {
      occupied[cursor] = [mark];
    }
    cursor += 2 + (day % 4);
  }
  for (let half = 0; half < 48; half += 1) {
    if (occupied[half].length && capFor(half) === 2 && (day + half) % 7 === 0) {
      const extra = MARKS[(day + 3) % MARKS.length];
      if (extra.t !== occupied[half][0].t) occupied[half] = [occupied[half][0], extra];
    }
  }
  dayPlans[day] = occupied;
  return occupied;
}

function seed(day, half) {
  return planForDay(day)[half];
}

function markHtml(m) {
  return `<span class="mark" style="background:${m.bg};color:${m.fg}">${m.t}</span>`;
}

function renderMonth(root) {
  const days = daysInMonth(2026, 8);
  const halves = Array.from({ length: 48 }, (_, i) => i);

  let hourRow = `<th class="corner" rowspan="2"></th>`;
  let halfRow = "";
  for (let h = 0; h < 24; h += 1) {
    hourRow += `<th class="hour" colspan="2">${String(h).padStart(2, "0")}</th>`;
    halfRow += `<th class="half">00</th><th class="half">30</th>`;
  }

  const body = days
    .map((day) => {
      const cells = halves
        .map((half) => {
          const who = seed(day.d, half);
          const cap = capFor(half);
          const full = who.length >= cap ? " is-full" : "";
          const cap2 = cap === 2 ? " is-cap2" : "";
          return `<td class="slot${cap2}${full}" data-day="${day.d}" data-half="${half}" data-cap="${cap}">${who.map(markHtml).join("")}</td>`;
        })
        .join("");
      return `<tr><th class="day">${String(day.d).padStart(2, "0")}<span class="wd">${day.wd}</span></th>${cells}</tr>`;
    })
    .join("");

  root.innerHTML = `<table class="month-table"><thead><tr>${hourRow}</tr><tr>${halfRow}</tr></thead><tbody>${body}</tbody></table>`;

  root.querySelectorAll(".slot").forEach((cell) => {
    cell.addEventListener("click", () => {
      const cap = Number(cell.dataset.cap);
          const mine = [...cell.querySelectorAll(".mark")].find((el) => el.textContent === ME.t);
          if (mine) mine.remove();
          else {
            const count = cell.querySelectorAll(".mark").length;
            if (count >= cap) return;
            cell.insertAdjacentHTML("beforeend", markHtml(ME));
          }
      const count = cell.querySelectorAll(".mark").length;
      cell.classList.toggle("is-full", count >= cap);
    });
  });
}

document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn[data-view]").forEach((b) => b.classList.remove("is-on"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("is-on"));
    btn.classList.add("is-on");
    document.getElementById(`view-${btn.dataset.view}`).classList.add("is-on");
  });
});

renderMonth(document.getElementById("month-root"));
