const GAMES = [
  { id: 1, away: "Dallas", home: "Philadelphia" },
  { id: 2, away: "Kansas City", home: "Chargers" },
  { id: 3, away: "Tampa Bay", home: "Atlanta" },
  { id: 4, away: "Cincinnati", home: "Cleveland" },
  { id: 5, away: "Miami", home: "Indianapolis" },
  { id: 6, away: "Las Vegas", home: "New England" },
  { id: 7, away: "Arizona", home: "New Orleans" },
  { id: 8, away: "Pittsburgh", home: "Jets" },
  { id: 9, away: "Giants", home: "Washington" },
  { id: 10, away: "Carolina", home: "Jacksonville" },
  { id: 11, away: "Tennessee", home: "Denver" },
  { id: 12, away: "San Francisco", home: "Seattle" },
  { id: 13, away: "Detroit", home: "Green Bay" },
  { id: 14, away: "Houston", home: "Rams" },
  { id: 15, away: "Baltimore", home: "Buffalo" },
  { id: 16, away: "Minnesota", home: "Chicago" }
];

document.addEventListener("DOMContentLoaded", async () => {
  const { data } = await supabase.auth.getSession();

  if (data.session) {
    showPicks();
  } else {
    showLogin();
  }

  buildGames();
});

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("loginMessage");

  msg.textContent = "";

  if (!email || !password) {
    msg.textContent = "Please enter email and password.";
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password
  });

  if (error) {
    msg.textContent = error.message;
    return;
  }

  showPicks();
}

async function logout() {
  await supabase.auth.signOut();
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

  for (const game of GAMES) {
    const selected = document.querySelector(
      `input[name="game_${game.id}"]:checked`
    );

    if (!selected) {
      return null;
    }

    picks[game.id] = {
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
  const tiebreak = Number(document.getElementById("tiebreak").value);

  const picks = getSelectedPicks();

  if (!picks) {
    msg.textContent = "Please pick every game.";
    return;
  }

  if (!tiebreak && tiebreak !== 0) {
    msg.textContent = "Please enter a tie breaker.";
    return;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    msg.textContent = "You must be logged in.";
    return;
  }

  const user = userData.user;

  const { error } = await supabase
    .from("weekly_picks")
    .upsert(
      {
        user_id: user.id,
        email: user.email,
        season: season,
        week_number: weekNumber,
        picks: picks,
        tiebreak: tiebreak,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "user_id,season,week_number"
      }
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

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return;
  }

  const { data, error } = await supabase
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

  buildGames();

  if (!data) {
    document.getElementById("tiebreak").value = "";
    msg.textContent = "No picks saved yet for this week.";
    return;
  }

  Object.keys(data.picks).forEach(gameId => {
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