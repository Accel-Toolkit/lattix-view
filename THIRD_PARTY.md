# Third-party software shipped with lattix-view

## three.js

`lattix_view/static/vendor/three/` holds the ES module build of three.js and the addons the viewer
uses, taken from the npm package `three` **0.186.0** (r186):

- source: `https://registry.npmjs.org/three/-/three-0.186.0.tgz`
- tarball sha256: `61eeff9d7616005c9a481c796f52287d81fbbbc0d55eaca5565322924252c1aa`
- licence: MIT, Copyright 2010-2026 Three.js Authors (`vendor/three/LICENSE`, the package's own file)

The files are vendored by `tools/vendor_three.py`, which verifies the checksum, rewrites each
addon's bare `from 'three'` import to the relative path of the vendored module (no import map is
needed, so the page can forbid inline scripts), and minifies with esbuild, keeping a banner that
names the version and the licence.  `vendor/three/MANIFEST.json` lists every vendored file with
its sha256; the test suite checks the directory against it.

No other third-party code is shipped.  lattix-view depends on the `lattix` package at run time.
