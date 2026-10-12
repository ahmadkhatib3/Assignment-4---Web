// ATMOS - Weather Dashboard
// Uses the free Open-Meteo API (no API key needed):
//   1) Geocoding API: city name -> latitude / longitude
//   2) Forecast API:  latitude / longitude -> current weather + daily forecast

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_CITY = "Beirut";
const TIMEOUT_MS = 10000;

// ---------- DOM elements ----------
const form = document.getElementById("search-form");
const input = document.getElementById("city-input");
const clearBtn = document.getElementById("clear-btn");
const searchBtn = document.getElementById("search-btn");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const errorText = document.getElementById("error-text");
const weatherEl = document.getElementById("weather");

// Used to cancel an old request when the user starts a new search
let currentController = null;

// ---------- Custom error so we can show friendly messages ----------
class AppError extends Error {}

// ---------- WMO weather codes -> text + icon ----------
function describeWeather(code, isDay) {
  if (code === 0) return { text: isDay ? "Clear sky" : "Clear night", icon: isDay ? "sun" : "moon" };
  if (code === 1) return { text: "Mainly clear", icon: isDay ? "sun" : "moon" };
  if (code === 2) return { text: "Partly cloudy", icon: isDay ? "partly" : "partlyNight" };
  if (code === 3) return { text: "Overcast", icon: "cloud" };
  if (code === 45 || code === 48) return { text: "Foggy", icon: "fog" };
  if (code >= 51 && code <= 57) return { text: "Drizzle", icon: "rain" };
  if (code >= 61 && code <= 67) return { text: "Rain", icon: "rain" };
  if (code >= 71 && code <= 77) return { text: "Snow", icon: "snow" };
  if (code >= 80 && code <= 82) return { text: "Rain showers", icon: "rain" };
  if (code === 85 || code === 86) return { text: "Snow showers", icon: "snow" };
  if (code >= 95) return { text: "Thunderstorm", icon: "storm" };
  return { text: "Unknown", icon: "cloud" };
}

// Small inline SVG illustrations (no external images needed)
const CLOUD = '<path d="M30 78h46a17 17 0 0 0 2-33.9A24 24 0 0 0 32 40a19 19 0 0 0-2 38z" fill="#9fb3b8"/>';
const SUN = '<circle cx="50" cy="40" r="20" fill="#d9a566"/>';
const MOON = '<path d="M62 22a26 26 0 1 0 22 40A30 30 0 0 1 62 22z" fill="#e8dcc0"/>';
const ICONS = {
  sun: SUN,
  moon: MOON,
  partly: '<circle cx="62" cy="36" r="20" fill="#d9a566"/>' + CLOUD,
  partlyNight: '<path d="M68 14a20 20 0 1 0 18 30A24 24 0 0 1 68 14z" fill="#e8dcc0"/>' + CLOUD,
  cloud: CLOUD,
  fog: CLOUD + '<path d="M22 88h56M30 96h40" stroke="#9fb3b8" stroke-width="4" stroke-linecap="round"/>',
  rain: CLOUD + '<path d="M36 86l-4 10M52 86l-4 10M68 86l-4 10" stroke="#6fb1d6" stroke-width="4" stroke-linecap="round"/>',
  snow: CLOUD + '<g fill="#f4efe6"><circle cx="34" cy="90" r="3"/><circle cx="52" cy="94" r="3"/><circle cx="70" cy="90" r="3"/></g>',
  storm: CLOUD + '<path d="M54 76l-10 14h8l-5 12 14-17h-8z" fill="#f2c14e"/>',
};
function iconSvg(name) {
  return '<svg viewBox="0 0 100 105" role="img" aria-label="' + name + '">' + (ICONS[name] || ICONS.cloud) + "</svg>";
}

// ---------- Loading / error helpers ----------
function setLoading(isLoading) {
  loadingEl.hidden = !isLoading;
  searchBtn.disabled = isLoading;
  searchBtn.classList.toggle("is-loading", isLoading);
  searchBtn.setAttribute("aria-busy", String(isLoading));
  weatherEl.classList.toggle("is-stale", isLoading);
}

function showError(message) {
  errorText.textContent = message;
  errorEl.hidden = false;
}

function hideError() {
  errorEl.hidden = true;
  errorText.textContent = "";
}

// ---------- Fetch helper: timeout + explicit handling of non-200 responses ----------
async function fetchJson(url, signal) {
  // Abort automatically if the request takes too long
  const timer = setTimeout(() => currentController && currentController.abort("timeout"), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { signal });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new AppError("Too many requests right now (rate limit reached). Please wait a minute and try again.");
  }
  if (response.status >= 500) {
    throw new AppError("The weather service is having problems. Please try again in a moment.");
  }
  if (!response.ok) {
    throw new AppError("The weather service returned an error (" + response.status + "). Please try again.");
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new AppError("The weather service sent a response we could not read.");
  }
  return data;
}

// ---------- API calls ----------
async function getCoordinates(city, signal) {
  const url = GEO_URL + "?name=" + encodeURIComponent(city) + "&count=1&language=en&format=json";
  const data = await fetchJson(url, signal);

  if (!data.results || data.results.length === 0) {
    throw new AppError('We couldn\'t find a city called "' + city + '". Check the spelling and try again.');
  }
  return data.results[0];
}

async function getWeather(lat, lon, signal) {
  const url = WEATHER_URL +
    "?latitude=" + lat + "&longitude=" + lon +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset" +
    "&timezone=auto&forecast_days=6";
  const data = await fetchJson(url, signal);

  // Make sure the response has everything we need before rendering
  if (!data.current || !data.daily || !data.daily.time) {
    throw new AppError("The weather data came back incomplete. Please try again.");
  }
  return data;
}

// ---------- Main search function ----------
async function searchCity(city) {
  // Cancel any request that is still running
  if (currentController) currentController.abort("new-search");
  currentController = new AbortController();
  const signal = currentController.signal;

  hideError();
  setLoading(true);

  try {
    const place = await getCoordinates(city, signal);
    const weather = await getWeather(place.latitude, place.longitude, signal);
    renderWeather(place, weather);
  } catch (err) {
    if (err.name === "AbortError" || signal.aborted) {
      // Aborted because of a newer search -> ignore. Aborted by timeout -> tell the user.
      if (signal.reason === "timeout") {
        showError("The request took too long. Check your connection and try again.");
        setLoading(false);
      }
      return;
    }
    if (err instanceof AppError) {
      showError(err.message);
    } else if (err instanceof TypeError) {
      // fetch() throws TypeError when there is no network
      showError("Network error. Please check your internet connection and try again.");
    } else {
      showError("Something went wrong. Please try again.");
    }
    setLoading(false);
    return;
  }
  setLoading(false);
}

// ---------- Rendering ----------
function setText(id, value) {
  document.getElementById(id).textContent = value;
}

// "2026-10-12T06:30" -> "6:30 AM"  (times are already in the city's local timezone)
function formatTime(iso) {
  const parts = iso.split("T")[1].split(":");
  let hour = Number(parts[0]);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return hour + ":" + parts[1] + " " + suffix;
}

function parseLocalDate(iso) {
  const p = iso.split("T")[0].split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function renderWeather(place, data) {
  const cur = data.current;
  const daily = data.daily;
  const isDay = cur.is_day === 1;
  const info = describeWeather(cur.weather_code, isDay);

  const cityLabel = place.name + (place.country ? ", " + place.country : "");
  setText("city-name", cityLabel);
  setText("date-text", parseLocalDate(cur.time).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
  setText("temp-value", Math.round(cur.temperature_2m));
  setText("condition", info.text);
  setText("feels", "Feels like " + Math.round(cur.apparent_temperature) + "\u00B0");
  setText("hi-lo", "H " + Math.round(daily.temperature_2m_max[0]) + "\u00B0   L " + Math.round(daily.temperature_2m_min[0]) + "\u00B0");
  document.getElementById("weather-icon").innerHTML = iconSvg(info.icon);

  setText("humidity", cur.relative_humidity_2m + "%");
  document.getElementById("wind").innerHTML = Math.round(cur.wind_speed_10m) + " <small>km/h</small>";
  document.getElementById("precip").innerHTML = cur.precipitation + " <small>mm</small>";
  setText("sunrise", formatTime(daily.sunrise[0]));
  setText("sunset", "Sunset " + formatTime(daily.sunset[0]));
  setText("updated", "Updated " + formatTime(cur.time));
  setText("coords", Math.abs(place.latitude).toFixed(2) + "\u00B0" + (place.latitude >= 0 ? "N" : "S") + "  " +
                    Math.abs(place.longitude).toFixed(2) + "\u00B0" + (place.longitude >= 0 ? "E" : "W"));

  // 5-day forecast (skip index 0 = today)
  const list = document.getElementById("forecast-list");
  list.innerHTML = "";
  for (let i = 1; i < daily.time.length; i++) {
    const dayInfo = describeWeather(daily.weather_code[i], true);
    const li = document.createElement("li");
    li.innerHTML =
      '<p class="f-day">' + parseLocalDate(daily.time[i]).toLocaleDateString("en-US", { weekday: "short" }) + "</p>" +
      '<div class="f-icon">' + iconSvg(dayInfo.icon) + "</div>" +
      '<p class="f-temps">' + Math.round(daily.temperature_2m_max[i]) + "\u00B0 <span>" + Math.round(daily.temperature_2m_min[i]) + "\u00B0</span></p>";
    list.appendChild(li);
  }

  document.body.classList.toggle("night", !isDay);
  weatherEl.hidden = false;
}

// ---------- Events ----------
form.addEventListener("submit", function (event) {
  event.preventDefault();
  const city = input.value.trim();

  if (city === "") {
    showError("Please type a city name first.");
    input.focus();
    return;
  }
  searchCity(city);
});

input.addEventListener("input", function () {
  clearBtn.hidden = input.value === "";
});

clearBtn.addEventListener("click", function () {
  input.value = "";
  clearBtn.hidden = true;
  hideError();
  input.focus();
});

// Load a default city so the page is not empty on open
input.value = DEFAULT_CITY;
clearBtn.hidden = false;
searchCity(DEFAULT_CITY);
