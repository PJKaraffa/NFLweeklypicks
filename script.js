let GAMES = [];

document.addEventListener("DOMContentLoaded", async function () {
  setGamesForCurrentWeek();

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

function getCurrentSeason() {
  return Number(document.getElementById("season").value);
}

function getCurrentWeek() {
  return Number(document.getElementById("weekNumber").value);
}

function setGamesForCurrentWeek() {
  const season = getCurrentSeason();
  const weekNumber = getCurrentWeek();

  if (NFL_GAMES[season] && NFL_GAMES[season][weekNumber]) {
    GAMES = NFL_GAMES[season][weekNumber];
  } else {
    GAMES = [];
  }
}

function weekChanged() {
  setGamesForCurrentWeek();
  buildGames();
  clearPickForm();
}

function clearPickForm() {
  document.getElementById("tiebreak").value = "";

  const msg = document.getElementById("pickMessage");
  if (msg) msg.textContent = "";
}

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("loginMessage");

  msg.textContent = "";

  if (!email || !password) {
    msg.textContent = "Please enter email and password.";
    return;
  }

  const { data, error } = await db.auth.signInWithPassword({
    email: email,
    password: password
  });

  if (error) {
    console.error(error);
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

  setGamesForCurrentWeek();
  buildGames();
  loadMyPicks();
}

function buildGames() {
  const gamesDiv = document.getElementById("games");

  gamesDiv.innerHTML = "";

  if (GAMES.length === 0) {
    gamesDiv.innerHTML = `
      <div class="game-card">
        <strong>No games have been entered for this week yet.</strong>
      </div>
    `;
    return;
  }

  GAMES.forEach(function (game) {
    const div = document.createElement("div");
    div.className = "game-card";

    div.innerHTML = `
      <div class="teams">
        <div>
          <strong>${game.away}</strong> @ <strong>${game.home}</strong>
        </div>

        <div class="pick-options">
          <label>
            <input type="radio" name="game_${game.id}" value="${game.away}">
            ${game.away}
          </label>

          <label>
            <input type="radio" name="game_${game.id}" value="${game.home}">
            ${game.home}
          </label>
        </div>
      </div>
    `;

    gamesDiv.appendChild(div);
  });
}

function getSelectedPicks() {
  const picks = {};

  if (GAMES.length === 0) {
    return null;
  }

  for (const game of GAMES) {
    const selected = document.querySelector(
      `input[name="game_${game.id}"]:checked`
    );

    if (!selected) {
      return null;
    }

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

  const season = getCurrentSeason();
  const weekNumber = getCurrentWeek();
  const tiebreakRaw = document.getElementById("tiebreak").value;

  setGamesForCurrentWeek();

  if (GAMES.length === 0) {
    msg.textContent = "No games entered for this week.";
    return;
  }

  if (tiebreakRaw === "") {
    msg.textContent = "Please enter a tie breaker.";
    return;
  }

  const tiebreak = Number(tiebreakRaw);

  if (tiebreak < 0) {
    msg.textContent = "Tie breaker cannot be negative.";
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

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email;

  const { error } = await db
    .from("weekly_picks")
    .upsert(
      {
        user_id: user.id,
        email: user.email,
        display_name: displayName,
        season: season,
        week_number: weekNumber,
        picks: picks,
        tiebreak: tiebreak,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "user_id,season,week_number"
      }
    );

  if (error) {
    console.error(error);
    msg.textContent = error.message;
    return;
  }

  msg.textContent = "Picks saved successfully!";
}

async function loadMyPicks() {
  const msg = document.getElementById("pickMessage");
  if (msg) msg.textContent = "";

  const season = getCurrentSeason();
  const weekNumber = getCurrentWeek();

  const { data: userData, error: userError } = await db.auth.getUser();

  if (userError || !userData.user) {
    return;
  }

  const { data, error } = await db
    .from("weekly_picks")
    .select("*")
    .eq("user_id", userData.user.id)
    .eq("season", season)
    .eq("week_number", weekNumber)
    .maybeSingle();

  if (error) {
    console.error(error);
    msg.textContent = error.message;
    return;
  }

  if (!data) {
    document.getElementById("tiebreak").value = "";
    msg.textContent = "No picks saved yet for this week.";
    return;
  }

  Object.keys(data.picks).forEach(function (gameId) {
    const pick = data.picks[gameId].pick;

    const radio = document.querySelector(
      `input[name="game_${gameId}"][value="${pick}"]`
    );

    if (radio) {
      radio.checked = true;
    }
  });

  document.getElementById("tiebreak").value = data.tiebreak;
  msg.textContent = "Your saved picks were loaded.";
}

async function exportMyPicks() {
  const season = getCurrentSeason();
  const weekNumber = getCurrentWeek();

  const { data: userData, error: userError } = await db.auth.getUser();

  if (userError || !userData.user) {
    alert("You must be logged in.");
    return;
  }

  const { data, error } = await db
    .from("weekly_picks")
    .select("*")
    .eq("user_id", userData.user.id)
    .eq("season", season)
    .eq("week_number", weekNumber)
    .maybeSingle();

  if (error || !data) {
    alert("No picks found to export.");
    return;
  }

  let rows = [];

  rows.push([
    "Season",
    "Week",
    "Email",
    "Display Name",
    "Game",
    "Away",
    "Home",
    "Pick"
  ]);

  Object.keys(data.picks).forEach(function (gameId) {
    const p = data.picks[gameId];

    rows.push([
      data.season,
      data.week_number,
      data.email,
      data.display_name,
      gameId,
      p.away,
      p.home,
      p.pick
    ]);
  });

  rows.push([]);
  rows.push(["Tie Breaker", data.tiebreak]);

  const csv = rows
    .map(row => row.map(csvEscape).join(","))
    .join("\n");

  downloadFile(`my_picks_week_${weekNumber}.csv`, csv);
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";

  const text = String(value);

  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
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
