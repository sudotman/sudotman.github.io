# sudotman.github.io

This repo powers a static personal website with one main interactive homepage and a few standalone side pages.

The biggest recent cleanup was structural: the old monolithic `css/style.css` and `js/main.js` were split into focused modules so the homepage is easier to maintain without changing behavior.

## Main Files

- `index.html`: primary homepage shell
- `content.json`: project data
- `profile.json`: experience, skills, and interests data
- `css/modules/`: homepage styling split by responsibility
- `js/modules/`: homepage logic split by responsibility

## Docs

- [Project structure](docs/PROJECT_STRUCTURE.md)
- [Website improvement plan](docs/WEBSITE_IMPROVEMENT_PLAN.md)

## Running Locally

Because `index.html` fetches local JSON files, serve the repo through a static server instead of opening the file directly.

Examples:

```powershell
npx serve .
```

```powershell
python -m http.server 8000
```

Then open the served URL in a browser.

## Notes

- `minimalist.html`, `outer_siraji_project.html`, `test.html`, and `terminal/` are currently standalone surfaces, not part of the shared homepage module system.
- Vendor assets are committed locally under `vendor/`.
