# Agon Rulebooks

Three themed web books (World Lore, Player's Handbook, Historian's Handbook) that use the character sheet's look.

## Put them online
Upload the **`books`** folder from `agon-books-site-v1.2.zip` to the root of the `historian-90.github.io` repo, next to the Owlbear extension files. The library will then be at:

- https://historian-90.github.io/books/index.html
- https://historian-90.github.io/books/player-handbook/index.html (and so on)

## Features
- Contents sidebar that follows your scroll, and search in each book (press `/`; Enter or Shift+Enter jumps between matches)
- Theme button (Auto / Light / Dark), remembered per browser. `?theme=dark` in the URL forces a theme, which will help when embedding in Owlbear.
- Every heading, Affinity, spell, and monster has a stable link, e.g. `player-handbook/index.html#affinity-wrath`, `#spell-belos`, or `historian-handbook/index.html#cerebos`.
- Works on phones (the contents and book switcher move into a drawer) and prints cleanly (browser Print → Save as PDF).

## Editing
The text lives in `source/books/*.md` ("Agon markdown": regular markdown plus `:::note`, `:::gm`, `:::cards`, `:::monster` blocks; see the top of `tools/build.py`). Run `python3 tools/build.py` (needs `pip install markdown`) to rebuild `site/`. Or just ask Claude to make the change.
