# Third-party material

## dobrokot/clip_to_psd

- Upstream: <https://github.com/dobrokot/clip_to_psd>
- Pinned commit: `e8db68c768f52ec91ba7530820f52537261cbad0`
- Vendored script SHA-256: `f4a9f3519fdc5974e164023a4bb771488e187370b770d825a28a3a4def33ab29`
- License: MIT; the upstream license is retained beside the vendored source.

The vendored script is intentionally unmodified. The local Python package invokes it as a subprocess and owns validation,
workspace management, PSD inspection, QA, and V-Ronpa pack generation.

The comprehensive `.clip` test fixture is copied from the same pinned repository and remains covered by its MIT license.
