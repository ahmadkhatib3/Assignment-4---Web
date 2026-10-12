# ATMOS - Weather Dashboard

A responsive weather dashboard built with plain HTML, CSS and JavaScript.
Search any city and see live conditions: temperature, weather description and icon,
feels-like, humidity, wind, precipitation, sunrise/sunset, high/low and a 5-day forecast.

## Features
- City search with live data from the [Open-Meteo](https://open-meteo.com/) API
- `async/await` + `try/catch` around every request, with explicit handling of non-200 responses
- Visible loading indicator (button spinner + status message); old requests are cancelled when you search again
- Friendly error messages for: empty input, unknown city, no internet, timeout, rate limit (429), server errors (5xx) and incomplete responses - no unhandled console errors
- Responsive layout (mobile and desktop), accessible labels, focus styles and live status announcements
- Day/night theme depending on the city's local time

## API key / setup instructions
**No API key is required.** Open-Meteo is free for non-commercial use and needs no sign-up,
so there is no secret in the repository. A `.gitignore` is included that ignores `.env` files,
and `.env.example` documents what to do if you swap to a keyed API (such as OpenWeatherMap):

1. Create an account at https://openweathermap.org/api and copy your key.
2. Copy `.env.example` to `.env` and put your key in it (`.env` is git-ignored).
3. Never paste the key directly into `script.js` before committing.

## Run the project
1. Download or clone the repository.
2. Open `index.html` in your browser (double-click it), or in VS Code use the *Live Server* extension.
3. Type a city (for example `Beirut`, `Paris`, `Tokyo`) and press **Search**.

## Project structure
```
weather-dashboard/
  index.html    page structure
  style.css     styles + responsive layout
  script.js     API calls, loading/error handling, rendering
  README.md
  .gitignore
  .env.example
```

## API endpoints used
- Geocoding: `https://geocoding-api.open-meteo.com/v1/search?name=<city>`
- Forecast: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=..&daily=..`
