# aliarabbasi5155.github.io

## Editing content

All text lives in data files; the page layout is `_layouts/cv.html`.

- CV sections: `_data/en/*.yml` and `_data/fa/*.yml` (one file per section, same structure in both languages)
- Blog posts: `_blog/en/<slug>.md` and `_blog/fa/<slug>.md` (same slug in both languages)
- Menu names, buttons and other site text: `_data/<lang>/ui.yml`

### With the CMS

Open [/admin/](https://aliarabbasi5155.github.io/admin/) and choose **Sign In Using Access Token**. Create the token at
GitHub → Settings → Developer settings → Fine-grained tokens, limited to this repository, with
**Contents: Read and write**. Each save is a commit to `master`; GitHub Pages rebuilds the site in a minute or two.

Working locally instead: serve the repository (for example `python3 -m http.server`), open `/admin/` in Chrome or
Edge, and choose **Work with Local Repository**. Changes are written to your files; commit them as usual.
