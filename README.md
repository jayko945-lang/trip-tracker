# Trip Tracker

An offline web app for one teacher to track field trips, robotics events and overnight trips, and the district paperwork each one needs. It installs to the iPhone home screen. There's no server, no accounts and no build step. All data stays on the device.

## Features

- **To do** (Home): every open task across all trips, grouped Overdue / Needs a due date / Today / This week / Later, and within each section grouped by trip. **Later** is collapsed until you tap Show. Tap the circle to complete a task (Undo is offered). Tap the task's text to drop down a note box with **Save note** and **View trip**; tap it again to close. Tap the trip name to open the trip. Trips that ended more than 7 days ago drop off this screen.
- **Trips**: upcoming and past trips, filterable by class or team.
- **Trip detail**: checklist grouped by due date, flags, student count, chaperone-ratio warning, cost, amount collected and outstanding, and notes. Tap a task to override its due date, mark it N/A, set the date for a manual-date task, or add a short **note** (for example a bus confirmation number). Notes show under the task and save however you close the sheet. You can add your own tasks.
- **New/Edit trip**: choosing a kind presets the flags. Changing a flag adds or removes tasks; completed tasks are never lost (they move to "Completed, no longer required").
- **Settings**: no-school calendar (single dates and ranges, "No students" or "Student-free workday", plus a toggle for whether workdays count as school days, default off), class/team list, editable lead times and labels, and JSON backup/restore with a "last backed up" date. A reminder banner appears 30 days after the last backup.
- **Add to Calendar**: exports a trip's due dates as an `.ics` file with a 7 AM alert on each due date. This stands in for push notifications. The Trips screen can export **all upcoming trips** in one file, or just the ones matching the class/team filter. Calendar files are a snapshot, so re-adding a trip after changes may create duplicates in the iPhone Calendar.
- **Undo instead of "Are you sure?"**: deleting a trip or a custom task, removing a no-school date or class/team, and resetting lead times all happen right away with an Undo button. Importing a backup still asks first, because it replaces everything.
- **Updates**: when a new version has downloaded, a "A new version is ready" bar appears. Tap **Reload** to switch to it.
- **Text size**: on iPhone, text follows Settings → Display & Brightness → Text Size.

## Screen sizes

The layout adapts to the screen and reflows live when you fold, unfold or rotate:

- **Phones and the iPhone Duo outer screen:** one column.
- **iPhone Duo unfolded, landscape and iPad (600pt and wider):** two panes. Home shows "Now" (overdue, needs a date, today) beside "Coming up" (this week, later). Trip detail puts the info beside the checklist. Trips is a card grid, Settings has two columns, and task sheets open as centered dialogs.
- **Side-by-side apps (as narrow as 320pt):** compact single column.

## How due dates work

Due dates count **backward from the trip start date**.

- **School days** are Monday–Friday, skipping every date in the no-school calendar. "N school days before" steps back one day at a time from the event date and counts only school days, until N are counted. The event date itself is never counted. N = 0 means the event date.
- Early-release days count as school days.
- Student-free workdays do **not** count unless you turn on the toggle in Settings.
- **Calendar days** (used for flights and rental car) are plain day counts.
- A task's due date can be overridden on its own. Robotics registration and payment have no template date; you enter it yourself.
- Changing the calendar or lead times updates every trip right away.

Example: for an event on Thu 2027-01-07, 10 school days before is Thu 2026-12-10 (winter break is skipped).

## Files

```
index.html          app shell, iOS meta tags
manifest.json       install metadata
sw.js               service worker (offline cache)
css/app.css         styles (light/dark, safe areas)
js/dates.js         school-day counter and date math
js/templates.js     district task template, trip kinds, flags
js/domain.js        task add/drop rules, grouping, chaperone ratio
js/seed.js          Klamath County SD 2026-27 no-school dates
js/store.js         localStorage persistence, import/export
js/ics.js           calendar export
js/ui.js            formatting, sheets, toasts, share/download
js/app.js           router
js/views/*.js       screens
icons/              app icons
tests/              unit tests (Node's built-in test runner)
```

## Run the tests

Needs Node 18 or newer. There are no dependencies to install.

```bash
npm test
```

## Run locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. Service workers need `http://localhost` or HTTPS; they won't run from a `file://` URL.

## Deploy on GitHub Pages

1. Create a new GitHub repository, for example `trip-tracker`.
2. Push this folder to it:

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Trip Tracker"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/YOUR-USERNAME/trip-tracker.git
```

```bash
git push -u origin main
```

3. On GitHub, open the repo's **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, then click Save.
4. After a minute the app is live at `https://YOUR-USERNAME.github.io/trip-tracker/`. All paths are relative, so it works from that sub-folder.

### Install on iPhone

1. Open the GitHub Pages URL in **Safari** (not Chrome; on iPhone only Safari can add web apps to the home screen).
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Launch it from the home screen icon once while online so it caches itself. After that it works with no connection.

### Updating the app

When you push changes, the installed app downloads them in the background and shows a "new version is ready" bar; tap Reload (or just open the app again later). If you add, remove or rename a file, also add it to the `FILES` list in `sw.js` and change `VERSION` (for example to `'v2'`). A test (`tests/sw.test.js`) fails if that list doesn't match the files on disk.

## Backups (important)

iOS can delete web app data if the phone runs low on storage, or if the app isn't opened for a long time. In **Settings → Export backup**, choose "Save to Files" and save to iCloud Drive. To restore, use **Import backup** and pick that file. Importing **replaces** all trips and settings.

## Privacy

Never store student names or grades. The app has no fields for them, and the notes field reminds you not to enter them. Rosters are tracked as a count only.

## Out of scope for v1

Curriculum tracking, push notifications and accounts. Every trip already has class/team tags, so curriculum can be linked to trips later.
