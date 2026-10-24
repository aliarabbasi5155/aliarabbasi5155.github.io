# aliarabbasi5155.github.io

## Local preview

From the repository folder, run:

```sh
./bin/dev
```

The first run installs the required Ruby gems into `vendor/bundle` in this
checkout. Later runs reuse them. Keep the terminal running and open:

- Site: http://127.0.0.1:4000/
- Italian: http://127.0.0.1:4000/it/
- Persian: http://127.0.0.1:4000/fa/
- CMS: http://127.0.0.1:4000/admin/
- Application links: http://127.0.0.1:4000/admin/outreach.html

Jekyll rebuilds changed content and LiveReload refreshes the browser. Restart
the command after editing `_config.yml`. Press Ctrl+C to stop the server.

The repository's `index.html` contains Jekyll front matter, not a finished HTML
page. VS Code **Go Live** / Live Server on port 5500, or `python3 -m http.server`
at the repository root, serves that text directly and cannot render this site.
Use `./bin/dev` for the complete local preview. To use a different port, run
`./bin/dev --port 5501`.

The launcher keeps its compatible Bundler in `vendor/bundler` as well, so the
old Bundler bundled with macOS does not need to be changed.

## Phone and tablet tilt

The opening rings follow device tilt automatically on supported touch devices over
HTTPS, with no enable/disable control. The presence of a permission API does not block
already-allowed readings. If a browser requires explicit permission before sending
readings, clicking the rings requests it through the browser's own prompt; permission
cannot be bypassed. Denied access leaves the usual floating animation. The first sensor
reading sets the neutral holding position, with recalibration after screen rotation
or returning to the opening. Reduced motion disables sensor input, and sensors pause
while the opening is offscreen or the tab is hidden. Sensor data stays on the device.

For a physical-device check, use an HTTPS preview (a phone opening a plain HTTP LAN
address cannot use the sensors). Check left/right and forward/back tilt, landscape,
permission denial, scrolling into the page and back, and the phone's reduced-motion
setting. Desktop mouse interaction remains available. Run the automated checks with
`node --test tests/*.test.mjs`.

## Editing content

All text lives in data files; the page layout is `_layouts/cv.html`.

- CV sections: `_data/<lang>/*.yml` for `en`, `it` and `fa` (one file per section, same structure in every language)
- Blog posts: `_blog/<lang>/<slug>.md` (same slug in every language)
- Menu names, buttons and other site text: `_data/<lang>/ui.yml`
- The languages themselves, their names and their order in the language switches: `languages` in `_config.yml`

The Italian résumé link points to the English PDF until an Italian one is added; change
`resume.url` in `_data/it/profile.yml` to switch it.

### With the CMS

Open [/admin/](https://aliarabbasi5155.github.io/admin/) and choose **Sign In Using Access Token**. Create the token at
GitHub → Settings → Developer settings → Fine-grained tokens, limited to this repository, with
**Contents: Read and write**. Each save is a commit to `master`; GitHub Pages rebuilds the site in a minute or two.

Working locally instead: run `./bin/dev`, open http://127.0.0.1:4000/admin/ in
Chrome or Edge, and choose **Work with Local Repository**. Changes are written
to your source files; Jekyll rebuilds the preview. Commit them as usual.

## Application links and analytics

Open **Application links** from the admin toolbar, or go to `/admin/outreach.html`.
Create a separate record for each application, resume copy or message. Only fixed
UTM labels and a random `r_…` code appear in the generated link. Company names,
recipients, roles and notes stay in this browser's local storage, separate from
the CMS and public repository. Display `Portfolio` in a resume and use the full
generated URL as its hyperlink target.
The public destination comes from `outreach.url` in `_config.yml`, so links
created in the local preview still point to the published site. Local and
published admin pages use separate browser storage; use JSON export/import to
move records between them.

- Export **JSON** regularly. Import it on another browser/device to restore or
  merge records; newer edits win for matching codes. Browser storage does not sync.
- **CSV** exports the private mapping for a spreadsheet. Keep both exports private.
- Opening either admin page excludes this browser from site analytics. The link
  tool has a button to temporarily include it for testing. Reload the public page
  after changing this setting. The admin pages themselves send no analytics.
- This tool does not fetch visit counts from Google. Its workflow statuses are
  entered manually; use GA4 to inspect recorded visits and attention.

`_config.yml` contains the production hostname allowlist and both independent
measurement IDs. The new destination is `G-M1XGN1K27Z`; `G-SN7JFYP48S` remains
enabled alongside it. There is one Google tag loader. Clones and localhost never
load it unless their owner changes the allowlist. Existing clones still have
their old code; their data can continue to reach the old property, not the new one.

Google Analytics loads only after **Allow analytics**. A visitor can withdraw via
**Privacy settings**; Global Privacy Control is also respected. Unknown query
parameters, fragments and referrer paths are removed from the values sent by the
tag. Generated campaign parameters survive switching between languages.
The outreach code is carried through the same browser tab's session after opt-in;
it is not a persistent recipient identity or proof of who opened a link.

### Attention events

| Event | Meaning / parameters |
| --- | --- |
| `section_view` | Section visible in the focused browser tab; `section_name` |
| `section_attention` | Foreground time while content is on screen; incremental `active_seconds` |
| `section_engaged` | One milestone per section per page load: `milestone_seconds` = 10, 30, 60, 120 |
| `section_depth` | Highest visible content depth: `percent_scrolled` = 25, 50, 75, 100 |
| `project_click`, `publication_click` | Link to a public item; `item_id`, `link_kind` |
| `contact_click` | Email/GitHub/LinkedIn link click; `link_kind` (not a message being sent) |
| `article_expand` | Blog post expanded; `item_id` |
| `language_switch` | Language navigation; `target_language` |
| `outbound_click`, `cv_download` | Other external links / document links if present |

All custom events include `page_language`, `section_name`, and, for a tagged
visit, `outreach_id`. Attention excludes hidden tabs, unfocused windows and idle
time after 60 seconds without input/scrolling. It is sampled every second and
reported every 15 seconds, on section changes and on visibility/exit. Small
fractions of a second can be lost on exit; browser/network restrictions can also
prevent final events. Reading time is a useful signal, not proof of interest.

### One-time GA4 setup

In **GitHub Pages New → Admin → Data display → Custom definitions** create
event-scoped dimensions for `outreach_id`, `section_name`, `item_id` and optionally
`link_kind`, `page_language`, `milestone_seconds`, `percent_scrolled`. Create an
event-scoped custom metric with parameter `active_seconds`, unit **Seconds**.
These definitions must be created in the Google account; repository changes
cannot create them. New definitions may take 24–48 hours to appear in reports
and are not retroactive.

In **Explore → Free form**, add the outreach code and section as rows, event
name as columns, and event count as values. Filter by the copied outreach code
to inspect one send. For time spent, use a separate exploration filtered to
`section_attention`, with the custom active-seconds metric. Do not sum automatic
Enhanced Measurement `click` events with the custom click events; they describe
the same interactions in different ways. The link tool includes a Persian guide.

After deploying, allow analytics in a non-excluded browser and use **Realtime**
to check visits. Add `analytics_debug=1` to a site URL for **DebugView**; this
parameter is stripped from reported page URLs. The Google setup screen's
**Retest** can only detect the new tag after deployment and consent, so Realtime
or DebugView is the more useful check if its scanner does not opt in.

Run the dependency-free checks with `node --test tests/*.test.mjs`.
