const GAMES = [
  { id: 1, away: "Atlanta", home: "Green Bay" },
  { id: 2, away: "Chargers", home: "Buffalo" },
  { id: 3, away: "Carolina", home: "Cleveland" },
  { id: 4, away: "Jets", home: "Detroit" },
  { id: 5, away: "Houston", home: "Indianapolis" },
  { id: 6, away: "Kansas City", home: "Miami" },
  { id: 7, away: "Tennessee", home: "Giants" },
  { id: 8, away: "Cincinnati", home: "Pittsburgh" },
  { id: 9, away: "Seattle", home: "Washington" },
  { id: 10, away: "New England", home: "Jacksonville" },
  { id: 11, away: "Arizona", home: "San Francisco" },
  { id: 12, away: "Minnesota", home: "Tampa Bay" },
  { id: 13, away: "Baltimore", home: "Dallas" },
  { id: 14, away: "Las Vegas", home: "New Orleans" },
  { id: 15, away: "Rams", home: "Denver" },
  { id: 16, away: "Philadelphia", home: "Chicago" }
];

document.addEventListener("DOMContentLoaded", async function () {
  buildGames();

  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error(error);
    showLogin();
    return;
  }

  if (data.session) {
    showPicks();
  } else {
    showLogin();
  }
});

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("loginMessage");

  msg.textContent = "";

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    msg.textContent = error.message;
    return;
  }

  showPicks();
}

async function logout() {
  await db.auth.signOut();
  showLogin();
}

function showLogin() {
  document.getElementById("loginView").classList.remove("hidden");
  document.getElementById("picksView").classList.add("hidden");
}

function showPicks() {
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("picksView").classList.remove("hidden");
  buildGames();
  loadMyPicks();
}

function buildGames() {
  const gamesDiv = document.getElementById("games");
  gamesDiv.innerHTML = "";

  GAMES.forEach(game => {
    const div = document.createElement("div");
    div.className = "game-card";

    div.innerHTML = `
      <div class="teams">
        <div><strong>${game.away}</strong> @ <strong>${game.home}</strong></div>
        <div class="pick-options">
          <label><input type="radio" name="game_${game.id}" value="${game.away}"> ${game.away}</label>
          <label><input type="radio" name="game_${game.id}" value="${game.home}"> ${game.home}</label>
        </div>
      </div>
    `;

    gamesDiv.appendChild(div);
  });
}

function getSelectedPicks() {
  const picks = {};

  for (const game of GAMES) {
    const selected = document.querySelector(`input[name="game_${game.id}"]:checked`);

    if (!selected) return null;

    picks[game.id] = {
      game_id: game.id,
      away: game.away,
      home: game.home,
      pick: selected.value
    };
  }

  return picks;
}

async function submitPicks() {
  const msg = document.getElementById("pickMessage");
  msg.textContent = "";

  const season = Number(document.getElementById("season").value);
  const weekNumber = Number(document.getElementById("weekNumber").value);
  const tiebreakRaw = document.getElementById("tiebreak").value;

  if (tiebreakRaw === "") {
    msg.textContent = "Please enter a tie breaker.";
    return;
  }

  const picks = getSelectedPicks();

  if (!picks) {
    msg.textContent = "Please pick every game.";
    return;
  }

  const { data: userData, error: userError } = await db.auth.getUser();

  if (userError || !userData.user) {
    msg.textContent = "You must be logged in.";
    return;
  }

  const user = userData.user;

  const { error } = await db.from("weekly_picks").upsert(
    {
      user_id: user.id,
      email: user.email,
      display_name: user.email,
      season: season,
      week_number: weekNumber,
      picks: picks,
      tiebreak: Number(tiebreakRaw),
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,season,week_number" }
  );

  if (error) {
    msg.textContent = error.message;
    return;
  }

  msg.textContent = "Picks saved successfully!";
}

async function loadMyPicks() {
  const msg = document.getElementById("pickMessage");
  msg.textContent = "";

  const season = Number(document.getElementById("season").value);
  const weekNumber = Number(document.getElementById("weekNumber").value);

  const { data: userData } = await db.auth.getUser();

  if (!userData.user) return;

  const { data, error } = await db
    .from("weekly_picks")
    .select("*")
    .eq("user_id", userData.user.id)
    .eq("season", season)
    .eq("week_number", weekNumber)
    .maybeSingle();

  if (error) {
    msg.textContent = error.message;
    return;
  }

  if (!data) {
    document.getElementById("tiebreak").value = "";
    msg.textContent = "No picks saved yet for this week.";
    return;
  }

  Object.keys(data.picks).forEach(gameId => {
    const pick = data.picks[gameId].pick;
    const radio = document.querySelector(`input[name="game_${gameId}"][value="${pick}"]`);
    if (radio) radio.checked = true;
  });

  document.getElementById("tiebreak").value = data.tiebreak;
  msg.textContent = "Your saved picks were loaded.";
}

async function exportMyPicks() {
  const season = Number(document.getElementById("season").value);
  const weekNumber = Number(document.getElementById("weekNumber").value);

  const { data: userData } = await db.auth.getUser();

  if (!userData.user) {
    alert("You must be logged in.");
    return;
  }

  const { data } = await db
    .from("weekly_picks")
    .select("*")
    .eq("user_id", userData.user.id)
    .eq("season", season)
    .eq("week_number", weekNumber)
    .maybeSingle();

  if (!data) {
    alert("No picks found to export.");
    return;
  }

  const rows = [["Season", "Week", "Email", "Game", "Away", "Home", "Pick"]];

  Object.keys(data.picks).forEach(gameId => {
    const p = data.picks[gameId];
    rows.push([data.season, data.week_number, data.email, gameId, p.away, p.home, p.pick]);
  });

  rows.push([]);
  rows.push(["Tie Breaker", data.tiebreak]);

  const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
  downloadFile(`my_picks_week_${weekNumber}.csv`, csv);
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return text.includes(",") || text.includes('"') || text.includes("\n")
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function downloadFile(filename, text) {
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
