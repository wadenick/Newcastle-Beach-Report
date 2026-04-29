# Newcastle Beach Report Plus

A static GitHub Pages site that scrapes the City of Newcastle beach pages, merges in child-page closure warnings, and publishes a more visual public dashboard.

## What is new in this package

- A clearer **last refreshed** banner near the top of the page
- A simple **map strip** showing the beaches along the coast
- Built-in **visual beach thumbnails** on each card with no external image dependencies
- The same GitHub Actions refresh and GitHub Pages deploy flow as the first package

## What this package does

- Scrapes the Newcastle beaches index page for summary data
- Scrapes each child beach page for warnings like `Warning: Beach closed due to weather conditions`
- Generates `site/data/beaches.json`
- Publishes the static site to GitHub Pages
- Refreshes on a GitHub Actions schedule every 20 minutes (note: GitHub cron for free accounts is unreliable)

## Local setup

```bash
npm install
npm run build
npm run dev
```

Then open `http://localhost:4173`.

## Deploy on GitHub Pages

1. Create a new GitHub repository.
2. Upload this project and push it to the `main` branch.
3. In GitHub, go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Go to **Actions** and run **Update beach data and deploy Pages** once manually.
6. After the first successful run, your site will be live on your GitHub Pages URL.

## How the refresh works

The workflow in `.github/workflows/update-and-deploy.yml`:

- runs on every push to `main`
- can be run manually
- runs on a 10-minute schedule using GitHub Actions cron
- rebuilds `site/data/beaches.json`
- deploys the `site/` folder to GitHub Pages

## Where to customize the visuals

- `site/index.html` for page structure
- `site/styles.css` for all visual styling, map strip, and thumbnails
- `site/app.js` for filters, rendering, and map pin placement
- `scripts/scrape.mjs` for scraping logic

## Notes

- The map strip is schematic rather than GIS-accurate. It is meant for quick scanning.
- The thumbnails are stylized gradients so the site stays self-contained and easy to deploy.
- If you later want real photography, the easiest path is to add your own images to `site/images/` and update the card thumbnail styles in `site/styles.css`.

## Troubleshooting

If the site deploys but the cards are empty:

1. Open the latest workflow run in **Actions**.
2. Check whether `npm run build` failed.
3. If the City of Newcastle markup changed, update the regexes in `scripts/scrape.mjs`.
4. Re-run the workflow manually after your fix.
